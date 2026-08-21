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
          this.downloadStates.set(item.modelId, item);
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
    const resumeFrom = existing?.status === 'paused' ? existing.downloadedBytes : 0;

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
      if (FileSystem?.createDownloadResumable && model.downloadUrl.startsWith('http')) {
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

        let resumable = this.resumables.get(model.id);
        if (!resumable) {
          resumable = FileSystem.createDownloadResumable(model.downloadUrl, dest, {}, callback);
          this.resumables.set(model.id, resumable);
        }

        const result = await (state.downloadedBytes > 0 && resumable.resumeAsync
          ? resumable.resumeAsync()
          : resumable.downloadAsync());

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
      state.status = 'error';
      state.error = err?.message || 'Download failed';
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
    if (existing?.localPath && !isPlaceholderPath(existing.localPath)) {
      try {
        const FileSystem = require('expo-file-system');
        if (FileSystem?.deleteAsync) {
          await FileSystem.deleteAsync(existing.localPath, { idempotent: true });
        }
      } catch {}
    }
    this.downloadStates.delete(modelId);
    this.resumables.delete(modelId);
    this.pausedModels.delete(modelId);
    await this.persistStates();
    this.notifyListeners();
  }

  cancelDownload(modelId: string): void {
    this.abortControllers.set(modelId, true);
    this.downloadStates.delete(modelId);
    this.resumables.delete(modelId);
    this.notifyListeners();
  }
}
