import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
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
    throw new Error(`GitHub releases API failed (${response.status}): ${body.slice(0, 180)}`);
  }

  return (await response.json()) as GitHubReleasePayload;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = getCurrentAppVersion();
  const release = await fetchLatestGitHubRelease();
  const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '').trim() || currentVersion;
  const apk = pickApkAsset(release.assets);
  const available = isNewerVersion(latestVersion, currentVersion);

  await AsyncStorage.setItem(UPDATE_CONFIG.STORAGE_KEYS.LAST_CHECK_AT, String(Date.now()));

  return {
    available,
    currentVersion,
    latestVersion,
    releaseNotes: String(release.body || '').trim() || 'Bug fixes and performance improvements.',
    releaseName: String(release.name || `v${latestVersion}`),
    htmlUrl: String(release.html_url || `https://github.com/${UPDATE_CONFIG.GITHUB_OWNER}/${UPDATE_CONFIG.GITHUB_REPO}/releases`),
    apkDownloadUrl: apk?.browser_download_url || null,
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
 * Opens the APK download. On Android, prefers downloading to cache then launching
 * the system package installer; falls back to opening the download URL.
 */
export async function installOrOpenApkUpdate(downloadUrl: string): Promise<'installer' | 'browser'> {
  if (!downloadUrl) throw new Error('No APK download URL available for this release.');

  if (Platform.OS !== 'android') {
    const opened = await Linking.openURL(downloadUrl);
    if (!opened) throw new Error('Unable to open the download link.');
    return 'browser';
  }

  try {
    const fileName = `brown-update-${Date.now()}.apk`;
    const target = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
    const result = await FileSystem.downloadAsync(downloadUrl, target);
    if (result.status !== 200) {
      throw new Error(`APK download failed with HTTP ${result.status}`);
    }

    // Prefer content URI + VIEW intent when available (dev client / release builds)
    try {
      const IntentLauncher = require('expo-intent-launcher');
      if (IntentLauncher?.startActivityAsync && FileSystem.getContentUriAsync) {
        const contentUri = await FileSystem.getContentUriAsync(result.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: 'application/vnd.android.package-archive',
        });
        return 'installer';
      }
    } catch {
      // Fall through to browser / download manager
    }

    await Linking.openURL(downloadUrl);
    return 'browser';
  } catch (err) {
    // Last resort: open release asset URL so the system download manager handles it
    const canOpen = await Linking.canOpenURL(downloadUrl);
    if (canOpen) {
      await Linking.openURL(downloadUrl);
      return 'browser';
    }
    throw err;
  }
}

export const GitHubUpdateService = {
  checkForAppUpdate,
  getCurrentAppVersion,
  isNewerVersion,
  parseSemver,
  installOrOpenApkUpdate,
  getAutoCheckEnabled,
  setAutoCheckEnabled,
  wasVersionDismissed,
  dismissUpdateVersion,
  shouldAutoCheckNow,
};
