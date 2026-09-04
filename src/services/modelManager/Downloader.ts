import { ModelMetadata, ModelDownloadState } from '../../types/model';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageBudgetService } from './StorageBudget';
import { StoragePaths } from '../storage/StoragePaths';

const LEGACY_DOWNLOADS_KEY = '@ultron_downloaded_models';
const DOWNLOADS_KEY = '@ultron_downloaded_models_v2';

function isPlaceholderPath(localPath?: string): boolean {
  const path = String(localPath || '');
  if (!path) return true;
  if (path.startsWith('/UltronAI/')) return true;
  if (path.includes('/UltronAI/models/') && !path.startsWith('file:') && !path.includes('documentDirectory') && !path.includes('/Containers/') && !path.includes('/data/user/')) {
    return !path.startsWith('content:') && path.length < 80;
  }
  return false;
}

export class ModelDownloader {
  private static instance: ModelDownloader;
  private downloadStates: Map<string, ModelDownloadState> = new Map();
  private listeners: Set<(states: ModelDownloadState[]) => void> = new Set();
  private abortControllers: Map<string, boolean> = new Map();
  private resumables: Map<string, any> = new Map();
  private pausedModels: Map<string, ModelMetadata> = new Map();
  private ready: Promise<void>;

  private constructor() {
    this.ready = this.restoreDownloadedState();
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

  private async fileExists(uri: string): Promise<boolean> {
    try {
      const FileSystem = require('expo-file-system');
      if (!FileSystem?.getInfoAsync) return false;
      const info = await FileSystem.getInfoAsync(uri);
      const size = Number(info?.size || 0);
      return !!info?.exists && size > 1024;
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
      for (const item of list) {
        if (item.status === 'downloading' || item.status === 'paused') {
          // Resumable sessions do not survive an app restart: surface them as
          // paused so the UI shows a resume action instead of a stuck spinner.
          this.downloadStates.set(item.modelId, { ...item, status: 'paused' });
          continue;
        }
        if (item.status !== 'downloaded') continue;
        if (isPlaceholderPath(item.localPath)) continue;
        if (!(await this.fileExists(String(item.localPath)))) continue;
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
    try {
      const arr = Array.from(this.downloadStates.values());
      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(arr));
    } catch {}
  }

  getStates(): ModelDownloadState[] {
    return Array.from(this.downloadStates.values());
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
    this.abortControllers.set(model.id, false);
    this.pausedModels.set(model.id, model);

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

    try {
      const FileSystem = require('expo-file-system');
      let downloadUrl = model.downloadUrl;
      if (downloadUrl.includes('huggingface.co') && !downloadUrl.includes('download=true')) {
        downloadUrl = downloadUrl.includes('?') ? `${downloadUrl}&download=true` : `${downloadUrl}?download=true`;
      }

      if (FileSystem?.createDownloadResumable && downloadUrl.startsWith('http')) {
        const stats = await StorageBudgetService.getDeviceStorageStats();
        if (stats.freeStorageBytes < model.sizeBytes + 50 * 1024 * 1024) {
          throw new Error('Not enough free storage for this GGUF download');
        }
        await StoragePaths.ensureLayout();
        const dir = destDir || (await StoragePaths.getModelsDir());
        await StoragePaths.ensureDir(dir);
        const dest = dir + model.filename;
        const startTime = Date.now();
        const callback = (progress: any) => {
          const total = progress.totalBytesExpectedToWrite || model.sizeBytes;
          const downloaded = progress.totalBytesWritten || 0;
          const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
          state.downloadedBytes = downloaded;
          state.totalBytes = total;
          state.progress = Math.min(Math.round((downloaded / total) * 100), 99);
          state.speedBytesPerSec = Math.round(downloaded / elapsed);
          this.downloadStates.set(model.id, { ...state });
          this.notifyListeners();
        };

        const downloadOptions = {
          headers: {
            'Accept-Encoding': 'identity',
            'User-Agent': 'BrownAI-Mobile/1.0',
          },
        };

        let resumable = this.resumables.get(model.id);
        let hadResumable = !!resumable;
        if (!resumable) {
          try {
            resumable = FileSystem.createDownloadResumable(downloadUrl, dest, downloadOptions, callback);
            this.resumables.set(model.id, resumable);
          } catch {
            resumable = null;
          }
        }

        let result: any = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            if (resumable && typeof resumable.downloadAsync === 'function') {
              const isResuming = (hadResumable || attempts > 0) && state.downloadedBytes > 0 && typeof resumable.resumeAsync === 'function';
              result = await (isResuming ? resumable.resumeAsync() : resumable.downloadAsync());
              break;
            } else {
              throw new Error('downloadResumableStartAsync is not available');
            }
          } catch (downloadErr: any) {
            attempts++;
            const errMsg = String(downloadErr?.message || '');
            const isUnavailability =
              errMsg.includes('downloadResumableStartAsync') ||
              errMsg.includes('is not available') ||
              errMsg.includes('ERR_UNAVAILABLE');

            if (isUnavailability && typeof FileSystem?.downloadAsync === 'function') {
              // Resumable background native task is not supported in this client runtime (e.g. Expo Go).
              // Gracefully fallback to FileSystem.downloadAsync with periodic getInfoAsync progress monitoring.
              let progressTimer: any = null;
              try {
                progressTimer = setInterval(async () => {
                  try {
                    if (this.abortControllers.get(model.id)) return;
                    if (FileSystem?.getInfoAsync) {
                      const info = await FileSystem.getInfoAsync(dest);
                      if (info?.exists && typeof info?.size === 'number') {
                        const downloaded = info.size;
                        const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
                        state.downloadedBytes = downloaded;
                        state.totalBytes = model.sizeBytes;
                        state.progress = Math.min(Math.round((downloaded / model.sizeBytes) * 100), 99);
                        state.speedBytesPerSec = Math.round(downloaded / elapsed);
                        this.downloadStates.set(model.id, { ...state });
                        this.notifyListeners();
                      }
                    }
                  } catch {}
                }, 600);

                result = await FileSystem.downloadAsync(downloadUrl, dest, downloadOptions);
                if (progressTimer) clearInterval(progressTimer);
                break;
              } catch (fallbackErr: any) {
                if (progressTimer) clearInterval(progressTimer);
                throw fallbackErr;
              }
            }

            const isNetworkInterruption =
              errMsg.includes('stream was reset') ||
              errMsg.includes('CANCEL') ||
              errMsg.includes('Connection reset') ||
              errMsg.includes('SocketTimeout') ||
              errMsg.includes('timeout') ||
              errMsg.includes('broken pipe') ||
              errMsg.includes('Network request failed');

            if (this.abortControllers.get(model.id)) {
              throw downloadErr;
            }

            if (isNetworkInterruption && attempts < maxAttempts) {
              await new Promise((res) => setTimeout(res, 1200 * attempts));
              hadResumable = true;
              continue;
            }
            throw downloadErr;
          }
        }

        if (this.abortControllers.get(model.id)) {
          state.status = 'paused';
          this.downloadStates.set(model.id, { ...state });
          this.notifyListeners();
          return;
        }

        state.status = 'downloaded';
        state.progress = 100;
        state.localPath = result?.uri || dest;
        state.speedBytesPerSec = 0;
        this.downloadStates.set(model.id, { ...state });
        this.resumables.delete(model.id);
        this.notifyListeners();
        await this.persistStates();
        return;
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      let friendlyError = errMsg || 'Download failed';
      if (
        errMsg.includes('downloadResumableStartAsync') ||
        errMsg.includes('downloadAsync') ||
        errMsg.includes('is not available') ||
        errMsg.includes('ERR_UNAVAILABLE') ||
        errMsg.includes('linked all the native dependencies')
      ) {
        friendlyError = 'Local model storage requires native Android build. Run "npx expo run:android" or use Cloud / Desktop Sync models.';
      } else if (
        errMsg.includes('stream was reset') ||
        errMsg.includes('CANCEL') ||
        errMsg.includes('Connection reset') ||
        errMsg.includes('SocketTimeout') ||
        errMsg.includes('timeout') ||
        errMsg.includes('broken pipe')
      ) {
        friendlyError = 'Network connection interrupted. Tap Retry to continue.';
      } else if (errMsg.includes('ENOSPC') || errMsg.includes('Not enough free storage')) {
        friendlyError = 'Not enough free device storage for this model.';
      }

      state.status = 'error';
      state.error = friendlyError;
      this.downloadStates.set(model.id, { ...state });
      this.notifyListeners();
      await this.persistStates();
      return;
    }

    state.status = 'error';
    state.error = 'This device cannot save GGUF files. Use the native Android/iOS app to download models.';
    this.downloadStates.set(model.id, { ...state });
    this.notifyListeners();
    await this.persistStates();
  }

  async pauseDownload(modelId: string): Promise<void> {
    this.abortControllers.set(modelId, true);
    const resumable = this.resumables.get(modelId);
    try {
      if (resumable?.pauseAsync) await resumable.pauseAsync();
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
    const model = this.pausedModels.get(modelId);
    const state = this.downloadStates.get(modelId);
    if (!model || !state) return;
    this.abortControllers.set(modelId, false);
    await this.startDownload(model);
  }

  async deleteModel(modelId: string): Promise<void> {
    const existing = this.downloadStates.get(modelId);
    const model = this.pausedModels.get(modelId);
    const targets = new Set<string>();
    if (existing?.localPath && !isPlaceholderPath(existing.localPath)) {
      targets.add(existing.localPath);
    }
    if (model?.filename) {
      // Also remove the partial file of an interrupted download.
      try {
        const dir = await StoragePaths.getModelsDir();
        targets.add(dir + model.filename);
      } catch {}
    }
    for (const path of targets) {
      try {
        const FileSystem = require('expo-file-system');
        if (FileSystem?.deleteAsync) {
          await FileSystem.deleteAsync(path, { idempotent: true });
        }
      } catch {}
    }
    this.downloadStates.delete(modelId);
    this.resumables.delete(modelId);
    this.pausedModels.delete(modelId);
    await this.persistStates();
    this.notifyListeners();
  }

  async cancelDownload(modelId: string): Promise<void> {
    this.abortControllers.set(modelId, true);
    await this.deleteModel(modelId);
  }
}
