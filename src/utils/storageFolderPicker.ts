import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';

export const treeUriToNativePath = (uri: string): string | null => {
  const prefix = 'content://com.android.externalstorage.documents/tree/';
  if (!uri.startsWith(prefix)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri.slice(prefix.length).split('?')[0]);
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  const volume = decoded.slice(0, colon);
  const subPath = decoded.slice(colon + 1);
  const base = volume === 'primary' ? '/storage/emulated/0' : `/storage/${volume}`;
  return subPath ? `${base}/${subPath}` : base;
};

export function confirmFolderSelection(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('Use this folder?', path, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Use folder', onPress: () => resolve(true) },
    ]);
  });
}

export async function pickStorageFolder(): Promise<string | null> {
  const selection = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!selection.granted) return null;
  const path = treeUriToNativePath(selection.directoryUri);
  if (!path) throw new Error('Choose a folder on this device or its SD card.');
  if (!await confirmFolderSelection(path)) return null;
  return path.endsWith('/') ? path : path + '/';
}
