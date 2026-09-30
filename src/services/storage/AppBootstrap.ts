import { Platform } from 'react-native';
import { StoragePaths } from './StoragePaths';
import { AppDatabase } from './Database';
import { ModelDownloader } from '../modelManager/Downloader';
import { hydrateDiscoveredModels } from '../modelManager/HuggingFaceRegistry';

let bootstrapPromise: Promise<void> | null = null;

async function cleanOrphanedPartials(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const FileSystem = require('expo-file-system');
    if (!FileSystem?.readDirectoryAsync || !FileSystem?.deleteAsync) return;
    const dir = await StoragePaths.getModelsDir();
    const files = await FileSystem.readDirectoryAsync(dir);
    if (!Array.isArray(files)) return;

    const downloader = ModelDownloader.getInstance();
    const retained = new Set(downloader.getRetainedFilenames());

    for (const file of files) {
      // Only truly orphaned files go: a partial that a paused download still owns has to
      // stay on disk or the retry can never continue from where it stopped.
      if (!file.toLowerCase().endsWith('.gguf')) continue;
      if (retained.has(file)) continue;
      try {
        await FileSystem.deleteAsync(`${String(dir).replace(/\/+$/, '')}/${file}`, { idempotent: true });
      } catch {}
    }
  } catch {}
}

export function bootstrapApp(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await StoragePaths.ensureLayout();
      await AppDatabase.getInstance().init();
      // Discovered Hugging Face repos live only in storage until this runs; without it a
      // downloaded HF model disappears from the model list on every restart.
      await hydrateDiscoveredModels();
      await ModelDownloader.getInstance().whenReady();
      await cleanOrphanedPartials();
    })().catch((err: any) => {
      console.warn('[AppBootstrap]', err?.message || err);
    });
  }
  return bootstrapPromise;
}
