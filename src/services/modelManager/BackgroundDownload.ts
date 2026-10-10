import { Platform } from 'react-native';

type Snapshot = { status: 'missing' | 'downloading' | 'waiting' | 'complete' | 'error'; bytes: number; total: number; uri?: string; reason?: number };
type NativeDownloads = {
  start(key: string, url: string, label: string): Promise<Snapshot>;
  status(key: string): Promise<Snapshot>;
  cancel(key: string): Promise<void>;
  keys(): Promise<string[]>;
};
let native: NativeDownloads | null | undefined;
function getNativeDownloads(): NativeDownloads | null {
  if (native !== undefined) return native;
  try {
    native = Platform.OS === 'android' ? require('expo-modules-core').requireOptionalNativeModule('BrownDownloads') : null;
  } catch { native = null; }
  return native || null;
}
export const backgroundDownloadsAvailable = () => !!getNativeDownloads();
export async function hasBackgroundDownload(key: string): Promise<boolean> {
  const state = await getNativeDownloads()?.status(key);
  return !!state && state.status !== 'missing' && state.status !== 'error';
}
export async function backgroundDownloadBytes(key: string): Promise<number> {
  const state = await getNativeDownloads()?.status(key);
  return state && state.status !== 'missing' && state.status !== 'error' ? Math.max(0, state.bytes || 0) : 0;
}
export async function enqueueBackgroundDownload(key: string, url: string, label: string): Promise<void> {
  const native = getNativeDownloads();
  if (!native) throw new Error('Background downloads require the updated Android app.');
  await native.start(key, url, label);
}
export async function cancelBackgroundDownload(key: string): Promise<void> {
  await getNativeDownloads()?.cancel(key);
}
export async function cancelBackgroundDownloadPrefix(prefix: string): Promise<void> {
  const native = getNativeDownloads();
  if (!native) return;
  const keys = await native.keys();
  await Promise.all(keys.filter(key => key.startsWith(prefix)).map(key => native.cancel(key)));
}
export async function backgroundDownloadKeys(): Promise<string[]> {
  return await getNativeDownloads()?.keys() || [];
}

// Only observation is on the JS timer. The transfer itself belongs to Android.
export async function receiveBackgroundDownload(
  key: string, dest: string, minBytes: number, cancelled: () => boolean,
  progress: (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  onWaiting?: (message: string) => void,
  stallTimeoutMs = 120000,
): Promise<{ uri: string; status: number; headers: Record<string, string> }> {
  const native = getNativeDownloads();
  if (!native) throw new Error('Background downloader unavailable.');
  const fs = require('expo-file-system');
  const staging = `${dest}.background-part`;
  let lastBytes = -1, lastAdvance = Date.now();
  try {
    while (!cancelled()) {
      const state = await native.status(key);
      if (cancelled()) break;
      if (state.status === 'error') {
        const reason = state.reason;
        const message = reason === 1006 ? 'Not enough free storage to download this model.'
          : reason === 401 || reason === 403 ? 'This model requires access to a private or gated repository. Choose a public model.'
          : reason === 404 ? 'This model file is no longer available. Search for an updated model file.'
          : 'The model download could not finish. Tap Retry to download again.';
        throw new Error(message);
      }
      if (state.status === 'missing') throw new Error('Download cancelled.');
      if (state.bytes > lastBytes) { lastBytes = state.bytes; lastAdvance = Date.now(); }
      if (Date.now() - lastAdvance > stallTimeoutMs && state.status !== 'complete') throw new Error('Download stalled. Check your connection and retry.');
      progress({ totalBytesWritten: Math.max(0, state.bytes), totalBytesExpectedToWrite: Math.max(0, state.total) });
      if (state.status === 'waiting') onWaiting?.(state.reason === 196 ? 'Waiting for an available network…' : state.reason === 195 ? 'Network interrupted; Android is retrying…' : 'Waiting for Android to resume the download…');
      if (state.status === 'complete') {
        const info = await fs.getInfoAsync(state.uri);
        const bytes = Number(info.size || 0);
        if (!info.exists || bytes < minBytes || (state.total > 0 && bytes !== state.total)) throw new Error('Downloaded model is incomplete. Please retry.');
        if (dest.toLowerCase().endsWith('.gguf')) {
          const magic = await fs.readAsStringAsync(state.uri, { encoding: fs.EncodingType.Base64, position: 0, length: 4 });
          if (magic !== 'R0dVRg==') throw new Error('The downloaded file is not a GGUF model. Check the model link and try again.');
        }
        // Publish only a verified complete file. Cancellation waits for this async
        // copy to settle before removing it, so a writer cannot recreate the file.
        await fs.deleteAsync(staging, { idempotent: true });
        await fs.copyAsync({ from: state.uri, to: staging });
        if (cancelled()) break;
        await fs.moveAsync({ from: staging, to: dest });
        if (cancelled()) break;
        await native.cancel(key);
        return { uri: dest, status: 200, headers: { 'Content-Length': String(bytes) } };
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Download cancelled.');
  } finally {
    await fs.deleteAsync(staging, { idempotent: true });
  }
}
