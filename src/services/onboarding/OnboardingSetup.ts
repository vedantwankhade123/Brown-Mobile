import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConsentService } from '../storage/ConsentService';
import { isAccountResetting } from '../storage/AccountLifecycle';
import {
  KOKORO_VOICES, KokoroVoiceId, downloadKokoroEngine, downloadKokoroVoice,
  getKokoroInstallStatus, isKokoroVoiceInstalled, setActiveKokoroVoice,
} from '../voice/KokoroTtsService';

export const VOICE_CHOICE_KEY = '@brown/onboarding_voice_choice';
export const PENDING_HUB_KEY = '@brown/onboarding_hub_pending';
export const PENDING_VOICE_KEY = '@brown/onboarding_voice_pending';
export type VoiceChoice = { enabled: boolean; voiceId: KokoroVoiceId };
const defaultChoice: VoiceChoice = { enabled: true, voiceId: 'af_heart' };

export async function getOnboardingVoiceChoice(): Promise<VoiceChoice> {
  try {
    const choice = JSON.parse(await AsyncStorage.getItem(VOICE_CHOICE_KEY) || 'null');
    if (KOKORO_VOICES.some(voice => voice.voiceId === choice?.voiceId)) {
      return { enabled: choice.enabled !== false, voiceId: choice.voiceId };
    }
  } catch {}
  return defaultChoice;
}

export async function saveOnboardingVoiceChoice(choice: VoiceChoice): Promise<void> {
  if (!KOKORO_VOICES.some(voice => voice.voiceId === choice.voiceId)) throw new Error('Choose a supported voice.');
  await AsyncStorage.setItem(VOICE_CHOICE_KEY, JSON.stringify(choice));
}

/** The completion marker is last: failed local writes must leave setup retryable. */
export async function completeMobileOnboarding(name: string, choice: VoiceChoice, checkHub = false): Promise<void> {
  const fullName = name.trim().replace(/\s+/g, ' ');
  if (!fullName) throw new Error('Please enter your name.');
  if (isAccountResetting()) throw new Error('Account reset is in progress. Please try again.');
  await saveOnboardingVoiceChoice(choice);
  const consent = await ConsentService.recordConsent({ fullName, agreedToTerms: true, agreedToPrivacyPolicy: true });
  const existing = JSON.parse(await AsyncStorage.getItem('@ultron_user_profile') || '{}');
  await AsyncStorage.setItem('@ultron_user_profile', JSON.stringify({ ...existing, fullName,
    completedAt: Date.now(), consentId: consent.id, consentTimestamp: consent.agreedAt }));
  if (choice.enabled) await AsyncStorage.setItem(PENDING_VOICE_KEY, JSON.stringify(choice));
  else await AsyncStorage.removeItem(PENDING_VOICE_KEY);
  if (checkHub) await AsyncStorage.setItem(PENDING_HUB_KEY, 'true');
  else await AsyncStorage.removeItem(PENDING_HUB_KEY);
  await AsyncStorage.setItem('@ultron_onboarding_completed', 'true');
  setupDownloads.clear();
  setupListeners.forEach(listener => listener(getSetupDownloads()));
  if (choice.enabled) {
    publishSetupDownload({ id: 'engine', name: 'Kokoro engine', status: 'Queued', percent: 0 });
    publishSetupDownload({ id: 'voice', name: KOKORO_VOICES.find(v => v.voiceId === choice.voiceId)?.label || choice.voiceId, status: 'Queued', percent: 0 });
  }
  if (checkHub) publishSetupDownload({ id: 'hub', name: 'Hugging Face connection', status: 'Queued', percent: 0 });
}

let backgroundSetup: Promise<void> | null = null;
/** Reuses installed assets; failures retain the pending choice for retry after restart. */
function resumeVoiceAssets(): Promise<void> {
  if (backgroundSetup) return backgroundSetup;
  backgroundSetup = (async () => {
    if (isAccountResetting()) return;
    const raw = await AsyncStorage.getItem(PENDING_VOICE_KEY);
    if (!raw) return;
    const choice: VoiceChoice = JSON.parse(raw);
    if (!choice.enabled || !KOKORO_VOICES.some(voice => voice.voiceId === choice.voiceId)) return;
    publishSetupDownload({ id: 'engine', name: 'Kokoro engine', status: 'Queued', percent: 0 });
    publishSetupDownload({ id: 'voice', name: KOKORO_VOICES.find(v => v.voiceId === choice.voiceId)?.label || choice.voiceId, status: 'Queued', percent: 0 });
    let status = await getKokoroInstallStatus();
    if (!status.engineInstalled) {
      const result = await downloadKokoroEngine(p => publishSetupDownload({ id: 'engine', name: 'Kokoro engine', status: 'Downloading', percent: p.percent }));
      if (!result.success) throw new Error(result.error || 'Voice engine setup paused. Retry in Settings → Voice.');
    }
    publishSetupDownload({ id: 'engine', name: 'Kokoro engine', status: 'Completed', percent: 100 });
    if (isAccountResetting()) return;
    status = await getKokoroInstallStatus();
    if (!isKokoroVoiceInstalled(status, choice.voiceId)) {
      const result = await downloadKokoroVoice(choice.voiceId, p => publishSetupDownload({ id: 'voice', name: KOKORO_VOICES.find(v => v.voiceId === choice.voiceId)?.label || choice.voiceId, status: 'Downloading', percent: p.percent }));
      if (!result.success) throw new Error(result.error || 'Voice setup paused. Retry in Settings → Voice.');
    }
    if (isAccountResetting() || await AsyncStorage.getItem(PENDING_VOICE_KEY) !== raw) return;
    await setActiveKokoroVoice(choice.voiceId);
    await AsyncStorage.removeItem(PENDING_VOICE_KEY);
    publishSetupDownload({ id: 'voice', name: KOKORO_VOICES.find(v => v.voiceId === choice.voiceId)?.label || choice.voiceId, status: 'Completed', percent: 100 });
  })().finally(() => { backgroundSetup = null; });
  return backgroundSetup;
}

export type SetupDownloadItem = { id: string; name: string; status: string; percent: number; error?: string };
const setupDownloads = new Map<string, SetupDownloadItem>();
const setupListeners = new Set<(items: SetupDownloadItem[]) => void>();
export function getSetupDownloads(): SetupDownloadItem[] { return [...setupDownloads.values()]; }
function publishSetupDownload(item: SetupDownloadItem): void {
  setupDownloads.set(item.id, item);
  setupListeners.forEach(listener => listener(getSetupDownloads()));
}
export function subscribeSetupDownloads(listener: (items: SetupDownloadItem[]) => void): () => void {
  setupListeners.add(listener); listener(getSetupDownloads());
  return () => { setupListeners.delete(listener); };
}
async function checkPendingHub(): Promise<void> {
  if (isAccountResetting() || await AsyncStorage.getItem(PENDING_HUB_KEY) !== 'true') return;
  publishSetupDownload({ id: 'hub', name: 'Hugging Face connection', status: 'Checking', percent: 0 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch('https://huggingface.co/api/models?limit=1', { signal: controller.signal });
    if (!response.ok) throw new Error('Connection unavailable. Retry when online.');
    if (isAccountResetting()) return;
    await AsyncStorage.removeItem(PENDING_HUB_KEY);
    publishSetupDownload({ id: 'hub', name: 'Hugging Face connection', status: 'Completed', percent: 100 });
  } catch (error: any) {
    publishSetupDownload({ id: 'hub', name: 'Hugging Face connection', status: 'Paused', percent: 0, error: 'Offline · tap Retry when connected.' });
  } finally { clearTimeout(timer); }
}
let allSetup: Promise<void> | null = null;
export function resumeOnboardingVoiceSetup(): Promise<void> {
  if (allSetup) return allSetup;
  allSetup = (async () => {
    const hub = checkPendingHub();
    try { await resumeVoiceAssets(); }
    catch (error: any) {
      for (const item of getSetupDownloads()) if (item.id !== 'hub' && item.status !== 'Completed') publishSetupDownload({ ...item, status: 'Paused', error: error.message });
      throw error;
    } finally { await hub; }
  })().finally(() => { allSetup = null; });
  return allSetup;
}
