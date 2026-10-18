import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { nativeApplicationVersion } from 'expo-application';
import { UPDATE_CONFIG, getLatestReleaseApiUrl } from './updateConfig';

// RN/Expo typings in this project are incomplete for Linking / FileSystem APIs
const Linking = require('react-native').Linking as {
  openURL: (url: string) => Promise<any>;
  canOpenURL: (url: string) => Promise<boolean>;
};
const FileSystem = require('expo-file-system') as any;

export interface AppUpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseName: string;
  htmlUrl: string;
  apkDownloadUrl: string | null;
  /** APK asset size in bytes (GitHub reports it), null when the release has none */
  apkSizeBytes: number | null;
  publishedAt: string | null;
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type?: string;
  size?: number;
}

interface GitHubReleasePayload {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

/** Normalize tags like v1.0.1 / 1.0.1-beta → comparable parts */
export function parseSemver(version: string): number[] {
  const cleaned = String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .trim();
  const parts = cleaned.split('.').map((p) => {
    const n = parseInt(p.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 4);
}

/** Returns true when latest > current */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const lv = a[i] || 0;
    const cv = b[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export function getCurrentAppVersion(): string {
  const fromExpo =
    nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    (Constants as any).manifest?.version ||
    (Constants as any).manifest2?.extra?.expoClient?.version;
  if (fromExpo && String(fromExpo).trim()) return String(fromExpo).trim().replace(/^v/i, '');
  return '1.0.0';
}

function pickApkAsset(assets: GitHubReleaseAsset[] | undefined): GitHubReleaseAsset | null {
  if (!assets || !assets.length) return null;

  // Never select desktop installers — releases may contain both .exe and .apk
  const apkAssets = assets.filter((a) => {
    const name = (a.name || '').toLowerCase();
    const type = (a.content_type || '').toLowerCase();
    if (name.endsWith('.exe') || name.endsWith('.msi') || name.endsWith('.dmg') || name.endsWith('.appimage')) {
      return false;
    }
    if (type.includes('x-msdownload') || type.includes('msix') || type.includes('executable')) {
      return false;
    }
    return name.endsWith('.apk') || type.includes('android.package-archive') || (type.includes('octet-stream') && name.includes('apk'));
  });
  if (!apkAssets.length) return null;

  const hints = UPDATE_CONFIG.APK_NAME_HINTS.map((h) => h.toLowerCase());
  const scored = apkAssets
    .map((asset) => {
      const name = asset.name.toLowerCase();
      let score = 0;
      if (name.endsWith('.apk')) score += 10;
      hints.forEach((hint) => {
        if (hint === '.apk') return;
        if (name.includes(hint)) score += 3;
      });
      if (name.includes('setup') || name.includes('windows') || name.includes('desktop')) score -= 8;
      return { asset, score };
    })
    .sort((x, y) => y.score - x.score);

  return scored[0]?.asset || apkAssets[0];
}

export async function fetchLatestGitHubRelease(): Promise<GitHubReleasePayload> {
  const url = getLatestReleaseApiUrl();
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Brown-Mobile-UpdateChecker',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Update service request failed (${response.status}): ${body.slice(0, 180)}`);
  }

  return (await response.json()) as GitHubReleasePayload;
}

/** Prefer version embedded in APK asset name (unified desktop+mobile releases share one tag). */
export function extractMobileVersionFromApkName(assetName: string | undefined | null): string | null {
  const name = String(assetName || '');
  const mobileMatch = name.match(/mobile[\s._-]*v?(\d+(?:\.\d+){1,3})/i);
  if (mobileMatch?.[1]) return mobileMatch[1];
  const trailing = name.match(/v(\d+(?:\.\d+){1,3})\.apk$/i);
  if (trailing?.[1] && /mobile|android/i.test(name)) return trailing[1];
  return null;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = getCurrentAppVersion();
  const saved = await getDownloadedApkUpdate();
  if (saved?.update && isNewerVersion(saved.update.latestVersion, currentVersion)) return { ...saved.update, currentVersion, available: true };
  const release = await fetchLatestGitHubRelease();
  const apk = pickApkAsset(release.assets);
  const fromApk = extractMobileVersionFromApkName(apk?.name);
  const latestVersion =
    fromApk ||
    String(release.tag_name || release.name || '')
      .replace(/^v/i, '')
      .trim() ||
    currentVersion;
  const available = Boolean(apk) && isNewerVersion(latestVersion, currentVersion);

  await AsyncStorage.setItem(UPDATE_CONFIG.STORAGE_KEYS.LAST_CHECK_AT, String(Date.now()));

  return {
    available,
    currentVersion,
    latestVersion,
    releaseNotes: String(release.body || '').trim() || 'Bug fixes and performance improvements.',
    releaseName: String(release.name || `v${latestVersion}`),
    htmlUrl: String(release.html_url || `https://github.com/${UPDATE_CONFIG.GITHUB_OWNER}/${UPDATE_CONFIG.GITHUB_REPO}/releases`),
    apkDownloadUrl: apk?.browser_download_url || null,
    apkSizeBytes: Number(apk?.size) > 0 ? Number(apk?.size) : null,
    publishedAt: release.published_at || null,
  };
}

export async function getAutoCheckEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(UPDATE_CONFIG.STORAGE_KEYS.AUTO_CHECK);
  if (raw == null) return true;
  return raw === 'true';
}

export async function setAutoCheckEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(UPDATE_CONFIG.STORAGE_KEYS.AUTO_CHECK, enabled ? 'true' : 'false');
}

export async function wasVersionDismissed(version: string): Promise<boolean> {
  const dismissed = await AsyncStorage.getItem(UPDATE_CONFIG.STORAGE_KEYS.DISMISSED_VERSION);
  return Boolean(dismissed && dismissed === version.replace(/^v/i, ''));
}

export async function dismissUpdateVersion(version: string): Promise<void> {
  await AsyncStorage.setItem(UPDATE_CONFIG.STORAGE_KEYS.DISMISSED_VERSION, version.replace(/^v/i, ''));
}

export async function shouldAutoCheckNow(): Promise<boolean> {
  const enabled = await getAutoCheckEnabled();
  if (!enabled) return false;
  const last = await AsyncStorage.getItem(UPDATE_CONFIG.STORAGE_KEYS.LAST_CHECK_AT);
  if (!last) return true;
  const elapsedMs = Date.now() - Number(last);
  const cooldownMs = UPDATE_CONFIG.AUTO_CHECK_COOLDOWN_HOURS * 60 * 60 * 1000;
  return !Number.isFinite(elapsedMs) || elapsedMs >= cooldownMs;
}

/**
 * downloadAsync() exposes no progress hook, so the resumable task API is used for
 * byte-level callbacks; it falls back to a plain download when unavailable.
 */
async function downloadWithProgress(
  downloadUrl: string,
  target: string,
  onProgress?: (writtenBytes: number, totalBytes: number) => void
): Promise<{ status: number; uri: string }> {
  if (!onProgress || typeof FileSystem.createDownloadResumable !== 'function') {
    return await FileSystem.downloadAsync(downloadUrl, target);
  }
  const task = FileSystem.createDownloadResumable(
    downloadUrl,
    target,
    {},
    (progress: any) => {
      const data = progress?.totalBytesWritten !== undefined ? progress : progress?.data;
      if (!data) return;
      onProgress(Number(data.totalBytesWritten) || 0, Number(data.totalBytesExpectedToWrite) || 0);
    }
  );
  const result = await task.downloadAsync();
  if (!result) throw new Error('The update download did not start.');
  return result;
}

const APK_CACHE_KEY = '@brown/downloaded-update/v1';
interface SavedApk { uri: string; url: string; size: number; md5: string; update?: AppUpdateInfo; }
let apkDownload: Promise<SavedApk> | null = null;

export async function getDownloadedApkUpdate(url?: string, version?: string): Promise<SavedApk | null> {
  const raw = await AsyncStorage.getItem(APK_CACHE_KEY);
  if (!raw) return null;
  let saved: SavedApk;
  try { saved = JSON.parse(raw); } catch { return null; }
  if (!saved || typeof saved !== 'object') return null;
  const root = `${FileSystem.documentDirectory}updates/`;
  if (!saved.uri?.startsWith(root) || saved.uri.slice(root.length).includes('/') || !saved.md5) return null;
  if (url && saved.url !== url) return null;
  if (version && saved.update?.latestVersion !== version) return null;
  const info = await FileSystem.getInfoAsync(saved.uri, { md5: true });
  if (!info.exists || info.isDirectory || info.size !== saved.size || info.md5 !== saved.md5) return null;
  return saved;
}

export async function downloadApkUpdate(update: AppUpdateInfo, onProgress?: (written: number, total: number) => void): Promise<SavedApk> {
  const url = update.apkDownloadUrl;
  if (!url) throw new Error('No APK is attached to this release.');
  if (apkDownload) { await apkDownload; return downloadApkUpdate(update, onProgress); }
  apkDownload = (async () => {
    const saved = await getDownloadedApkUpdate(url);
    if (saved && saved.update?.latestVersion === update.latestVersion && (!update.apkSizeBytes || saved.size === update.apkSizeBytes)) return saved;
    if (!FileSystem.documentDirectory) throw new Error('Update storage is unavailable.');
    const root = `${FileSystem.documentDirectory}updates/`;
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    const uri = `${root}brown-${Date.now()}.apk`;
    const partial = `${uri}.part`;
    try {
      const result = await downloadWithProgress(url, partial, onProgress);
      if (result.status !== 200) throw new Error(`Update download failed (HTTP ${result.status}).`);
      const info = await FileSystem.getInfoAsync(partial, { md5: true });
      if (!info.exists || !info.size || !info.md5 || (update.apkSizeBytes && info.size !== update.apkSizeBytes)) throw new Error('The update download is incomplete. Please retry.');
      await FileSystem.moveAsync({ from: partial, to: uri });
      const entry: SavedApk = { uri, url, size: info.size, md5: info.md5, update };
      await AsyncStorage.setItem(APK_CACHE_KEY, JSON.stringify(entry));
      return entry;
    } finally { await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {}); }
  })();
  try { return await apkDownload; } finally { apkDownload = null; }
}

export async function installDownloadedApkUpdate(downloadUrl: string, version?: string): Promise<void> {
  const saved = await getDownloadedApkUpdate(downloadUrl, version);
  if (!saved) throw new Error('The saved update is missing or damaged. Download it again.');
  try {
    const IntentLauncher = require('expo-intent-launcher');
    const contentUri = await FileSystem.getContentUriAsync(saved.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri, flags: 1, type: 'application/vnd.android.package-archive',
    });
  } catch { throw new Error('Installation could not open. Your update is saved. Return here and tap Update now to retry.'); }
}

export async function installOrOpenApkUpdate(downloadUrl: string, onProgress?: (written: number, total: number) => void): Promise<'installer' | 'browser'> {
  if (Platform.OS !== 'android') { await Linking.openURL(downloadUrl); return 'browser'; }
  const saved = await getDownloadedApkUpdate(downloadUrl);
  if (!saved) throw new Error('Download the update before installing.');
  await installDownloadedApkUpdate(downloadUrl);
  return 'installer';
}

export const GitHubUpdateService = {
  checkForAppUpdate,
  getCurrentAppVersion,
  isNewerVersion,
  parseSemver,
  extractMobileVersionFromApkName,
  installOrOpenApkUpdate,
  getAutoCheckEnabled,
  setAutoCheckEnabled,
  wasVersionDismissed,
  dismissUpdateVersion,
  shouldAutoCheckNow,
};
