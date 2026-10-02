import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { UPDATE_CONFIG } from './updater/updateConfig';
import { SoundService } from './sound/SoundService';
import type { AppUpdateInfo } from './updater/GitHubUpdateService';

const LAST_NOTIFIED_KEY = UPDATE_CONFIG.STORAGE_KEYS.DISMISSED_VERSION + '_notified';

const UPDATE_CHANNEL = 'brown-updates';
const ASSISTANT_CHANNEL = 'brown-assistant';

let updateChannelReady = false;
let assistantChannelReady = false;

/**
 * Local-only notifications (no push/FCM, no Expo push token — those crash in
 * Expo Go on SDK 51). Best-effort: every call is guarded, notifications must
 * never break app startup.
 */
async function ensureChannel(channel: 'updates' | 'assistant'): Promise<boolean> {
  const ready = channel === 'updates' ? updateChannelReady : assistantChannelReady;
  if (ready) return true;
  try {
    if (Platform.OS === 'android') {
      if (channel === 'updates') {
        await Notifications.setNotificationChannelAsync(UPDATE_CHANNEL, {
          name: 'App updates',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#295294',
        });
        updateChannelReady = true;
      } else {
        await Notifications.setNotificationChannelAsync(ASSISTANT_CHANNEL, {
          name: 'Assistant',
          description: 'Finished answers, model downloads and other agent events.',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 120, 80, 120],
          lightColor: '#295294',
        });
        assistantChannelReady = true;
      }
    } else {
      if (channel === 'updates') updateChannelReady = true;
      else assistantChannelReady = true;
    }
    return true;
  } catch {
    return false;
  }
}

async function notificationsAllowed(): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted || perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }
    return granted;
  } catch {
    return false;
  }
}

async function notifyUpdateAvailableInternal(info: AppUpdateInfo): Promise<void> {
  try {
    const lastNotified = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
    if (lastNotified === info.latestVersion) return;

    if (!(await ensureChannel('updates'))) return;
    if (!(await notificationsAllowed())) return;

    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, info.latestVersion);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Brown v${info.latestVersion} is available`,
        body: 'Tap to open Brown and update — chats, models and settings stay on this device.',
        ...(Platform.OS === 'android' ? { channelId: UPDATE_CHANNEL } : {}),
      },
      trigger: { seconds: 1 } as any,
    });
  } catch {
    // silent — the in-app update modal is the primary path
  }
}

export async function notifyUpdateAvailable(info: AppUpdateInfo): Promise<void> {
  await notifyUpdateAvailableInternal(info);
}

function clip(text: string, max = 90): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * One entry point for agent events. Foreground → the same chimes the desktop
 * plays; background → a real heads-up notification (sound + vibration) so a
 * finished answer or download still reaches the user.
 */
async function alertEvent(
  title: string,
  body: string,
  chime: 'task-complete' | 'permission' | 'question'
): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await SoundService.playSound(chime);
      return;
    }
    if (AppState.currentState === 'active') {
      await SoundService.playSound(chime);
      return;
    }
    if (!(await ensureChannel('assistant'))) return;
    if (!(await notificationsAllowed())) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...(Platform.OS === 'android' ? { channelId: ASSISTANT_CHANNEL } : {}),
      },
      trigger: null as any,
    });
  } catch {
    // alerts are never allowed to break the flow that finished
  }
}

export function alertReplyReady(lastUserText: string): Promise<void> {
  const snippet = clip(lastUserText);
  return alertEvent(
    'Brown finished your answer',
    snippet ? `Re: ${snippet}` : 'Your reply is ready in Brown.',
    'task-complete'
  );
}

export function alertDownloadComplete(modelName: string): Promise<void> {
  return alertEvent(
    'Model ready',
    `${modelName} finished downloading and is ready to use.`,
    'task-complete'
  );
}

export function alertModelFailed(modelName: string, reason?: string): Promise<void> {
  return alertEvent(
    'Model download failed',
    clip(`${modelName}: ${reason || 'Check storage and network, then retry from Models.'}`, 140),
    'permission'
  );
}
