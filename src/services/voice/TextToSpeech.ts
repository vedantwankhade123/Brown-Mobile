import { Platform } from 'react-native';
import {
  getActiveKokoroVoice,
  getKokoroInstallStatus,
  KokoroVoiceId,
  isKokoroVoiceInstalled,
} from './KokoroTtsService';
import { synthesizeKokoroOnnx, isKokoroOnnxRuntimeReady } from './KokoroOnnxEngine';

export type TtsStatus = 'idle' | 'speaking' | 'paused';

export class KokoroNotInstalledError extends Error {
  constructor() {
    super('Kokoro TTS is not installed on this device.');
    this.name = 'KokoroNotInstalledError';
  }
}

function stripForSpeech(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * On-device TTS: real Kokoro ONNX only. No system/browser voice — a missing
 * engine surfaces as an error instead of switching to a robotic fallback.
 */
export class TextToSpeechService {
  private static status: TtsStatus = 'idle';
  private static fullText = '';
  private static onDone?: () => void;
  private static paused = false;
  private static rate = 1.0;
  private static activeSound: any = null;
  private static speakGeneration = 0;

  static setRate(rate: number): void {
    this.rate = Math.min(1.6, Math.max(0.7, rate));
  }

  static async ensureKokoroReady(voiceId?: KokoroVoiceId): Promise<void> {
    const status = await getKokoroInstallStatus();
    if (!isKokoroVoiceInstalled(status, voiceId || await getActiveKokoroVoice())) {
      throw new KokoroNotInstalledError();
    }
  }

  private static async unloadActiveSound(): Promise<void> {
    const sound = this.activeSound;
    this.activeSound = null;
    if (!sound) return;
    try {
      await sound.stopAsync?.();
    } catch {}
    try {
      await sound.unloadAsync?.();
    } catch {}
  }

  /**
   * Synthesizes `cleaned` with `voiceId` through Kokoro ONNX and plays it.
   * Shared by `speak` (active voice) and `previewVoice` (explicit voice).
   */
  private static async synthesizeAndPlay(
    cleaned: string,
    voiceId: any,
    generation: number,
    onDone?: () => void
  ): Promise<void> {
    if (!(await isKokoroOnnxRuntimeReady())) {
      throw new Error(
        'Kokoro voice engine is not available in this build. Reinstall the Brown APK.'
      );
    }
    const result = await synthesizeKokoroOnnx(cleaned, voiceId, this.rate);
    if (generation !== this.speakGeneration) return;
    if (!result?.uri) {
      throw new Error('Kokoro ONNX returned no audio.');
    }
    const { Audio } = require('expo-av');
    await Audio.setAudioModeAsync?.({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: result.uri },
      { shouldPlay: true, rate: 1.0 }
    );
    if (generation !== this.speakGeneration) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {}
      return;
    }
    this.activeSound = sound;
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (!status?.isLoaded) return;
      const finished =
        status.didJustFinish ||
        (status.isPlaying === false &&
          status.durationMillis != null &&
          status.positionMillis >= status.durationMillis - 32);
      if (finished && this.activeSound === sound) {
        this.activeSound = null;
        this.status = 'idle';
        this.fullText = '';
        const done = this.onDone;
        this.onDone = undefined;
        done?.();
        sound.unloadAsync?.().catch(() => {});
      }
    });
  }

  static async speak(text: string, onDone?: () => void): Promise<void> {
    await this.ensureKokoroReady();
    const cleaned = stripForSpeech(text);
    if (!cleaned) {
      onDone?.();
      return;
    }

    this.stopInternal(false);
    const generation = ++this.speakGeneration;
    this.fullText = cleaned;
    this.onDone = onDone;
    this.paused = false;
    this.status = 'speaking';

    const voiceId = await getActiveKokoroVoice();
    try {
      await this.synthesizeAndPlay(cleaned, voiceId, generation, onDone);
    } catch (err) {
      this.status = 'idle';
      this.fullText = '';
      this.onDone = undefined;
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Plays a short preview using a specific (possibly inactive) voice.
   * Does not touch the active-speak text/callback.
   */
  static async previewVoice(voiceId: KokoroVoiceId, text?: string): Promise<void> {
    await this.ensureKokoroReady(voiceId);
    const cleaned =
      stripForSpeech(text || '') || 'Hi, this is how I sound. Nice to meet you.';
    this.stopInternal(false);
    const generation = ++this.speakGeneration;
    this.status = 'speaking';
    try {
      await this.synthesizeAndPlay(cleaned, voiceId, generation, () => {
        this.status = 'idle';
      });
    } catch (err) {
      this.status = 'idle';
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /** Pause = hard stop (Android Speech.pause is unreliable). */
  static pause(): void {
    this.stop();
  }

  static resume(): void {
    // Pause is a hard stop; resume is a no-op. Caller should call speak() again.
  }

  static stop(): void {
    this.stopInternal(true);
  }

  private static stopInternal(clearDone: boolean): void {
    this.speakGeneration += 1;
    void this.unloadActiveSound();
    this.status = 'idle';
    this.paused = false;
    this.fullText = '';
    if (clearDone) {
      this.onDone = undefined;
    }
  }

  static getIsSpeaking(): boolean {
    return this.status === 'speaking';
  }

  static getStatus(): TtsStatus {
    return this.status;
  }

  static getActiveText(): string {
    return this.fullText;
  }

  static isKokoroPreferredPlatform(): boolean {
    return Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web';
  }
}
