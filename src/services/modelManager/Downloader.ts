import { ModelMetadata, ModelDownloadState } from '../../types/model';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAccountResetting } from '../storage/AccountLifecycle';
import { AppState } from 'react-native';
import { StorageBudgetService } from './StorageBudget';
import { StoragePaths } from '../storage/StoragePaths';
import { CURATED_MODELS, getModelById, MOBILE_GGUF_LIBRARY } from './ModelCatalog';
import { alertDownloadComplete, alertModelFailed } from '../NotificationService';
import { backgroundDownloadsAvailable, backgroundDownloadBytes, hasBackgroundDownload, enqueueBackgroundDownload, receiveBackgroundDownload, cancelBackgroundDownload, cancelBackgroundDownloadPrefix } from './BackgroundDownload';

const LEGACY_DOWNLOADS_KEY = '@ultron_downloaded_models';
const DOWNLOADS_KEY = '@ultron_downloaded_models_v2';
const PAUSED_MODELS_KEY = '@brown_paused_download_models';
const RESUMABLE_KEY = '@brown_download_resumables';

/** No progress for this long means the socket is dead; cancel and retry the range. */
const STALL_TIMEOUT_MS = 30_000;

function joinPath(dir: string, filename: string): string {
  return `${String(dir).replace(/\/+$/, '')}/${filename}`;
}

function isPlaceholderPath(localPath?: string): boolean {
  const path = String(localPath || '');
  if (!path) return true;
  if (path.startsWith('/UltronAI/')) return true;
  if (path.includes('/UltronAI/models/') && !path.startsWith('file:') && !path.includes('documentDirectory') && !path.includes('/Containers/') && !path.includes('/data/user/')) {
    return !path.startsWith('content:') && path.length < 80;
  }
  return false;
}

async function activateKeepAwake(tag: string): Promise<void> {
  try {
    const KeepAwake = require('expo-keep-awake');
    if (KeepAwake?.activateKeepAwakeAsync) await KeepAwake.activateKeepAwakeAsync(tag);
    else if (KeepAwake?.activateKeepAwake) KeepAwake.activateKeepAwake(tag);
  } catch {}
}

async function deactivateKeepAwake(tag: string): Promise<void> {
  try {
    const KeepAwake = require('expo-keep-awake');
    if (KeepAwake?.deactivateKeepAwake) KeepAwake.deactivateKeepAwake(tag);
  } catch {}
}

function findModelById(modelId: string): ModelMetadata | null {
  return getModelById(modelId) || MOBILE_GGUF_LIBRARY.find((m) => m.id === modelId) || CURATED_MODELS.find((m) => m.id === modelId) || null;
}

export class ModelDownloader {
  private static instance: ModelDownloader;
  private downloadStates: Map<string, ModelDownloadState> = new Map();
  private listeners: Set<(states: ModelDownloadState[]) => void> = new Set();
  private abortControllers: Map<string, boolean> = new Map();
  private resumables: Map<string, any> = new Map();
  private pausedModels: Map<string, ModelMetadata> = new Map();
  private ready: Promise<void>;
  private activeTasks = new Set<Promise<void>>();
  private tasksByModel = new Map<string, Promise<void>>();
  private cancelledModels = new Set<string>();

  private constructor() {
    this.ready = this.restoreDownloadedState();
    this.ready.then(async () => {
      if (!backgroundDownloadsAvailable() || isAccountResetting()) return;
      for (const [id, model] of this.pausedModels) {
        if (await hasBackgroundDownload(`gguf:${id}`)) {
          if (this.pausedModels.get(id) === model && !this.cancelledModels.has(id)) this.startDownload(model).catch(() => {});
        }
      }
    }).catch(() => {});
  }

  public static getInstance(): ModelDownloader {
    if (!ModelDownloader.instance) {
      ModelDownloader.instance = new ModelDownloader();
    }
    return ModelDownloader.instance;
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  getDownloadedIds(): string[] {
    return Array.from(this.downloadStates.values())
      .filter((s) => s.status === 'downloaded' && s.localPath && !isPlaceholderPath(s.localPath))
      .map((s) => s.modelId);
  }

  private async fileExists(uri: string, minBytes = 10 * 1024 * 1024): Promise<boolean> {
    try {
      const FileSystem = require('expo-file-system');
      if (!FileSystem?.getInfoAsync) return false;
      const info = await FileSystem.getInfoAsync(uri);
      const size = Number(info?.size || 0);
      return !!info?.exists && size >= minBytes;
    } catch {
      return false;
    }
  }

  private async restoreDownloadedState(): Promise<void> {
    try {
      const stored =
        (await AsyncStorage.getItem(DOWNLOADS_KEY)) ||
        (await AsyncStorage.getItem(LEGACY_DOWNLOADS_KEY));
      const list: ModelDownloadState[] = stored ? JSON.parse(stored) : [];
      this.downloadStates.clear();

      const pausedRaw = await AsyncStorage.getItem(PAUSED_MODELS_KEY);
      const pausedList: ModelMetadata[] = pausedRaw ? JSON.parse(pausedRaw) : [];
      this.pausedModels.clear();
      for (const m of pausedList) {
        if (m?.id) this.pausedModels.set(m.id, m);
      }

      for (const item of list) {
        if (item.status === 'downloading' || item.status === 'paused' || item.status === 'error') {
          this.downloadStates.set(item.modelId, { ...item, status: item.status === 'error' ? 'error' : 'paused' });
          if (!this.pausedModels.has(item.modelId)) {
            const fromCatalog = findModelById(item.modelId);
            if (fromCatalog) this.pausedModels.set(item.modelId, fromCatalog);
          }
          continue;
        }
        if (item.status !== 'downloaded') continue;
        if (isPlaceholderPath(item.localPath)) continue;
        const catalogModel = findModelById(item.modelId);
        // Prefer the byte count we recorded when the download finished: catalog sizes
        // for discovered HF repos are estimates and used to reject perfectly good files.
        const expectedBytes = item.totalBytes || catalogModel?.sizeBytes || 0;
        const expectedMin = expectedBytes > 0 ? Math.floor(expectedBytes * 0.9) : 1024 * 1024;
        if (!(await this.fileExists(String(item.localPath), expectedMin))) continue;
        this.downloadStates.set(item.modelId, item);
      }
      await AsyncStorage.removeItem(LEGACY_DOWNLOADS_KEY);
      await this.persistStates();
      this.notifyListeners();
    } catch {
      this.downloadStates.clear();
      this.notifyListeners();
    }
  }

  private async persistStates(): Promise<void> {
    if (isAccountResetting()) return;
    try {
      const arr = Array.from(this.downloadStates.values());
      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(arr));
      const paused = Array.from(this.pausedModels.values());
      await AsyncStorage.setItem(PAUSED_MODELS_KEY, JSON.stringify(paused));
    } catch {}
  }

  private async saveResumableSnapshot(modelId: string, snapshot: any): Promise<void> {
    if (isAccountResetting()) return;
    try {
      // Without `resumeData` the native task restarts from byte zero, so a snapshot
      // that lacks it is not worth storing (it would only look resumable).
      if (!snapshot?.url || !snapshot?.fileUri || !snapshot?.resumeData) return;
      const raw = await AsyncStorage.getItem(RESUMABLE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[modelId] = {
        url: snapshot.url,
        fileUri: snapshot.fileUri,
        options: snapshot.options || {},
        resumeData: snapshot.resumeData,
      };
      await AsyncStorage.setItem(RESUMABLE_KEY, JSON.stringify(map));
    } catch {}
  }

  private async persistResumable(modelId: string, resumable: any): Promise<void> {
    try {
      if (typeof resumable?.savable !== 'function') return;
      await this.saveResumableSnapshot(modelId, resumable.savable());
    } catch {}
  }

  private async clearResumable(modelId: string): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(RESUMABLE_KEY);
      if (!raw) return;
      const map = JSON.parse(raw);
      delete map[modelId];
      await AsyncStorage.setItem(RESUMABLE_KEY, JSON.stringify(map));
    } catch {}
  }

  private async restoreResumable(modelId: string, callback: any): Promise<any | null> {
    try {
      const FileSystem = require('expo-file-system');
      if (!FileSystem?.createDownloadResumable) return null;
      const raw = await AsyncStorage.getItem(RESUMABLE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      const snapshot = map[modelId];
      if (!snapshot?.url || !snapshot?.fileUri || !snapshot.resumeData) return null;
      return FileSystem.createDownloadResumable(
        snapshot.url,
        snapshot.fileUri,
        snapshot.options || {},
        callback,
        snapshot.resumeData
      );
    } catch {
      return null;
    }
  }

  getStates(): ModelDownloadState[] {
    return Array.from(this.downloadStates.values());
  }

  /**
   * Filenames in the models folder that must survive cleanup: finished models plus
   * partials belonging to a paused or in-flight download.
   */
  getRetainedFilenames(): string[] {
    const names = new Set<string>();
    const add = (value?: string) => {
      const name = String(value || '').split('/').pop();
      if (name) names.add(name);
    };
    for (const state of this.downloadStates.values()) {
      if (state.status === 'idle') continue;
      add(state.localPath);
    }
    for (const model of this.pausedModels.values()) add(model.filename);
    return Array.from(names);
  }

  getState(modelId: string): ModelDownloadState {
    return (
      this.downloadStates.get(modelId) || {
        modelId,
        status: 'idle',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBytesPerSec: 0,
      }
    );
  }

  subscribe(listener: (states: ModelDownloadState[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStates());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const states = this.getStates();
    this.listeners.forEach((fn) => fn(states));
  }

  async startDownload(model: ModelMetadata, destDir?: string): Promise<void> {
    await this.ready;
    if (isAccountResetting()) throw new Error('Account deletion is in progress.');
    const active = this.tasksByModel.get(model.id);
    if (active) return active;
    this.cancelledModels.delete(model.id);
    const task = this.runDownload(model, destDir);
    this.tasksByModel.set(model.id, task);
    this.activeTasks.add(task);
    try { await task; } finally { this.activeTasks.delete(task); this.tasksByModel.delete(model.id); }
  }

  private async runDownload(model: ModelMetadata, destDir?: string): Promise<void> {
    this.abortControllers.set(model.id, false);
    this.pausedModels.set(model.id, model);
    await this.persistStates();

    const existing = this.downloadStates.get(model.id);
    const resumeFrom =
      existing && (existing.status === 'paused' || existing.status === 'error')
        ? (existing.downloadedBytes || 0)
        : 0;

    const state: ModelDownloadState = {
      modelId: model.id,
      status: 'downloading',
      progress: resumeFrom > 0 ? Math.round((resumeFrom / model.sizeBytes) * 100) : 0,
      downloadedBytes: resumeFrom,
      totalBytes: model.sizeBytes,
      speedBytesPerSec: 0,
    };

    this.downloadStates.set(model.id, state);
    this.notifyListeners();
    if (!backgroundDownloadsAvailable()) await activateKeepAwake(`gguf-${model.id}`);

    try {
      const FileSystem = require('expo-file-system');
      let downloadUrl = model.downloadUrl;
      if (downloadUrl.includes('huggingface.co') && !downloadUrl.includes('download=true')) {
        downloadUrl = downloadUrl.includes('?') ? `${downloadUrl}&download=true` : `${downloadUrl}?download=true`;
      }

      if (FileSystem?.createDownloadResumable && downloadUrl.startsWith('http')) {
        const stats = await StorageBudgetService.getDeviceStorageStats();
        const stagedBytes = backgroundDownloadsAvailable() ? await backgroundDownloadBytes(`gguf:${model.id}`) : 0;
        const requiredBytes = model.sizeBytes * (backgroundDownloadsAvailable() ? 2 : 1) - Math.min(model.sizeBytes, stagedBytes);
        if (stats.freeStorageBytes < requiredBytes + 50 * 1024 * 1024) {
          throw new Error('Not enough free storage for this GGUF download');
        }
        await StoragePaths.ensureLayout();
        const dir = destDir || (await StoragePaths.getModelsDir());
        await StoragePaths.ensureDir(dir);
        const dest = joinPath(dir, model.filename);
        state.localPath = dest;
        await this.persistStates();
        const startTime = Date.now();
        let lastProgressAt = Date.now();
        const callback = (progress: any) => {
          if (this.abortControllers.get(model.id)) return;
          const total = progress.totalBytesExpectedToWrite || model.sizeBytes;
          const downloaded = progress.totalBytesWritten || 0;
          const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
          if (downloaded !== state.downloadedBytes) lastProgressAt = Date.now();
          state.downloadedBytes = downloaded;
          state.totalBytes = total;
          state.progress = Math.min(Math.round((downloaded / total) * 100), 99);
          state.speedBytesPerSec = Math.round(downloaded / elapsed);
          this.downloadStates.set(model.id, { ...state });
          this.notifyListeners();
        };

        const downloadOptions = {
          sessionType: FileSystem.FileSystemSessionType?.BACKGROUND,
          headers: {
            'Accept-Encoding': 'identity',
            'User-Agent': 'BrownAI-Mobile/1.0',
          },
        };

        if (backgroundDownloadsAvailable()) {
          const key = `gguf:${model.id}`;
          if (!this.abortControllers.get(model.id)) await enqueueBackgroundDownload(key, downloadUrl, model.name);
          const result = await receiveBackgroundDownload(key, dest, 1024 * 1024,
            () => !!this.abortControllers.get(model.id), callback);
          if (this.abortControllers.get(model.id)) return;
          const info = await FileSystem.getInfoAsync(result.uri);
          state.status = 'downloaded';
          state.localPath = result.uri;
          state.totalBytes = state.downloadedBytes = Number(info.size);
          state.progress = 100;
          state.speedBytesPerSec = 0;
          state.error = undefined;
          this.downloadStates.set(model.id, { ...state });
          this.pausedModels.delete(model.id);
          await this.clearResumable(model.id);
          this.notifyListeners();
          await this.persistStates();
          alertDownloadComplete(model.name);
          return;
        }

        let resumable = this.resumables.get(model.id);
        let hadResumable = !!resumable;
        if (!resumable) {
          resumable = await this.restoreResumable(model.id, callback);
          if (resumable) {
            hadResumable = true;
            this.resumables.set(model.id, resumable);
          }
        }
        if (!resumable) {
          try {
            resumable = FileSystem.createDownloadResumable(downloadUrl, dest, downloadOptions, callback);
            this.resumables.set(model.id, resumable);
            await this.persistResumable(model.id, resumable);
          } catch {
            resumable = null;
          }
        }

        let result: any = null;
        let attempts = 0;
        const maxAttempts = 8;

        while (attempts < maxAttempts) {
          if (this.abortControllers.get(model.id)) break;
          // A socket that stalls mid-transfer never settles downloadAsync(); without this
          // the UI sits at a frozen percentage forever instead of retrying.
          let stallTimer: any = null;
          const armStallWatchdog = (task: any) => {
            if (!task || typeof task.cancelAsync !== 'function') return;
            lastProgressAt = Date.now();
            if (stallTimer) clearInterval(stallTimer);
            stallTimer = setInterval(() => {
              if (this.abortControllers.get(model.id)) return;
              if (Date.now() - lastProgressAt < STALL_TIMEOUT_MS) return;
              clearInterval(stallTimer);
              stallTimer = null;
              task.cancelAsync().catch(() => {});
            }, 2000);
          };
          const disarmStallWatchdog = () => {
            if (stallTimer) clearInterval(stallTimer);
            stallTimer = null;
          };

          try {
            if (resumable && typeof resumable.downloadAsync === 'function') {
              const isResuming =
                (hadResumable || attempts > 0) &&
                state.downloadedBytes > 0 &&
                typeof resumable.resumeAsync === 'function';
              armStallWatchdog(resumable);
              result = await (isResuming ? resumable.resumeAsync() : resumable.downloadAsync());
              disarmStallWatchdog();
              if (result === undefined) {
                // cancelAsync() resolves the task with no result: either the user paused
                // or the watchdog fired. Rebuild so the next attempt starts a live task.
                throw new Error(this.abortControllers.get(model.id) ? 'paused' : 'timeout');
              }
              await this.persistResumable(model.id, resumable);
              break;
            } else {
              throw new Error('downloadResumableStartAsync is not available');
            }
          } catch (downloadErr: any) {
            disarmStallWatchdog();
            attempts++;
            const errMsg = String(downloadErr?.message || '');
            const isUnavailability =
              errMsg.includes('downloadResumableStartAsync') ||
              errMsg.includes('is not available') ||
              errMsg.includes('ERR_UNAVAILABLE');

            if (isUnavailability) {
              throw new Error('Cancellable downloads are not available in this build. Install the updated Brown app.');
            }

            if (this.abortControllers.get(model.id)) {
              throw downloadErr;
            }

            const httpStatus = Number(result?.status || 0) || Number(errMsg.match(/\b(4\d\d|5\d\d)\b/)?.[1] || 0);
            if (httpStatus === 401 || httpStatus === 403) {
              throw new Error(
                'Hugging Face refused this file (401/403). Gated and private repos cannot be downloaded from the app — accept the licence on huggingface.co first, or pick an open repo.'
              );
            }
            if (httpStatus === 404) {
              throw new Error(
                'That GGUF file no longer exists in the repo (404). Re-search the model to pick a current file.'
              );
            }

            const isNetworkInterruption =
              errMsg === 'timeout' ||
              /stream was reset|CANCEL|Connection reset|SocketTimeout|timeout|broken pipe|Network request failed|incomplete/i.test(
                errMsg
              );

            if (isNetworkInterruption && attempts < maxAttempts) {
              // Capture resumeData while the native task still exists, otherwise the retry
              // silently restarts from zero and the file never completes.
              try {
                if (resumable?.pauseAsync) {
                  const pauseState = await resumable.pauseAsync();
                  await this.saveResumableSnapshot(model.id, pauseState);
                  state.downloadedBytes = state.downloadedBytes || 0;
                }
              } catch {}

              if (AppState.currentState !== 'active') {
                await new Promise<void>((resolve) => {
                  const sub = AppState.addEventListener('change', (s: string) => {
                    if (s === 'active') {
                      sub.remove();
                      resolve();
                    }
                  });
                  setTimeout(() => {
                    try {
                      sub.remove();
                    } catch {}
                    resolve();
                  }, 20000);
                });
              }
              await new Promise((res) => setTimeout(res, 1500 * attempts));
              // A cancelled task can never be reused: rebuild it from the saved snapshot.
              this.resumables.delete(model.id);
              resumable = await this.restoreResumable(model.id, callback);
              if (!resumable) {
                try {
                  resumable = FileSystem.createDownloadResumable(downloadUrl, dest, downloadOptions, callback);
                } catch {
                  resumable = null;
                }
              }
              if (resumable) this.resumables.set(model.id, resumable);
              hadResumable = !!resumable;
              continue;
            }
            throw downloadErr;
          }
        }

        if (this.abortControllers.get(model.id)) {
          if (this.cancelledModels.has(model.id)) return;
          state.status = 'paused';
          this.downloadStates.set(model.id, { ...state });
          this.notifyListeners();
          await this.persistStates();
          return;
        }

        if (result?.status && result.status >= 400) {
          throw new Error(`Download failed with HTTP ${result.status}`);
        }

        // Verify the file on disk. The catalog size is an estimate, so the server's
        // Content-Length wins when we have one.
        const headerTotal = Number(
          result?.headers?.['Content-Length'] || result?.headers?.['content-length'] || 0
        );
        const expectedBytes = headerTotal > 0 ? headerTotal : model.sizeBytes || 0;
        const fileInfo = await FileSystem.getInfoAsync(dest);
        const actualBytes = Number(fileInfo?.size || 0);
        if (!fileInfo?.exists || actualBytes <= 0) {
          throw new Error('The download finished without writing a file. Check storage space and retry.');
        }
        if (expectedBytes > 0 && actualBytes < expectedBytes) {
          // Keep the partial on disk — deleting it would force the next retry to
          // start from zero, which is exactly how downloads used to loop forever.
          state.status = 'paused';
          state.downloadedBytes = actualBytes;
          state.progress = Math.min(Math.round((actualBytes / expectedBytes) * 100), 99);
          state.speedBytesPerSec = 0;
          state.error = `Incomplete download (${(actualBytes / (1024 * 1024)).toFixed(1)} MB of ${(
            expectedBytes /
            (1024 * 1024)
          ).toFixed(1)} MB). Tap retry to continue where it stopped.`;
          this.downloadStates.set(model.id, { ...state });
          this.notifyListeners();
          await this.persistStates();
          return;
        }

        state.status = 'downloaded';
        state.progress = 100;
        state.downloadedBytes = actualBytes;
        state.totalBytes = actualBytes;
        state.localPath = result?.uri || dest;
        state.speedBytesPerSec = 0;
        state.error = undefined;
        this.downloadStates.set(model.id, { ...state });
        this.resumables.delete(model.id);
        await this.clearResumable(model.id);
        this.notifyListeners();
        await this.persistStates();
        alertDownloadComplete(model.name);
        return;
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      if (this.abortControllers.get(model.id)) {
        if (this.cancelledModels.has(model.id)) return;
        // The user paused or cancelled: that is a paused download, not a failure.
        state.status = 'paused';
        state.speedBytesPerSec = 0;
        this.downloadStates.set(model.id, { ...state });
        this.notifyListeners();
        await this.persistStates();
        return;
      }
      let friendlyError = errMsg || 'Download failed';
      if (
        errMsg.includes('downloadResumableStartAsync') ||
        errMsg.includes('downloadAsync') ||
        errMsg.includes('is not available') ||
        errMsg.includes('ERR_UNAVAILABLE') ||
        errMsg.includes('linked all the native dependencies')
      ) {
        friendlyError =
          'Local model storage requires native Android build. Run "npx expo run:android" or use Cloud / Desktop Sync models.';
      } else if (
        /stream was reset|CANCEL|Connection reset|SocketTimeout|timeout|broken pipe|Network request failed/i.test(
          errMsg
        )
      ) {
        friendlyError = 'Network connection interrupted. Tap Retry to continue.';
        state.status = 'paused';
        state.error = friendlyError;
        this.downloadStates.set(model.id, { ...state });
        this.notifyListeners();
        await this.persistStates();
        return;
      } else if (errMsg.includes('ENOSPC') || errMsg.includes('Not enough free storage')) {
        friendlyError = backgroundDownloadsAvailable()
          ? 'Not enough free storage. Background downloads need temporary space to safely save the model.'
          : 'Not enough free device storage for this model.';
      }

      state.status = 'error';
      state.error = friendlyError;
      this.downloadStates.set(model.id, { ...state });
      this.notifyListeners();
      await this.persistStates();
      alertModelFailed(model.name, friendlyError);
      return;
    } finally {
      await deactivateKeepAwake(`gguf-${model.id}`);
    }

    state.status = 'error';
    state.error = 'This device cannot save GGUF files. Use the native Android/iOS app to download models.';
    this.downloadStates.set(model.id, { ...state });
    this.notifyListeners();
    await this.persistStates();
  }

  async pauseDownload(modelId: string): Promise<void> {
    this.abortControllers.set(modelId, true);
    if (backgroundDownloadsAvailable()) {
      await cancelBackgroundDownload(`gguf:${modelId}`);
      await this.tasksByModel.get(modelId);
      const state = this.downloadStates.get(modelId);
      if (state) {
        state.status = 'paused';
        state.downloadedBytes = state.progress = state.speedBytesPerSec = 0;
        state.error = 'Paused. Tap Resume to restart the download.';
        this.notifyListeners();
        await this.persistStates();
      }
      return;
    }
    const resumable = this.resumables.get(modelId);
    try {
      if (resumable?.pauseAsync) {
        // pauseAsync() is the only call that produces the resumeData string the native
        // side needs to continue from the current byte offset.
        const pauseState = await resumable.pauseAsync();
        await this.saveResumableSnapshot(modelId, pauseState);
      }
    } catch {}
    const state = this.downloadStates.get(modelId);
    if (state && state.status === 'downloading') {
      state.status = 'paused';
      this.downloadStates.set(modelId, { ...state });
      this.notifyListeners();
      await this.persistStates();
    }
  }

  async resumeDownload(modelId: string): Promise<void> {
    let model = this.pausedModels.get(modelId) || findModelById(modelId);
    const state = this.downloadStates.get(modelId);
    if (!model) {
      // Last resort: cannot resume without metadata
      if (state) {
        state.status = 'error';
        state.error = 'Cannot retry — model metadata missing. Start the download again from the Models list.';
        this.downloadStates.set(modelId, { ...state });
        this.notifyListeners();
        await this.persistStates();
      }
      return;
    }
    this.pausedModels.set(modelId, model);
    this.abortControllers.set(modelId, false);
    await this.startDownload(model);
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.ready;
    this.cancelledModels.add(modelId);
    this.abortControllers.set(modelId, true);
    await cancelBackgroundDownload(`gguf:${modelId}`);
    const active = this.resumables.get(modelId);
    if (active?.cancelAsync) await active.cancelAsync();
    else if (active?.pauseAsync) await active.pauseAsync();
    await this.tasksByModel.get(modelId);
    const existing = this.downloadStates.get(modelId);
    const model = this.pausedModels.get(modelId) || findModelById(modelId);
    const targets = new Set<string>();
    if (existing?.localPath && !isPlaceholderPath(existing.localPath)) {
      targets.add(existing.localPath);
    }
    if (model?.filename) {
      try {
        const dir = await StoragePaths.getModelsDir();
        targets.add(joinPath(dir, model.filename));
      } catch {}
    }
    for (const path of targets) {
      const FileSystem = require('expo-file-system');
      for (const target of [path, `${path}.part`, `${path}.background-part`]) {
        await FileSystem.deleteAsync(target, { idempotent: true });
      }
    }
    this.downloadStates.delete(modelId);
    this.resumables.delete(modelId);
    this.pausedModels.delete(modelId);
    await this.clearResumable(modelId);
    await this.persistStates();
    this.notifyListeners();
  }

  async cancelDownload(modelId: string): Promise<void> {
    this.abortControllers.set(modelId, true);
    await this.deleteModel(modelId);
  }

  async stopForAccountDeletion(): Promise<string[]> {
    await this.ready;
    const dir = await StoragePaths.getModelsDir();
    const files = new Set(this.getRetainedFilenames().map(name => joinPath(dir, name)));
    for (const state of this.downloadStates.values()) {
      if (state.localPath && !isPlaceholderPath(state.localPath)) files.add(state.localPath);
    }
    for (const id of this.abortControllers.keys()) this.abortControllers.set(id, true);
    await cancelBackgroundDownloadPrefix('gguf:');
    await Promise.allSettled(Array.from(this.resumables.values()).map(task => task.pauseAsync?.()));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(Array.from(this.activeTasks)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('A download is still stopping. Retry deletion.')), 15000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
    this.downloadStates.clear();
    this.pausedModels.clear();
    this.resumables.clear();
    this.notifyListeners();
    return Array.from(files);
  }
}
