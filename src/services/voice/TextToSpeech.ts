import { Platform } from 'react-native';
import {
  getActiveKokoroVoice,
  getKokoroInstallStatus,
  KokoroVoiceId,
} from './KokoroTtsService';

const Speech = require('expo-speech') as {
  speak: (text: string, options?: any) => void;
  stop: () => void;
  pause?: () => void;
  resume?: () => void;
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
 * On-device TTS. Requires Kokoro engine + Heart/Michael voices to be installed.
 * Uses the selected Kokoro persona; plays via the best matching OS voice when
 * native ONNX inference is unavailable on React Native (graceful fallback).
 */
export class TextToSpeechService {
  private static status: TtsStatus = 'idle';
  private static fullText = '';
  private static onDone?: () => void;
  private static paused = false;
  private static rate = 1.0;

  static setRate(rate: number): void {
    this.rate = Math.min(1.6, Math.max(0.7, rate));
  }

  static async ensureKokoroReady(): Promise<void> {
    const status = await getKokoroInstallStatus();
    if (!status.fullyInstalled) {
      throw new KokoroNotInstalledError();
    }
  }

  static async speak(text: string, onDone?: () => void): Promise<void> {
    await this.ensureKokoroReady();
    const cleaned = stripForSpeech(text);
    if (!cleaned) {
      onDone?.();
      return;
    }

    this.stopInternal(false);
    this.fullText = cleaned;
    this.onDone = onDone;
    this.paused = false;
    this.status = 'speaking';

    const voiceId = await getActiveKokoroVoice();
    let voiceIdentifier: string | undefined;
    try {
      if (Speech.getAvailableVoicesAsync) {
        const voices = await Speech.getAvailableVoicesAsync();
        voiceIdentifier = pickSystemVoice(voices || [], voiceId);
      }
    } catch {}

    await new Promise<void>((resolve) => {
      Speech.speak(cleaned, {
        language: 'en-US',
        rate: this.rate,
        pitch: voiceId === 'af_heart' ? 1.05 : 0.95,
        voice: voiceIdentifier,
        onDone: () => {
          this.status = 'idle';
          this.fullText = '';
          const done = this.onDone;
          this.onDone = undefined;
          done?.();
          resolve();
        },
        onStopped: () => {
          this.status = 'idle';
          resolve();
        },
        onError: () => {
          this.status = 'idle';
          const done = this.onDone;
          this.onDone = undefined;
          done?.();
          resolve();
        },
      });
    });
  }

  static pause(): void {
    if (this.status !== 'speaking') return;
    try {
      if (Speech.pause) {
        Speech.pause();
        this.status = 'paused';
        this.paused = true;
      } else {
        this.stop();
      }
    } catch {
      this.stop();
    }
  }

  static resume(): void {
    if (this.status !== 'paused') return;
    try {
      if (Speech.resume) {
        Speech.resume();
        this.status = 'speaking';
        this.paused = false;
      } else {
        const text = this.fullText;
        const done = this.onDone;
        if (text) this.speak(text, done).catch(() => {});
      }
    } catch {
      const text = this.fullText;
      const done = this.onDone;
      if (text) this.speak(text, done).catch(() => {});
    }
  }

  static stop(): void {
    this.stopInternal(true);
  }

  private static stopInternal(clearDone: boolean): void {
    try {
      Speech.stop();
    } catch {}
    this.status = 'idle';
    this.paused = false;
    this.fullText = '';
    if (clearDone) this.onDone = undefined;
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
