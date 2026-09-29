import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { UPDATE_CONFIG } from './updater/updateConfig';
import type { AppUpdateInfo } from './updater/GitHubUpdateService';

const LAST_NOTIFIED_KEY = UPDATE_CONFIG.STORAGE_KEYS.DISMISSED_VERSION + '_notified';

let channelReady = false;

/**
 * Local-only notifications (no push/FCM, no Expo push token — those crash in
 * Expo Go on SDK 51). Best-effort: every call is guarded, notifications must
 * never break app startup.
 */
async function ensureChannel(): Promise<boolean> {
  if (channelReady) return true;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('brown-updates', {
        name: 'App updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#295294',
      });
    }
    channelReady = true;
    return true;
  } catch {
    return false;
  }
}

export async function notifyUpdateAvailable(info: AppUpdateInfo): Promise<void> {
  try {
    const lastNotified = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
    if (lastNotified === info.latestVersion) return;

    if (!(await ensureChannel())) return;

    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted || perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }
    if (!granted) return;

    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, info.latestVersion);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Brown v${info.latestVersion} is available`,
        body: 'Tap to open Brown and update — chats, models and settings stay on this device.',
        ...(Platform.OS === 'android' ? { channelId: 'brown-updates' } : {}),
      },
      trigger: { seconds: 1 } as any,
    });
  } catch {
    // silent — the in-app update modal is the primary path
  }
}
