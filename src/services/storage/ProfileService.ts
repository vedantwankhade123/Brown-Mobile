import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConsentService } from './ConsentService';
import { SecureStore } from './SecureStore';

const SYSTEM_PROMPT_KEY = '@ultron_system_prompt';
const GEMINI_KEY = 'gemini_api_key';

export interface UltronProfile {
  displayName: string;
  email: string;
  systemPrompt: string;
  geminiApiKey: string;
}

export class ProfileService {
  static async getLocalProfile(): Promise<UltronProfile> {
    const consent = await ConsentService.getLatestConsent();
    let systemPrompt = '';
    try {
      systemPrompt = (await AsyncStorage.getItem(SYSTEM_PROMPT_KEY)) || '';
    } catch {}
    let geminiApiKey = '';
    try {
      geminiApiKey = (await SecureStore.getItem(GEMINI_KEY)) || '';
    } catch {}
    return {
      displayName: consent?.fullName || '',
      email: consent?.email || '',
      systemPrompt,
      geminiApiKey,
    };
  }

  static async applyProfile(profile: Partial<UltronProfile>, merge = false): Promise<UltronProfile> {
    const current = await this.getLocalProfile();
    const next: UltronProfile = {
      displayName: merge
        ? pickLonger(current.displayName, profile.displayName)
        : (profile.displayName ?? current.displayName),
      email: merge ? pickLonger(current.email, profile.email) : (profile.email ?? current.email),
      systemPrompt: merge
        ? pickLonger(current.systemPrompt, profile.systemPrompt)
        : (profile.systemPrompt ?? current.systemPrompt),
      geminiApiKey: merge
        ? (profile.geminiApiKey || current.geminiApiKey)
        : (profile.geminiApiKey ?? current.geminiApiKey),
    };

    await ConsentService.recordConsent({
      fullName: next.displayName,
      email: next.email,
    });
    try {
      await AsyncStorage.setItem(SYSTEM_PROMPT_KEY, next.systemPrompt || '');
    } catch {}
    if (next.geminiApiKey) {
      await SecureStore.setItem(GEMINI_KEY, next.geminiApiKey);
    }
    return next;
  }

  static profilesDiffer(a: UltronProfile, b: UltronProfile): boolean {
    const nameA = (a.displayName || '').trim();
    const nameB = (b.displayName || '').trim();
    if (nameA && nameB && nameA !== nameB) return true;
    const promptA = (a.systemPrompt || '').trim();
    const promptB = (b.systemPrompt || '').trim();
    if (promptA && promptB && promptA !== promptB) return true;
    return false;
  }
}

function pickLonger(a?: string, b?: string): string {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}
