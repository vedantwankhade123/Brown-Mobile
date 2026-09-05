import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { StoragePaths } from '../storage/StoragePaths';
import { KOKORO_HF_ASSETS, resetKokoroOnnxSession } from './KokoroOnnxEngine';

/** Mirrors desktop `voice-tts.js` catalog keys */
export type KokoroVoiceId = 'af_heart' | 'am_michael';
export type KokoroVoiceKey = 'kokoro-heart' | 'kokoro-michael';

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
  for (const asset of KOKORO_ASSETS.files) {
    const info = await fileInfo(`${cacheDir}${asset.fileName}`);
    engineBytes += info.size;
    if (!info.exists || info.size < asset.minBytes) allPresent = false;
  }

  const installedVoices = await readJson<string[]>(`${cacheDir}${INSTALLED_VOICES_FILE}`, []);
  const heartInstalled =
    allPresent && (installedVoices.length === 0 || installedVoices.includes('af_heart'));
  const michaelInstalled =
    allPresent && (installedVoices.length === 0 || installedVoices.includes('am_michael'));

  return {
    engineInstalled: allPresent,
    heartInstalled,
    michaelInstalled,
    fullyInstalled: allPresent && heartInstalled && michaelInstalled,
    cacheDir,
    engineBytes,
  };
}

export async function getActiveKokoroVoice(): Promise<KokoroVoiceId> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_VOICE_KEY);
    if (raw === 'am_michael' || raw === 'af_heart') return raw;
  } catch {}
  return 'af_heart';
}

export async function setActiveKokoroVoice(voiceId: KokoroVoiceId): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_VOICE_KEY, voiceId);
}

export function voiceIdToKey(voiceId: KokoroVoiceId): KokoroVoiceKey {
  return voiceId === 'am_michael' ? 'kokoro-michael' : 'kokoro-heart';
}

export function keyToVoiceId(key: KokoroVoiceKey): KokoroVoiceId {
  return key === 'kokoro-michael' ? 'am_michael' : 'af_heart';
}

let downloadCancelled = false;
let downloadInProgress = false;
let activeResumable: any = null;

export function isKokoroDownloadInProgress(): boolean {
  return downloadInProgress;
}

export function cancelKokoroDownload(): void {
  downloadCancelled = true;
  try {
    activeResumable?.pauseAsync?.();
  } catch {}
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
  const callback = (progressEvent: any) => {
    if (downloadCancelled) return;
    const total = Number(progressEvent?.totalBytesExpectedToWrite || 0);
    const written = Number(progressEvent?.totalBytesWritten || 0);
    const ratio = total > 0 ? written / total : 0;
    const percent = Math.min(99, Math.round(progressOffset + ratio * progressSpan));
    onProgress?.({
      phase: 'download',
      percent,
      status: `Downloading ${label}…`,
      fileLabel: label,
      downloaded: `${(written / (1024 * 1024)).toFixed(1)} MB`,
      total: total > 0 ? `${(total / (1024 * 1024)).toFixed(1)} MB` : undefined,
    });
  };

  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    attempts++;
    if (downloadCancelled) throw new Error('Download cancelled.');
    try {
      const resumable = FileSystem.createDownloadResumable(url, dest, {
        headers: { 'User-Agent': 'BrownAI-Mobile/1.0', 'Accept-Encoding': 'identity' },
      }, callback);
      activeResumable = resumable;
      const result = await resumable.downloadAsync();
      activeResumable = null;
      if (downloadCancelled) throw new Error('Download cancelled.');
      if (!result || (result.status && result.status !== 200)) {
        throw new Error(`Failed to download ${label} (HTTP ${result?.status || 'error'}).`);
      }
      const info = await fileInfo(dest);
      if (!info.exists || info.size < minBytes) {
        try {
          await FileSystem.deleteAsync(dest, { idempotent: true });
        } catch {}
        throw new Error(`${label} download is incomplete. Please retry.`);
      }
      return;
    } catch (err: any) {
      activeResumable = null;
      if (downloadCancelled) throw err;
      const msg = String(err?.message || '');
      const retryable =
        /network|timeout|reset|broken pipe|CANCEL|stream was reset|incomplete/i.test(msg);
      if (retryable && attempts < maxAttempts) {
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
 * Downloads Kokoro ONNX engine + Heart & Michael voice bins (same as desktop HF assets).
 */
export async function downloadKokoroOnboardingDefaults(
  onProgress?: (p: KokoroDownloadProgress) => void
): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  if (downloadInProgress) {
    return { success: false, error: 'Kokoro download already in progress.' };
  }
  downloadInProgress = true;
  downloadCancelled = false;
  await activateKeepAwake();

  try {
    const cacheDir = await getCacheDir();
    const FileSystem = require('expo-file-system');

    onProgress?.({ phase: 'download', percent: 2, status: 'Preparing Kokoro neural engine…' });

    for (const asset of KOKORO_ASSETS.files) {
      const dest = `${cacheDir}${asset.fileName}`;
      const info = await fileInfo(dest);
      if (info.exists && info.size < asset.minBytes) {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      }
    }

    const span = Math.floor(90 / KOKORO_ASSETS.files.length);
    let offset = 5;
    for (const asset of KOKORO_ASSETS.files) {
      if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };
      const dest = `${cacheDir}${asset.fileName}`;
      const info = await fileInfo(dest);
      if (!(info.exists && info.size >= asset.minBytes)) {
        await downloadFile(asset.url, dest, asset.label, asset.minBytes, onProgress, offset, span);
      } else {
        onProgress?.({
          phase: 'download',
          percent: offset + span,
          status: `${asset.label} already on device…`,
        });
      }
      offset += span;
    }

    if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };

    await writeJson(`${cacheDir}${INSTALLED_VOICES_FILE}`, ['af_heart', 'am_michael']);
    await writeJson(`${cacheDir}${MARKER_FILE}`, {
      modelId: KOKORO_ASSETS.modelId,
      installedAt: new Date().toISOString(),
      voices: ['af_heart', 'am_michael'],
      runtime: Platform.OS,
    });
    resetKokoroOnnxSession();

    onProgress?.({
      phase: 'complete',
      percent: 100,
      status: 'Kokoro neural voices ready (Heart & Michael).',
    });
    return { success: true };
  } catch (err: any) {
    if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };
    return { success: false, error: err?.message || 'Kokoro download failed.' };
  } finally {
    downloadInProgress = false;
    downloadCancelled = false;
    activeResumable = null;
    await deactivateKeepAwake();
  }
}

export async function deleteKokoroAssets(): Promise<void> {
  try {
    const cacheDir = await getCacheDir();
    const FileSystem = require('expo-file-system');
    await FileSystem.deleteAsync(cacheDir, { idempotent: true });
    resetKokoroOnnxSession();
  } catch {}
}

export const KokoroTtsService = {
  getKokoroInstallStatus,
  getActiveKokoroVoice,
  setActiveKokoroVoice,
  downloadKokoroOnboardingDefaults,
  deleteKokoroAssets,
  cancelKokoroDownload,
  isKokoroDownloadInProgress,
  KOKORO_VOICES,
};
