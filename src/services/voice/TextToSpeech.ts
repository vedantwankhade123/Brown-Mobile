import { Platform } from 'react-native';
import {
  getActiveKokoroVoice,
  getKokoroInstallStatus,
  KokoroVoiceId,
} from './KokoroTtsService';
import { synthesizeKokoroOnnx, isKokoroOnnxRuntimeReady } from './KokoroOnnxEngine';

const Speech = require('expo-speech') as {
  speak: (text: string, options?: any) => void;
  stop: () => void;
  pause?: () => void;
  resume?: () => void;
  isSpeakingAsync?: () => Promise<boolean>;
  getAvailableVoicesAsync?: () => Promise<Array<{ identifier: string; name?: string; language?: string }>>;
};

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

function pickSystemVoice(
  voices: Array<{ identifier: string; name?: string; language?: string }>,
  voiceId: KokoroVoiceId
): string | undefined {
  const wantFemale = voiceId === 'af_heart';
  const scored = voices
    .filter((v) => /en[-_]?us|en[-_]?gb|en\b/i.test(v.language || ''))
    .map((v) => {
      const name = `${v.name || ''} ${v.identifier || ''}`.toLowerCase();
      let score = 0;
      if (wantFemale && /female|zira|jenny|aria|samantha|susan|hazel|emma|karen|moira|fiona|tessa/.test(name)) score += 8;
      if (!wantFemale && /male|david|mark|guy|ryan|james|daniel|alex|fred|tom|aaron|gordon/.test(name)) score += 8;
      if (/enhanced|premium|neural|quality/.test(name)) score += 2;
      if (/en-us|en_us/.test((v.language || '').toLowerCase())) score += 1;
      return { id: v.identifier, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

/**
 * On-device TTS. Prefers real Kokoro ONNX (Heart / Michael). System speech is
 * last-resort fallback only when ONNX inference is unavailable.
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

  static async ensureKokoroReady(): Promise<void> {
    const status = await getKokoroInstallStatus();
    if (!status.fullyInstalled) {
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

    // 1) Prefer real Kokoro ONNX neural audio
    try {
      if (await isKokoroOnnxRuntimeReady()) {
        const result = await synthesizeKokoroOnnx(cleaned, voiceId, this.rate);
        if (generation !== this.speakGeneration) return;
        if (result?.uri) {
          const { Audio } = require('expo-av');
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
            if (status.didJustFinish || status.isPlaying === false && status.positionMillis >= (status.durationMillis || 0)) {
              if (this.activeSound === sound) {
                this.activeSound = null;
                this.status = 'idle';
                this.fullText = '';
                const done = this.onDone;
                this.onDone = undefined;
                done?.();
              }
              sound.unloadAsync?.().catch(() => {});
            }
          });
          return;
        }
      }
    } catch (err) {
      console.warn('[TTS] Kokoro ONNX playback failed, falling back to system speech:', (err as any)?.message || err);
    }

    if (generation !== this.speakGeneration) return;

    // 2) Last-resort system speech (must NOT be claimed as Kokoro neural)
    let voiceIdentifier: string | undefined;
    try {
      if (Speech.getAvailableVoicesAsync) {
        const voices = await Speech.getAvailableVoicesAsync();
        voiceIdentifier = pickSystemVoice(voices || [], voiceId);
      }
    } catch {}

    await new Promise<void>((resolve) => {
      if (generation !== this.speakGeneration) {
        resolve();
        return;
      }
      Speech.speak(cleaned, {
        language: 'en-US',
        rate: this.rate,
        pitch: voiceId === 'af_heart' ? 1.05 : 0.95,
        voice: voiceIdentifier,
        onDone: () => {
          if (generation !== this.speakGeneration) {
            resolve();
            return;
          }
          this.status = 'idle';
          this.fullText = '';
          const done = this.onDone;
          this.onDone = undefined;
          done?.();
          resolve();
        },
        onStopped: () => {
          if (generation === this.speakGeneration) {
            this.status = 'idle';
          }
          resolve();
        },
        onError: () => {
          if (generation === this.speakGeneration) {
            this.status = 'idle';
            const done = this.onDone;
            this.onDone = undefined;
            done?.();
          }
          resolve();
        },
      });
    });
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
    try {
      Speech.stop();
    } catch {}
    void this.unloadActiveSound();
    this.status = 'idle';
    this.paused = false;
    this.fullText = '';
    if (clearDone) {
      const done = this.onDone;
      this.onDone = undefined;
      // Do not call done on forced stop — UI clears its own speaking state.
      void done;
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
