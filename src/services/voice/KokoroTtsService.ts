import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoragePaths } from '../storage/StoragePaths';

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

/**
 * Same family of assets desktop/Kokoro uses (82M ONNX + voices pack).
 * GitHub release mirrors are used for reliable mobile downloads.
 */
export const KOKORO_ASSETS = {
  engineKey: 'kokoro-engine',
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  minEngineBytes: 75 * 1024 * 1024,
  minVoicesBytes: 20 * 1024 * 1024,
  files: [
    {
      id: 'engine',
      fileName: 'model_quantized.onnx',
      url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx',
      label: 'Kokoro TTS engine',
      minBytes: 75 * 1024 * 1024,
    },
    {
      id: 'voices',
      fileName: 'voices-v1.0.bin',
      url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
      label: 'Heart & Michael voice models',
      minBytes: 20 * 1024 * 1024,
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
  const engineUri = `${cacheDir}${KOKORO_ASSETS.files[0].fileName}`;
  const voicesUri = `${cacheDir}${KOKORO_ASSETS.files[1].fileName}`;
  const engine = await fileInfo(engineUri);
  const voices = await fileInfo(voicesUri);
  const engineInstalled =
    engine.exists && engine.size >= KOKORO_ASSETS.minEngineBytes && voices.exists && voices.size >= KOKORO_ASSETS.minVoicesBytes;

  const installedVoices = await readJson<string[]>(`${cacheDir}${INSTALLED_VOICES_FILE}`, []);
  const heartInstalled =
    engineInstalled && (installedVoices.length === 0 || installedVoices.includes('af_heart'));
  const michaelInstalled =
    engineInstalled && (installedVoices.length === 0 || installedVoices.includes('am_michael'));

  return {
    engineInstalled,
    heartInstalled,
    michaelInstalled,
    fullyInstalled: engineInstalled && heartInstalled && michaelInstalled,
    cacheDir,
    engineBytes: engine.size + voices.size,
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

export function isKokoroDownloadInProgress(): boolean {
  return downloadInProgress;
}

export function cancelKokoroDownload(): void {
  downloadCancelled = true;
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

  const resumable = FileSystem.createDownloadResumable(url, dest, {}, callback);
  const result = await resumable.downloadAsync();
  if (downloadCancelled) throw new Error('Download cancelled.');
  if (!result || result.status !== 200) {
    throw new Error(`Failed to download ${label} (HTTP ${result?.status || 'error'}).`);
  }
  const info = await fileInfo(dest);
  if (!info.exists || info.size < minBytes) {
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    } catch {}
    throw new Error(`${label} download is incomplete. Please retry.`);
  }
}

/**
 * Downloads Kokoro engine + shared voice pack, then marks Heart & Michael installed
 * (same onboarding pair as desktop).
 */
export async function downloadKokoroOnboardingDefaults(
  onProgress?: (p: KokoroDownloadProgress) => void
): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  if (downloadInProgress) {
    return { success: false, error: 'Kokoro download already in progress.' };
  }
  downloadInProgress = true;
  downloadCancelled = false;

  try {
    const cacheDir = await getCacheDir();
    const FileSystem = require('expo-file-system');

    onProgress?.({ phase: 'download', percent: 2, status: 'Preparing Kokoro neural engine…' });

    // Fresh incomplete cache cleanup for engine file only when missing/partial
    for (const asset of KOKORO_ASSETS.files) {
      const dest = `${cacheDir}${asset.fileName}`;
      const info = await fileInfo(dest);
      if (info.exists && info.size < asset.minBytes) {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      }
    }

    const engine = KOKORO_ASSETS.files[0];
    const voices = KOKORO_ASSETS.files[1];
    const engineDest = `${cacheDir}${engine.fileName}`;
    const voicesDest = `${cacheDir}${voices.fileName}`;

    const engineInfo = await fileInfo(engineDest);
    if (!(engineInfo.exists && engineInfo.size >= engine.minBytes)) {
      await downloadFile(engine.url, engineDest, engine.label, engine.minBytes, onProgress, 0, 70);
    } else {
      onProgress?.({ phase: 'download', percent: 70, status: 'Kokoro engine already on device…' });
    }

    if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };

    const voicesInfo = await fileInfo(voicesDest);
    if (!(voicesInfo.exists && voicesInfo.size >= voices.minBytes)) {
      await downloadFile(voices.url, voicesDest, voices.label, voices.minBytes, onProgress, 70, 25);
    } else {
      onProgress?.({ phase: 'download', percent: 95, status: 'Voice models already on device…' });
    }

    if (downloadCancelled) return { success: false, cancelled: true, error: 'Download cancelled.' };

    await writeJson(`${cacheDir}${INSTALLED_VOICES_FILE}`, ['af_heart', 'am_michael']);
    await writeJson(`${cacheDir}${MARKER_FILE}`, {
      modelId: KOKORO_ASSETS.modelId,
      installedAt: new Date().toISOString(),
      voices: ['af_heart', 'am_michael'],
    });

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
  }
}

export async function deleteKokoroAssets(): Promise<void> {
  try {
    const cacheDir = await getCacheDir();
    const FileSystem = require('expo-file-system');
    await FileSystem.deleteAsync(cacheDir, { idempotent: true });
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
