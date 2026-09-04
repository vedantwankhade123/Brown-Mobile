import { Platform } from 'react-native';

/**
 * Copy plain text using Expo Go's built-in ExpoClipboard native module.
 * Avoids @react-native-clipboard (needs a custom native rebuild) and the
 * expo-clipboard JS entry (Metro can fail resolving Clipboard.types).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text || '');
  if (!value) return false;

  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    const ExpoClipboard = requireNativeModule('ExpoClipboard');
    if (typeof ExpoClipboard?.setStringAsync === 'function') {
      await ExpoClipboard.setStringAsync(value, {});
      return true;
    }
    if (typeof ExpoClipboard?.setString === 'function') {
      ExpoClipboard.setString(value);
      return true;
    }
  } catch {
    // ExpoClipboard not available in this runtime
  }

  return false;
}
