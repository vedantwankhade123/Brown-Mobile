import { Platform } from 'react-native';
import { StoragePaths } from './StoragePaths';
import { AppDatabase } from './Database';
import { ModelDownloader } from '../modelManager/Downloader';

let bootstrapPromise: Promise<void> | null = null;

async function cleanOrphanedPartials(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const FileSystem = require('expo-file-system');
    if (!FileSystem?.readDirectoryAsync || !FileSystem?.deleteAsync) return;
    const dir = await StoragePaths.getModelsDir();
    const files = await FileSystem.readDirectoryAsync(dir);
    if (!Array.isArray(files)) return;

    const tracked = new Set(
      ModelDownloader.getInstance()
        .getStates()
        .filter((s) => s.status === 'downloaded' && s.localPath)
        .map((s) => String(s.localPath).split('/').pop())
    );

    for (const file of files) {
      // Interrupted downloads leave dead partials (resume always restarts from
      // zero after a restart), so anything untracked in our folder is removable.
      if (!file.toLowerCase().endsWith('.gguf')) continue;
      if (tracked.has(file)) continue;
      try {
        await FileSystem.deleteAsync(dir + file, { idempotent: true });
      } catch {}
    }
  } catch {}
}

export function bootstrapApp(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await StoragePaths.ensureLayout();
      await AppDatabase.getInstance().init();
      await ModelDownloader.getInstance().whenReady();
      await cleanOrphanedPartials();
    })().catch((err: any) => {
      console.warn('[AppBootstrap]', err?.message || err);
    });
  }
  return bootstrapPromise;
}
