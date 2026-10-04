import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { beginAccountReset } from './AccountLifecycle';
import { AppDatabase } from './Database';
import { SecureStore } from './SecureStore';
import { StoragePaths } from './StoragePaths';
import { LlamaEngine } from '../inference/LlamaEngine';
import { ModelDownloader } from '../modelManager/Downloader';
import { DesktopSyncService } from '../sync/DesktopSync';
import { SpeechToTextService } from '../voice/SpeechToText';
import { TextToSpeechService } from '../voice/TextToSpeech';
import { KOKORO_ASSETS, stopKokoroForAccountDeletion } from '../voice/KokoroTtsService';

export const ACCOUNT_RESET_KEY = '@brown_account_reset_pending';
let deletion: Promise<void> | null = null;

export async function accountDeletionPending(): Promise<boolean> {
  return Boolean(await AsyncStorage.getItem(ACCOUNT_RESET_KEY));
}

/** Delete only a tracked model file, never the shared folder containing it. */
export async function eraseManagedModelFile(fileSystem: any, uri: string): Promise<void> {
  const decoded = decodeURIComponent(uri);
  if (!/^(file:\/\/\/|\/)/.test(decoded) || decoded.split('/').includes('..') || !/\.gguf$/i.test(decoded)) {
    throw new Error('An app model has an unsupported storage path. Remove it in Models, then retry deletion.');
  }
  const info = await fileSystem.getInfoAsync(uri);
  if (!info.exists) return;
  if (info.isDirectory) throw new Error('A model path points to a folder. Account deletion will not erase that shared folder.');
  await fileSystem.deleteAsync(uri, { idempotent: true });
  if ((await fileSystem.getInfoAsync(uri)).exists) throw new Error('Could not remove a downloaded model. Retry deletion.');
}

export function deleteLocalAccount(): Promise<void> {
  if (!deletion) deletion = performDeletion().finally(() => { deletion = null; });
  return deletion;
}

async function performDeletion(): Promise<void> {
  // Require the native purge before changing any data, so an outdated binary cannot
  // report a successful reset while retaining its native credentials/databases.
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Use the mobile app to delete its local account.');
  const native = require('brown-account').default;
  if (!native?.purgePrivateStorage) throw new Error('Update the app before deleting this account.');
  const FileSystem = require('expo-file-system');
  const previous = await AsyncStorage.getItem(ACCOUNT_RESET_KEY);
  let retained: string[] = [];
  if (previous) {
    const pending = JSON.parse(previous);
    if (Array.isArray(pending.files)) retained = pending.files;
  }
  await AsyncStorage.setItem(ACCOUNT_RESET_KEY, JSON.stringify({ files: retained }));
  beginAccountReset();

  DesktopSyncService.getInstance().stopForAccountDeletion();
  TextToSpeechService.stop();
  await SpeechToTextService.cancelListening();
  await LlamaEngine.getInstance().unloadModel();
  await stopKokoroForAccountDeletion();
  const modelsDir = await StoragePaths.getModelsDir();
  const owned = await ModelDownloader.getInstance().stopForAccountDeletion();
  const files = [...new Set([...retained, ...owned])];
  await AsyncStorage.setItem(ACCOUNT_RESET_KEY, JSON.stringify({ files }));
  for (const uri of files) await eraseManagedModelFile(FileSystem, uri);

  // Voice assets in a chosen shared folder are individually app-owned files.
  // Preserve that folder and any unrelated files the user stored alongside them.
  for (const asset of KOKORO_ASSETS.files) {
    const uri = `${modelsDir}tts-cache/${KOKORO_ASSETS.engineKey}/${asset.fileName}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      if (info.isDirectory) throw new Error('A voice asset path points to a folder. Retry after removing that asset in Settings.');
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  }
  const notifications = require('expo-notifications');
  await notifications.cancelAllScheduledNotificationsAsync();
  await notifications.dismissAllNotificationsAsync();
  await AppDatabase.getInstance().closeForAccountDeletion();
  SecureStore.clearMemoryForAccountDeletion();
  // The native purge also removes AsyncStorage's underlying database and every
  // private preference file, including secure-store entries from older versions.
  await AsyncStorage.clear();
  await native.purgePrivateStorage();
}
