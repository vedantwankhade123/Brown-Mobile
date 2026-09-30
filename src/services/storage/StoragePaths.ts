import AsyncStorage from '@react-native-async-storage/async-storage';

const ROOT_KEY = '@ultron_storage_root';
const MODELS_KEY = '@ultron_models_dir';
const DATA_KEY = '@ultron_data_dir';

const DEFAULT_FOLDER = 'UltronAI';

export class StoragePaths {
  static async defaultRoot(): Promise<string> {
    try {
      const FileSystem = require('expo-file-system');
      const base = FileSystem?.documentDirectory || FileSystem?.cacheDirectory || '/storage/emulated/0/';
      return `${base}${DEFAULT_FOLDER}/`;
    } catch {
      return `/storage/emulated/0/${DEFAULT_FOLDER}/`;
    }
  }

  static async getRoot(): Promise<string> {
    try {
      const stored = await AsyncStorage.getItem(ROOT_KEY);
      if (stored) return stored.endsWith('/') ? stored : stored + '/';
    } catch {}
    return this.defaultRoot();
  }

  static async getDataDir(): Promise<string> {
    try {
      const stored = await AsyncStorage.getItem(DATA_KEY);
      if (stored) return stored.endsWith('/') ? stored : stored + '/';
    } catch {}
    return `${await this.getRoot()}data/`;
  }

  static async getModelsDir(): Promise<string> {
    try {
      const stored = await AsyncStorage.getItem(MODELS_KEY);
      if (stored) return stored.endsWith('/') ? stored : stored + '/';
    } catch {}
    return `${await this.getRoot()}models/`;
  }

  static async setRoot(dir: string): Promise<void> {
    const normalized = dir.endsWith('/') ? dir : dir + '/';
    await AsyncStorage.setItem(ROOT_KEY, normalized);
    await this.ensureLayout();
  }

  static async setDataDir(dir: string): Promise<void> {
    await AsyncStorage.setItem(DATA_KEY, dir.endsWith('/') ? dir : dir + '/');
    await this.ensureDir(await this.getDataDir());
  }

  static async setModelsDir(dir: string): Promise<void> {
    await AsyncStorage.setItem(MODELS_KEY, dir.endsWith('/') ? dir : dir + '/');
    await this.ensureDir(await this.getModelsDir());
  }

  static async isDefaultModelsDir(): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(MODELS_KEY);
      return !stored;
    } catch {
      return true;
    }
  }

  static async resetModelsDir(): Promise<void> {
    try {
      await AsyncStorage.removeItem(MODELS_KEY);
    } catch {}
    await this.ensureDir(await this.getModelsDir());
  }

  /**
   * Creates `dir` if needed. Throws when the folder is genuinely unusable — callers that
   * are about to write a model file need that instead of a silent no-op.
   */
  static async ensureDir(dir: string): Promise<void> {
    const FileSystem = require('expo-file-system');
    if (!FileSystem?.makeDirectoryAsync) return;
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      return;
    } catch (err: any) {
      const message = String(err?.message || err || '');
      if (/exist/i.test(message)) return;
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (info?.exists && info?.isDirectory) return;
      } catch {}
      throw new Error(
        `Cannot create the folder ${this.displayPath(dir)}. Check the storage location and permissions.`
      );
    }
  }

  static async ensureLayout(): Promise<{ root: string; models: string; data: string; cache: string }> {
    const root = await this.getRoot();
    const models = await this.getModelsDir();
    const data = await this.getDataDir();
    const cache = `${root}cache/`;
    // Boot must not fail because one folder is unwritable; downloads report it themselves.
    await Promise.all(
      [root, models, data, cache, `${root}db/`].map((dir) => this.ensureDir(dir).catch(() => {}))
    );
    return { root, models, data, cache };
  }

  static displayPath(dir: string): string {
    return dir.replace(/^file:\/\//, '').replace(/\/+$/, '') || `/${DEFAULT_FOLDER}`;
  }
}
