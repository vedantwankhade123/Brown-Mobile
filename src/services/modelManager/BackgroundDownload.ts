import { Platform, AppState } from 'react-native';

type Snapshot = { status: 'missing' | 'downloading' | 'waiting' | 'complete' | 'error'; bytes: number; total: number; uri?: string; url?: string; reason?: number; waitingReason?: string; thermalStatus?: number };
type NativeDownloads = {
  start(key: string, url: string, label: string): Promise<Snapshot>;
  status(key: string): Promise<Snapshot>;
  cancel(key: string): Promise<void>;
  keys(): Promise<string[]>;
  beginDirectTransfer?(key: string): Promise<void>;
  endDirectTransfer?(key: string): Promise<void>;
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

// Use the native HTTP stream when an OEM defers DownloadManager's job. The
// foreground service protects the socket with the screen off; no screen lock
// or whole-model JS buffer is needed. Leave network/offline waits to Android.
async function directTransfer(
  native: NativeDownloads, key: string, url: string, partial: string,
  cancelled: () => boolean, progress: (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
): Promise<Snapshot> {
  const fs = require('expo-file-system');
  await native.beginDirectTransfer!(key);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (cancelled()) throw new Error('Download cancelled.');
      const info = await fs.getInfoAsync(partial);
      const offset = info.exists ? Number(info.size || 0) : 0;
      const freshUrl = url.includes('huggingface.co/')
        ? `${url}${url.includes('?') ? '&' : '?'}brown_direct=${Date.now()}` : url;
      let lastAdvance = Date.now(), lastBytes = offset;
      const task = fs.createDownloadResumable(freshUrl, partial, {
        headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', 'User-Agent': 'BrownAI-Mobile/1.0' },
      }, (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
        if (value.totalBytesWritten > lastBytes) { lastBytes = value.totalBytesWritten; lastAdvance = Date.now(); }
        if (!cancelled()) progress(value);
      }, offset > 0 ? String(offset) : undefined);
      let timedOut = false, stopping: Promise<unknown> | undefined, lastCheck = Date.now();
      const watchdog = setInterval(() => {
        const now = Date.now();
        if (now - lastCheck > 5000) lastAdvance = now;
        lastCheck = now;
        if (!cancelled() && Date.now() - lastAdvance < 60000) return;
        timedOut = !cancelled();
        stopping ||= task.cancelAsync();
      }, 500);
      try {
        const result = await task.downloadAsync();
        if (cancelled()) throw new Error('Download cancelled.');
        if (!result || timedOut) throw new Error('Network download stalled. Tap Retry to continue.');
        const status = Number(result.status);
        if (status >= 400) {
          await fs.deleteAsync(partial, { idempotent: true });
          if (status === 404) throw new Error('This model file is no longer available. Search for an updated model file.');
          if ((status === 401 || status === 403) && attempt === 2) throw new Error('This model requires access to a private or gated repository. Choose a public model.');
          throw new Error(`Download failed with HTTP ${status}.`);
        }
        const headers = Object.fromEntries(Object.entries(result.headers || {}).map(([name, value]) => [name.toLowerCase(), value]));
        const range = String(headers['content-range'] || '').match(/^bytes (\d+)-\d+\/(\d+)$/);
        const bytes = Number((await fs.getInfoAsync(partial)).size || 0);
        const total = range ? Number(range[2]) : Number(headers['content-length'] || 0);
        if ((offset > 0 && (status !== 206 || !range || Number(range[1]) !== offset)) || (total > 0 && bytes !== total)) {
          await fs.deleteAsync(partial, { idempotent: true });
          throw new Error('Incomplete download or invalid resumed range. Please retry.');
        }
        return { status: 'complete', bytes, total: total || bytes, uri: partial };
      } catch (error: any) {
        if (cancelled() || attempt === 2 || /storage|ENOSPC|private|gated|no longer available/i.test(error?.message || '')) throw error;
        // Native pause settles the writer before the next attempt opens the file.
        await task.pauseAsync().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      } finally {
        clearInterval(watchdog);
        await stopping?.catch(() => {});
      }
    }
    throw new Error('Download failed. Tap Retry to continue.');
  } finally {
    await native.endDirectTransfer?.(key);
  }
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
  const directPartial = `${dest}.direct-part`;
  let lastBytes = -1, lastAdvance = Date.now();
  let lastPoll = Date.now();
  let queuedSince = Date.now();
  try {
    while (!cancelled()) {
      let state = await native.status(key);
      if (cancelled()) break;
      if (state.status === 'error' && native.beginDirectTransfer && AppState?.currentState === 'active' && state.url
        && [403, 408, 429, 500, 502, 503, 504, 1004, 1005, 1008].includes(state.reason || 0)) {
        onWaiting?.('Retrying with a direct connection…');
        await native.cancel(key);
        state = await directTransfer(native, key, state.url, directPartial, cancelled, progress);
      }
      if (state.status === 'error') {
        const reason = state.reason;
        const message = reason === 1006 ? 'Not enough free storage to download this model.'
          : reason === 401 || reason === 403 ? 'This model requires access to a private or gated repository. Choose a public model.'
          : reason === 404 ? 'This model file is no longer available. Search for an updated model file.'
          : 'The model download could not finish. Tap Retry to download again.';
        throw new Error(message);
      }
      if (state.status === 'missing') throw new Error('Download cancelled.');
      // Android owns scheduling and retries. Queued/network/thermal waits are
      // not dead sockets, and JS suspension must not consume the stall budget.
      const now = Date.now();
      if (state.status === 'waiting' || now - lastPoll > 5000) lastAdvance = now;
      lastPoll = now;
      if (state.status !== 'waiting') queuedSince = now;
      const schedulerDelay = state.waitingReason === 'thermal' && (state.thermalStatus || 0) <= 2
        ? 5000 : state.waitingReason === 'queued' ? 30000 : Infinity;
      if (state.status === 'waiting' && now - queuedSince >= schedulerDelay && AppState?.currentState === 'active' && native.beginDirectTransfer) {
        onWaiting?.('Android delayed the download. Switching to direct transfer…');
        // Read the original public URL, never persist a signed CDN redirect.
        const url = state.url;
        if (url) {
          await native.cancel(key);
          state = await directTransfer(native, key, url, directPartial, cancelled, progress);
        }
      }
      if (state.bytes > lastBytes) { lastBytes = state.bytes; lastAdvance = Date.now(); }
      if (Date.now() - lastAdvance > stallTimeoutMs && state.status !== 'complete') throw new Error('Download stalled. Check your connection and retry.');
      progress({ totalBytesWritten: Math.max(0, state.bytes), totalBytesExpectedToWrite: Math.max(0, state.total) });
      if (state.status === 'waiting') onWaiting?.(state.waitingReason === 'thermal' ? 'Phone is warm. Android will resume when it cools down. You can turn the screen off.'
        : state.waitingReason === 'wifi' || state.reason === 196 ? 'Waiting for Wi-Fi…'
        : state.waitingReason === 'network' || state.reason === 195 ? 'Waiting for an available network…'
        : state.waitingReason === 'retry' || state.reason === 194 ? 'Network interrupted; Android is retrying…'
        : 'Queued by Android. The download will start automatically.');
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
        if (state.uri === directPartial) await fs.moveAsync({ from: directPartial, to: staging });
        else await fs.copyAsync({ from: state.uri, to: staging });
        if (cancelled()) break;
        await fs.moveAsync({ from: staging, to: dest });
        if (cancelled()) break;
        await native.cancel(key);
        await fs.deleteAsync(directPartial, { idempotent: true });
        return { uri: dest, status: 200, headers: { 'Content-Length': String(bytes) } };
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Download cancelled.');
  } finally {
    await fs.deleteAsync(staging, { idempotent: true });
    if (cancelled()) await fs.deleteAsync(directPartial, { idempotent: true });
  }
}
