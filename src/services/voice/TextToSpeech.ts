import { Platform } from 'react-native';
import {
  getActiveKokoroVoice,
  getKokoroInstallStatus,
  KokoroVoiceId,
  isKokoroVoiceInstalled,
} from './KokoroTtsService';
import { streamKokoroOnnx, isKokoroOnnxRuntimeReady } from './KokoroOnnxEngine';

export type TtsStatus = 'idle' | 'loading' | 'speaking' | 'paused';

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
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
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
  private static cancelPlayback?: () => void;
  private static onStatus?: (status: TtsStatus) => void;

  private static updateStatus(status: TtsStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }

  private static async deleteAudio(uri: string): Promise<void> {
    try { await require('expo-file-system').deleteAsync(uri, { idempotent: true }); } catch {}
  }

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

  private static async synthesizeAndPlay(
    cleaned: string,
    voiceId: KokoroVoiceId,
    generation: number
  ): Promise<void> {
    if (!(await isKokoroOnnxRuntimeReady())) {
      throw new Error('Kokoro voice engine is not available in this build. Reinstall the Brown APK.');
    }
    if (generation !== this.speakGeneration) return;
    const { Audio } = require('expo-av');
    await Audio.setAudioModeAsync?.({ playsInSilentModeIOS: true, staysActiveInBackground: false });
    const chunks = streamKokoroOnnx(cleaned, voiceId, this.rate, () => generation !== this.speakGeneration);
    // Always handle prefetch failures immediately, including when playback is cancelled.
    const next = () => chunks.next().then(value => ({ value, error: null as unknown }), error => ({ value: null, error }));
    let pending = next();
    try {
      while (generation === this.speakGeneration) {
        const result = await pending;
        if (result.error) throw result.error;
        if (!result.value || result.value.done) break;
        const { uri } = result.value.value;
        if (generation !== this.speakGeneration) { await this.deleteAudio(uri); break; }
        let sound: any;
        let finish: () => void = () => {};
        let playbackError: Error | undefined;
        const finished = new Promise<void>(resolve => { finish = resolve; });
        this.cancelPlayback = finish;
        try {
          const created = await Audio.Sound.createAsync(
            { uri }, { shouldPlay: false, rate: 1.0, progressUpdateIntervalMillis: 100 }
          );
          sound = created.sound;
          if (generation !== this.speakGeneration) break;
          this.activeSound = sound;
          sound.setOnPlaybackStatusUpdate((status: any) => {
            if (generation !== this.speakGeneration) return;
            if (status.error) { playbackError = new Error(status.error); finish(); return; }
            if (!status.isLoaded) return;
            this.updateStatus(status.isPlaying ? 'speaking' : status.isBuffering ? 'loading' : this.status);
            if (status.didJustFinish) finish();
          });
          await sound.playAsync();
          // Generate only one chunk ahead, bounding memory and starting audio sooner.
          pending = next();
          await finished;
          if (playbackError) throw playbackError;
        } finally {
          if (this.activeSound === sound) { this.activeSound = null; this.cancelPlayback = undefined; }
          if (sound) {
            sound.setOnPlaybackStatusUpdate(null);
            try { await sound.stopAsync(); await sound.unloadAsync(); } catch {}
          }
          await this.deleteAudio(uri);
        }
        if (generation === this.speakGeneration) this.updateStatus('loading');
      }
    } finally {
      // A cancelled native inference may finish later; discard its file without playing it.
      const leftover = await pending;
      if (leftover.value && !leftover.value.done) await this.deleteAudio(leftover.value.value.uri);
      await chunks.return(undefined);
    }
  }

  static async speak(text: string, onDone?: () => void, onStatus?: (status: TtsStatus) => void): Promise<void> {
    this.stop();
    const generation = ++this.speakGeneration;
    this.onStatus = onStatus;
    this.onDone = onDone;
    this.fullText = stripForSpeech(text);
    this.updateStatus('loading');
    try {
      const voiceId = await getActiveKokoroVoice();
      if (generation !== this.speakGeneration) return;
      await this.ensureKokoroReady(voiceId);
      if (generation !== this.speakGeneration) return;
      if (this.fullText) await this.synthesizeAndPlay(this.fullText, voiceId, generation);
      if (generation !== this.speakGeneration) return;
      this.updateStatus('idle');
      this.fullText = '';
      this.onDone = undefined;
      this.onStatus = undefined;
      onDone?.();
    } catch (err) {
      if (generation !== this.speakGeneration) return;
      this.stop();
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async previewVoice(voiceId: KokoroVoiceId, text?: string): Promise<void> {
    this.stop();
    const generation = ++this.speakGeneration;
    this.updateStatus('loading');
    try {
      await this.ensureKokoroReady(voiceId);
      if (generation !== this.speakGeneration) return;
      await this.synthesizeAndPlay(stripForSpeech(text || '') || 'Hi, this is how I sound. Nice to meet you.', voiceId, generation);
      if (generation === this.speakGeneration) this.updateStatus('idle');
    } catch (err) {
      if (generation !== this.speakGeneration) return;
      this.stop();
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
    this.cancelPlayback?.();
    this.cancelPlayback = undefined;
    this.onStatus = undefined;
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
