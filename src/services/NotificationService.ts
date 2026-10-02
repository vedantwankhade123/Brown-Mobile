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

// expo-notifications drops every incoming notification — background included — unless a handler is
// registered before one arrives. Without this the channel, the permission and the post all succeed
// and nothing is ever shown.
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // the native handler module is optional; posting still works without it
  }
}

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
      },
      // expo-notifications reads channelId off the trigger, never off `content`.
      trigger: Platform.OS === 'android' ? ({ seconds: 1, channelId: UPDATE_CHANNEL } as any) : ({ seconds: 1 } as any),
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
      console.warn('[notifications] foreground chime only');
      await SoundService.playSound(chime);
      return;
    }
    if (!(await ensureChannel('assistant'))) {
      console.warn('[notifications] channel unavailable');
      return;
    }
    if (!(await notificationsAllowed())) {
      console.warn('[notifications] permission denied');
      return;
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body },
      // expo-notifications reads channelId off the trigger, never off `content`.
      trigger: (Platform.OS === 'android' ? { channelId: ASSISTANT_CHANNEL } : null) as any,
    });
    console.warn(`[notifications] posted ${id} on ${ASSISTANT_CHANNEL}`);
  } catch (err: any) {
    // alerts are never allowed to break the flow that finished
    console.warn('[notifications] post failed:', err?.message || err);
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

export async function getNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const perm = await Notifications.getPermissionsAsync();
    return Boolean(perm.granted);
  } catch {
    return false;
  }
}

/**
 * Android 13+ only shows the POST_NOTIFICATIONS dialog for a request made while the app is in
 * the foreground, so the reply-completion path can never obtain it by itself. Settings calls
 * this from a tap.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!(await ensureChannel('assistant'))) return false;
  return notificationsAllowed();
}

/**
 * Posts a real notification through the same channel the reply-completion path uses, so the user can
 * confirm the setup from a tap instead of waiting for a backgrounded generation.
 */
export async function sendTestNotification(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await ensureChannel('assistant'))) return false;
    if (!(await notificationsAllowed())) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Notifications work',
        body: 'Brown will use this channel for finished answers and model downloads.',
      },
      // expo-notifications reads channelId off the trigger, never off `content`.
      trigger: (Platform.OS === 'android' ? { channelId: ASSISTANT_CHANNEL } : null) as any,
    });
    return true;
  } catch (err: any) {
    console.warn('[notifications] test post failed:', err?.message || err);
    return false;
  }
}
