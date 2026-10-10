import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { StoragePaths } from '../storage/StoragePaths';
import { KOKORO_HF_ASSETS, resetKokoroOnnxSession } from './KokoroOnnxEngine';
import { backgroundDownloadsAvailable, backgroundDownloadKeys, hasBackgroundDownload, enqueueBackgroundDownload, receiveBackgroundDownload, cancelBackgroundDownloadPrefix, cancelBackgroundDownload } from '../modelManager/BackgroundDownload';

/** Mirrors desktop `voice-tts.js` catalog keys */
export type KokoroVoiceId = 'af_heart' | 'am_michael' | 'bm_george' | 'bm_lewis';
export type KokoroVoiceKey = 'kokoro-heart' | 'kokoro-michael' | 'kokoro-george' | 'kokoro-lewis';

export const KOKORO_VOICES: Array<{
  key: KokoroVoiceKey;
  voiceId: KokoroVoiceId;
  label: string;
  gender: 'female' | 'male';
  description: string;
  sizeEstimate: string;
}> = [
  {
    key: 'kokoro-heart',
    voiceId: 'af_heart',
    label: 'Heart',
    gender: 'female',
    description: 'US female · premium natural tone (best quality)',
    sizeEstimate: '~92 MB shared engine',
  },
  {
    key: 'kokoro-michael',
    voiceId: 'am_michael',
    label: 'Michael',
    gender: 'male',
    description: 'US male · steady, natural conversational voice',
    sizeEstimate: '~92 MB shared engine',
  },
  {
    key: 'kokoro-george',
    voiceId: 'bm_george',
    label: 'George',
    gender: 'male',
    description: 'UK male · warm, easy-going narrator',
    sizeEstimate: '~92 MB shared engine',
  },
  {
    key: 'kokoro-lewis',
    voiceId: 'bm_lewis',
    label: 'Lewis',
    gender: 'male',
    description: 'UK male · crisp, articulate conversational voice',
    sizeEstimate: '~92 MB shared engine',
  },
];

export const KOKORO_ASSETS = {
  engineKey: 'kokoro-engine',
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  minEngineBytes: KOKORO_HF_ASSETS.model.minBytes,
  files: [
    {
      id: 'engine',
      fileName: KOKORO_HF_ASSETS.model.fileName,
      url: KOKORO_HF_ASSETS.model.url,
      label: 'Kokoro TTS engine (ONNX)',
      minBytes: KOKORO_HF_ASSETS.model.minBytes,
    },
    {
      id: 'af_heart',
      fileName: KOKORO_HF_ASSETS.voices.af_heart.fileName,
      url: KOKORO_HF_ASSETS.voices.af_heart.url,
      label: 'Heart voice model',
      minBytes: KOKORO_HF_ASSETS.voices.af_heart.minBytes,
    },
    {
      id: 'am_michael',
      fileName: KOKORO_HF_ASSETS.voices.am_michael.fileName,
      url: KOKORO_HF_ASSETS.voices.am_michael.url,
      label: 'Michael voice model',
      minBytes: KOKORO_HF_ASSETS.voices.am_michael.minBytes,
    },
    {
      id: 'bm_george',
      fileName: KOKORO_HF_ASSETS.voices.bm_george.fileName,
      url: KOKORO_HF_ASSETS.voices.bm_george.url,
      label: 'George voice model',
      minBytes: KOKORO_HF_ASSETS.voices.bm_george.minBytes,
    },
    {
      id: 'bm_lewis',
      fileName: KOKORO_HF_ASSETS.voices.bm_lewis.fileName,
      url: KOKORO_HF_ASSETS.voices.bm_lewis.url,
      label: 'Lewis voice model',
      minBytes: KOKORO_HF_ASSETS.voices.bm_lewis.minBytes,
    },
    {
      id: 'tokenizer',
      fileName: KOKORO_HF_ASSETS.tokenizer.fileName,
      url: KOKORO_HF_ASSETS.tokenizer.url,
      label: 'Kokoro tokenizer',
      minBytes: KOKORO_HF_ASSETS.tokenizer.minBytes,
    },
  ],
} as const;

const ACTIVE_VOICE_KEY = '@brown/kokoro_active_voice';
const INSTALLED_VOICES_FILE = 'installed-voices.json';
const MARKER_FILE = '.kokoro-installed';

export type KokoroDownloadProgress = {
  phase: 'download' | 'complete' | 'error';
  percent: number;
  status: string;
  downloaded?: string;
  total?: string;
  fileLabel?: string;
};

export type KokoroInstallStatus = {
  engineInstalled: boolean;
  heartInstalled: boolean;
  michaelInstalled: boolean;
  georgeInstalled: boolean;
  lewisInstalled: boolean;
  fullyInstalled: boolean;
  cacheDir: string;
  engineBytes: number;
};

async function getCacheDir(): Promise<string> {
  const models = await StoragePaths.getModelsDir();
  const dir = `${models}tts-cache/${KOKORO_ASSETS.engineKey}/`;
  await StoragePaths.ensureDir(dir);
  return dir;
}

async function fileInfo(uri: string): Promise<{ exists: boolean; size: number }> {
  try {
    const FileSystem = require('expo-file-system');
    const info = await FileSystem.getInfoAsync(uri);
    return { exists: !!info?.exists, size: Number(info?.size || 0) };
  } catch {
    return { exists: false, size: 0 };
  }
}

async function readJson<T>(uri: string, fallback: T): Promise<T> {
  try {
    const FileSystem = require('expo-file-system');
    const info = await FileSystem.getInfoAsync(uri);
    if (!info?.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(uri);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(uri: string, data: unknown): Promise<void> {
  const FileSystem = require('expo-file-system');
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 2));
}

export async function getKokoroInstallStatus(): Promise<KokoroInstallStatus> {
  const cacheDir = await getCacheDir();
  let engineBytes = 0;
  let allPresent = true;
  const present: Record<string, boolean> = {};
  for (const asset of KOKORO_ASSETS.files) {
    const info = await fileInfo(`${cacheDir}${asset.fileName}`);
    engineBytes += info.size;
    present[asset.id] = info.exists && info.size >= asset.minBytes;
    if (!info.exists || info.size < asset.minBytes) allPresent = false;
  }

  const engineInstalled = !!(present.engine && present.tokenizer);
  const voiceOk = (id: KokoroVoiceId) =>
    engineInstalled && !!present[id];
  const heartInstalled = voiceOk('af_heart');
  const michaelInstalled = voiceOk('am_michael');
  const georgeInstalled = voiceOk('bm_george');
  const lewisInstalled = voiceOk('bm_lewis');

  return {
    engineInstalled,
    heartInstalled,
    michaelInstalled,
    georgeInstalled,
    lewisInstalled,
    fullyInstalled: allPresent,
    cacheDir,
    engineBytes,
  };
}

export async function getActiveKokoroVoice(): Promise<KokoroVoiceId> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_VOICE_KEY);
    if (KOKORO_VOICES.some((v) => v.voiceId === raw)) return raw as KokoroVoiceId;
  } catch {}
  return 'af_heart';
}

export async function setActiveKokoroVoice(voiceId: KokoroVoiceId): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_VOICE_KEY, voiceId);
}

export function voiceIdToKey(voiceId: KokoroVoiceId): KokoroVoiceKey {
  return KOKORO_VOICES.find((v) => v.voiceId === voiceId)?.key ?? 'kokoro-heart';
}

export function keyToVoiceId(key: KokoroVoiceKey): KokoroVoiceId {
  return KOKORO_VOICES.find((v) => v.key === key)?.voiceId ?? 'af_heart';
}

let downloadCancelled = false;
let downloadInProgress = false;
let activeResumable: any = null;
let lastProgress: KokoroDownloadProgress | null = null;
let activeDownloadTask: string | null = null;
export function getKokoroDownloadState() {
  return { busy: downloadInProgress, task: activeDownloadTask, progress: lastProgress };
}

export function isKokoroDownloadInProgress(): boolean {
  return downloadInProgress;
}

export async function cancelKokoroDownload(task?: string): Promise<void> {
  if (task && (!downloadInProgress || activeDownloadTask !== task)) return;
  downloadCancelled = true;
  await cancelBackgroundDownloadPrefix('kokoro:');
  if (activeResumable?.cancelAsync) await activeResumable.cancelAsync();
  else await activeResumable?.pauseAsync?.();
}

export function isKokoroVoiceInstalled(status: KokoroInstallStatus, voiceId: KokoroVoiceId): boolean {
  const keys = { af_heart: 'heartInstalled', am_michael: 'michaelInstalled', bm_george: 'georgeInstalled', bm_lewis: 'lewisInstalled' } as const;
  return status[keys[voiceId]];
}

export async function stopKokoroForAccountDeletion(): Promise<void> {
  await cancelKokoroDownload();
  const deadline = Date.now() + 15000;
  while (downloadInProgress) {
    if (Date.now() > deadline) throw new Error('A voice download is still stopping. Retry deletion.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  resetKokoroOnnxSession();
}

async function activateKeepAwake(): Promise<void> {
  try {
    const KeepAwake = require('expo-keep-awake');
    if (KeepAwake?.activateKeepAwakeAsync) await KeepAwake.activateKeepAwakeAsync('kokoro-download');
    else if (KeepAwake?.activateKeepAwake) KeepAwake.activateKeepAwake('kokoro-download');
  } catch {}
}

async function deactivateKeepAwake(): Promise<void> {
  try {
    const KeepAwake = require('expo-keep-awake');
    if (KeepAwake?.deactivateKeepAwake) KeepAwake.deactivateKeepAwake('kokoro-download');
  } catch {}
}

async function downloadFile(
  url: string,
  dest: string,
  label: string,
  minBytes: number,
  onProgress?: (p: KokoroDownloadProgress) => void,
  progressOffset = 0,
  progressSpan = 100
): Promise<void> {
  const FileSystem = require('expo-file-system');
  const partialDest = `${dest}.part`;
  let lastWritten = 0, lastAdvance = Date.now();
  const callback = (progressEvent: any) => {
    if (downloadCancelled) return;
    const total = Number(progressEvent?.totalBytesExpectedToWrite || 0);
    const written = Number(progressEvent?.totalBytesWritten || 0);
    if (written > lastWritten) { lastWritten = written; lastAdvance = Date.now(); }
    const ratio = written / (total > 0 ? total : minBytes);
    const percent = Math.min(99, Math.round(progressOffset + ratio * progressSpan));
    onProgress?.({
      phase: 'download',
      percent,
      status: `Downloading ${label}…`,
      fileLabel: label,
      downloaded: `${(written / (1024 * 1024)).toFixed(1)} MB`,
      total: `${((total > 0 ? total : minBytes) / (1024 * 1024)).toFixed(1)} MB`,
    });
  };

  if (backgroundDownloadsAvailable()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await receiveBackgroundDownload(`kokoro:${dest}`, partialDest, minBytes,
          () => downloadCancelled, callback, state => onProgress?.({ phase: 'download', percent: lastProgress?.percent || Math.round(progressOffset), fileLabel: label, status: state, downloaded: lastProgress?.downloaded, total: lastProgress?.total }), minBytes < 1024 * 1024 ? 15000 : 30000);
        if (downloadCancelled) throw new Error('Download cancelled.');
        await FileSystem.moveAsync({ from: result.uri, to: dest });
        return;
      } catch (error: any) {
        if (downloadCancelled || /storage|private|gated|no longer available/i.test(error?.message || '')) throw error;
        await cancelBackgroundDownload(`kokoro:${dest}`);
        if (downloadCancelled) throw new Error('Download cancelled.');
        if (attempt >= 1) {
          onProgress?.({ phase: 'download', percent: Math.round(progressOffset), status: `Android download stalled. Switching to direct download for ${label}…` });
          await activateKeepAwake();
          break;
        }
        onProgress?.({ phase: 'download', percent: Math.round(progressOffset), status: `Retrying ${label} (${attempt + 2}/3)…` });
        await enqueueBackgroundDownload(`kokoro:${dest}`, url, label);
      }
    }
  }

  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    attempts++;
    if (downloadCancelled) throw new Error('Download cancelled.');
    try {
      let finalUrl = url;
      if (finalUrl.includes('huggingface.co') && !finalUrl.includes('download=true')) {
        finalUrl = finalUrl.includes('?') ? `${finalUrl}&download=true` : `${finalUrl}?download=true`;
      }
      if (finalUrl.includes('huggingface.co')) finalUrl += `${finalUrl.includes('?') ? '&' : '?'}brown_retry=${Date.now()}-${attempts}`;
      await FileSystem.deleteAsync(partialDest, { idempotent: true });
      lastWritten = 0; lastAdvance = Date.now();
      const startedAt = lastAdvance;
      const resumable = FileSystem.createDownloadResumable(finalUrl, partialDest, {
        sessionType: FileSystem.FileSystemSessionType?.BACKGROUND,
        headers: { 'User-Agent': 'BrownAI-Mobile/1.0', 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' },
      }, callback);
      activeResumable = resumable;
      const transfer = resumable.downloadAsync();
      let watchdog: ReturnType<typeof setInterval> | undefined;
      const stalled = new Promise<never>((_, reject) => {
        watchdog = setInterval(() => {
          const now = Date.now();
          if (now - lastAdvance > 30000 || now - startedAt > (minBytes < 1024 * 1024 ? 90000 : 600000)) {
            reject(new Error(`${label} download stalled. Retrying with a fresh connection.`));
          }
        }, 1000);
      });
      let result;
      try {
        result = await Promise.race([transfer, stalled]);
      } catch (error) {
        // Stop and settle the writer before deleting/reusing its partial file.
        if (resumable.cancelAsync) await resumable.cancelAsync();
        else await resumable.pauseAsync();
        await transfer.catch(() => {});
        throw error;
      } finally {
        if (watchdog) clearInterval(watchdog);
      }
      activeResumable = null;
      if (downloadCancelled) throw new Error('Download cancelled.');
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error(`Failed to download ${label} (HTTP ${result?.status || 'error'}).`);
      }
      const info = await fileInfo(partialDest);
      const contentLength = Number(Object.entries(result.headers || {}).find(([key]) => key.toLowerCase() === 'content-length')?.[1] || 0);
      if (!info.exists || info.size < minBytes || (contentLength > 0 && info.size !== contentLength)) {
        try {
          await FileSystem.deleteAsync(partialDest, { idempotent: true });
        } catch {}
        throw new Error(`${label} download is incomplete. Please retry.`);
      }
      await FileSystem.moveAsync({ from: partialDest, to: dest });
      return;
    } catch (err: any) {
      activeResumable = null;
      await FileSystem.deleteAsync(partialDest, { idempotent: true }).catch(() => {});
      if (downloadCancelled) throw err;
      const msg = String(err?.message || '');
      const retryable =
        /network|timeout|stalled|reset|broken pipe|CANCEL|stream was reset|incomplete|HTTP (403|408|429|5\d\d)/i.test(msg);
      if (retryable && attempts < maxAttempts) {
        onProgress?.({ phase: 'download', percent: Math.round(progressOffset), fileLabel: label, status: `Retrying ${label} (${attempts + 1}/${maxAttempts})…` });
        // Wait until app is active again (phone may have slept)
        if (AppState.currentState !== 'active') {
          await new Promise<void>((resolve) => {
            const sub = AppState.addEventListener('change', (s: string) => {
              if (s === 'active') {
                sub.remove();
                resolve();
              }
            });
            setTimeout(() => {
              try { sub.remove(); } catch {}
              resolve();
            }, 15000);
          });
        }
        await new Promise((r) => setTimeout(r, 1200 * attempts));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Compatibility entry point: installs the shared engine only. Voices are opt-in.
 */
export async function downloadKokoroOnboardingDefaults(
  onProgress?: (p: KokoroDownloadProgress) => void
): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  return downloadKokoroEngine(onProgress);
}

export async function downloadKokoroEngine(onProgress?: (p: KokoroDownloadProgress) => void) {
  return downloadAssets(KOKORO_ASSETS.files.filter(asset => asset.id === 'engine' || asset.id === 'tokenizer'), onProgress);
}

export async function downloadKokoroVoice(voiceId: KokoroVoiceId, onProgress?: (p: KokoroDownloadProgress) => void) {
  if (!(await getKokoroInstallStatus()).engineInstalled) return { success: false, error: 'Download the Kokoro engine first.' };
  return downloadAssets(KOKORO_ASSETS.files.filter(asset => asset.id === voiceId), onProgress);
}

async function downloadAssets(
  assets: ReadonlyArray<(typeof KOKORO_ASSETS.files)[number]>,
  onProgress?: (p: KokoroDownloadProgress) => void
): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  if (downloadInProgress) {
    return { success: false, error: 'Kokoro download already in progress.' };
  }
  downloadInProgress = true;
  downloadCancelled = false;
  activeDownloadTask = assets.some(asset => asset.id === 'engine' || asset.id === 'tokenizer') ? 'engine' : assets[0]?.id || null;
  lastProgress = null;
  const notify = onProgress;
  onProgress = progress => { lastProgress = progress; notify?.(progress); };
  if (!backgroundDownloadsAvailable()) await activateKeepAwake();
  const newFiles: string[] = [];

  try {
    const cacheDir = await getCacheDir();
    const FileSystem = require('expo-file-system');

    onProgress?.({ phase: 'download', percent: 2, status: 'Preparing Kokoro neural engine…' });

    for (const asset of assets) {
      const dest = `${cacheDir}${asset.fileName}`;
      const info = await fileInfo(dest);
      if (info.exists && info.size < asset.minBytes) {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      }
    }

    const totalBytes = assets.reduce((sum, asset) => sum + asset.minBytes, 0);
    // Enqueue the entire selected set before waiting for JS progress. All files
    // can finish while the screen is off, including tokenizer and voice bins.
    for (const asset of assets) {
      if (downloadCancelled) throw new Error('Download cancelled.');
      const dest = `${cacheDir}${asset.fileName}`;
      const info = await fileInfo(dest);
      if (!(info.exists && info.size >= asset.minBytes)) {
        newFiles.push(dest);
        if (backgroundDownloadsAvailable()) await enqueueBackgroundDownload(`kokoro:${dest}`, asset.url, asset.label);
      }
    }
    let offset = 5;
    for (const asset of assets) {
      const span = 94 * asset.minBytes / totalBytes;
      if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };
      const dest = `${cacheDir}${asset.fileName}`;
      const info = await fileInfo(dest);
      if (!(info.exists && info.size >= asset.minBytes)) {
        await downloadFile(asset.url, dest, asset.label, asset.minBytes, onProgress, offset, span);
      } else {
        onProgress?.({
          phase: 'download',
          percent: Math.min(99, Math.round(offset + span)),
          status: `${asset.label} already on device…`,
        });
      }
      offset += span;
    }

    if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };

    const status = await getKokoroInstallStatus();
    const installedVoiceIds = KOKORO_VOICES.filter(v => isKokoroVoiceInstalled(status, v.voiceId)).map(v => v.voiceId);
    await writeJson(`${cacheDir}${INSTALLED_VOICES_FILE}`, installedVoiceIds);
    await writeJson(`${cacheDir}${MARKER_FILE}`, {
      modelId: KOKORO_ASSETS.modelId,
      installedAt: new Date().toISOString(),
      voices: installedVoiceIds,
      runtime: Platform.OS,
    });
    resetKokoroOnnxSession();

    onProgress?.({
      phase: 'complete',
      percent: 100,
      downloaded: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
      total: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
      status: assets.some(asset => asset.id === 'engine') && assets.length === 2 ? 'Kokoro engine downloaded.' : 'Kokoro voice download complete.',
    });
    return { success: true };
  } catch (err: any) {
    if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };
    await cancelBackgroundDownloadPrefix('kokoro:');
    return { success: false, error: err?.message || 'Kokoro download failed.' };
  } finally {
    try {
    if (downloadCancelled) {
      await cancelBackgroundDownloadPrefix('kokoro:');
      const FileSystem = require('expo-file-system');
      for (const dest of newFiles) {
        for (const target of [dest, `${dest}.part`, `${dest}.part.background-part`]) {
          await FileSystem.deleteAsync(target, { idempotent: true });
        }
      }
    }
    } finally {
    downloadInProgress = false;
    activeDownloadTask = null;
    downloadCancelled = false;
    activeResumable = null;
    await deactivateKeepAwake();
    }
  }
}

export async function deleteKokoroAssets(): Promise<void> {
    await stopKokoroForAccountDeletion();
    const cacheDir = await getCacheDir();
    const FileSystem = require('expo-file-system');
    await FileSystem.deleteAsync(cacheDir, { idempotent: true });
    resetKokoroOnnxSession();
}

export async function resumePendingKokoroDownloads(): Promise<void> {
  if (!backgroundDownloadsAvailable() || downloadInProgress) return;
  const keys = await backgroundDownloadKeys();
  const cache = await getCacheDir();
  const pending = KOKORO_ASSETS.files.filter(asset => keys.includes(`kokoro:${cache}${asset.fileName}`));
  const live = [];
  for (const asset of pending) {
    if (await hasBackgroundDownload(`kokoro:${cache}${asset.fileName}`)) live.push(asset);
  }
  if (live.length && !downloadCancelled) await downloadAssets(live);
}

export const KokoroTtsService = {
  getKokoroInstallStatus,
  getActiveKokoroVoice,
  setActiveKokoroVoice,
  downloadKokoroOnboardingDefaults,
  downloadKokoroEngine,
  downloadKokoroVoice,
  deleteKokoroAssets,
  cancelKokoroDownload,
  isKokoroDownloadInProgress,
  KOKORO_VOICES,
};
