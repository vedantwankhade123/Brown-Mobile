import * as BrownRecorder from 'brown-recorder';
import {
  cancelSpeech,
  isSpeechSupported,
  startSpeech,
  stopSpeech,
  subscribeSpeech,
} from 'brown-speech';
import { DesktopSyncService } from '../sync/DesktopSync';

const FileSystem = require('expo-file-system');
const { Audio } = require('expo-av');

export interface STTOptions {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (err: any) => void;
}

export type STTEngine = 'native' | 'whisper';

const MAX_RECORD_MS = 30_000;
const MIN_RECORD_MS = 600;
/** The recognizer answers a stop within a few hundred ms. This only keeps a hung speech
 * service from leaving the mic button stuck in the listening state forever. */
const NATIVE_STOP_TIMEOUT_MS = 5_000;
/** SpeechRecognizer codes that mean this phone cannot dictate natively: it needed a server
 * (1 NETWORK_TIMEOUT, 2 NETWORK, 4 SERVER, 11 SERVER_DISCONNECTED) or the recognizer is not
 * really usable (-1, -2 from brown-speech when `isSupported` was optimistic). */
const NATIVE_UNAVAILABLE_CODES = [1, 2, 4, 11, -1, -2];
const PERMISSION_DENIED =
  'Microphone permission denied. Allow microphone access in system settings, then try again.';

/**
 * Voice input. Two real engines, chosen per tap:
 *
 * - `native` — the phone's own SpeechRecognizer (brown-speech). On-device, nothing written
 *   to disk, live partials, no desktop involved.
 * - `whisper` — 16 kHz PCM captured by brown-recorder and transcribed by Whisper on the
 *   paired Brown Desktop. Used when the phone has no recognition service (and by APKs
 *   built before brown-speech existed).
 */
export class SpeechToTextService {
  private static listening = false;
  private static options: STTOptions | null = null;
  private static engine: STTEngine | null = null;
  private static starting = false;
  private static generation = 0;
  private static stopping: Promise<string> | null = null;

  // native recognizer state
  private static sub: { remove(): void } | null = null;
  private static lastPartial = '';
  private static stopResolver: ((text: string) => void) | null = null;
  private static stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set when the recognizer failed in a way retrying will not fix, so the next tap goes
   * straight to Whisper instead of repeating the same failure. Cleared by a good transcript. */
  private static nativeUnavailable = false;

  // whisper recorder state
  private static startedAt = 0;
  private static autoTimer: ReturnType<typeof setTimeout> | null = null;
  private static autoStoppedUri: string | null = null;

  static async startListening(options: STTOptions): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
    await SpeechToTextService.cancelListening();
    const generation = this.generation;

    const perm = await Audio.requestPermissionsAsync();
    if (generation !== this.generation) return;
    if (!perm.granted) {
      throw new Error(PERMISSION_DENIED);
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    } catch {}
    if (generation !== this.generation) return;

    this.options = options;
    if (this.shouldUseNative() && this.startNative()) return;
    this.startWhisper();
    } finally { this.starting = false; }
  }

  /** User confirmed stop — returns everything recognized so far. */
  static async stopListening(): Promise<string> {
    if (this.stopping) return this.stopping;
    if (this.starting) { await this.cancelListening(); return ''; }
    if (!this.listening) return '';
    const generation = this.generation;
    this.stopping = this.engine === 'native' ? this.stopNative() : this.stopWhisper();
    try {
      const text = await this.stopping;
      return generation === this.generation ? text : '';
    } finally { this.stopping = null; }
  }

  /** User cancelled — discard without producing a transcript. */
  static async cancelListening(): Promise<void> {
    ++this.generation;
    const engine = this.engine;
    const wasListening = this.listening;
    this.listening = false;
    this.options = null;
    this.lastPartial = '';
    this.clearAutoTimer();

    if (engine === 'native') {
      try {
        cancelSpeech();
      } catch {}
      this.teardownNative();
      this.resolveStop('');
      return;
    }

    const stale = this.autoStoppedUri;
    this.autoStoppedUri = null;
    const cleanup = (uri: string | null) => {
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    };
    cleanup(stale);
    if (wasListening) {
      try {
        cleanup(BrownRecorder.stopRecording());
      } catch {}
    }
    this.engine = null;
  }

  static getIsListening(): boolean {
    return this.listening;
  }

  /** What the next mic tap would use — reported by Settings so its copy matches reality. */
  static getPreferredEngine(): STTEngine {
    return this.shouldUseNative() ? 'native' : 'whisper';
  }

  private static shouldUseNative(): boolean {
    if (!isSpeechSupported()) return false;
    // Native already proved unusable on this phone. Whisper is only worth switching to when a
    // desktop is actually there to transcribe; otherwise retry native and show its own error.
    if (this.nativeUnavailable && DesktopSyncService.getInstance().getStatus().isConnected) {
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- native recognizer

  private static startNative(): boolean {
    const generation = this.generation;
    this.lastPartial = '';
    this.engine = 'native';
    this.listening = true;
    this.sub = subscribeSpeech({
      onPartial: (text) => {
        if (this.engine !== 'native' || generation !== this.generation) return;
        this.lastPartial = text;
        this.options?.onPartialResult?.(text);
      },
      onFinal: (text) => {
        if (this.engine !== 'native' || generation !== this.generation) return;
        const final = (text || this.lastPartial).trim();
        this.lastPartial = final;
        this.listening = false;
        if (final) this.nativeUnavailable = false;
        this.deliver(final);
        if (!final) this.options?.onError?.(new Error('No speech was detected. Tap the mic and try again.'));
        this.teardownNative();
      },
      onError: (message, code, partialText) => {
        if (this.engine !== 'native' || generation !== this.generation) return;
        const heard = (partialText || this.lastPartial).trim();
        this.listening = false;
        // A failure at the tail of a sentence must not throw the sentence away.
        if (heard) {
          this.deliver(heard);
          this.teardownNative();
          return;
        }
        if (NATIVE_UNAVAILABLE_CODES.includes(code)) this.nativeUnavailable = true;
        this.deliver('');
        this.options?.onError?.(new Error(message));
        this.teardownNative();
      },
    });

    if (!startSpeech({ continuous: true, preferOffline: true })) {
      this.listening = false;
      try {
        cancelSpeech();
      } catch {}
      this.teardownNative();
      return false;
    }
    return true;
  }

  private static stopNative(): Promise<string> {
    this.listening = false;
    return new Promise<string>((resolve) => {
      // The transcript comes back over the event bridge, not as a return value.
      this.stopResolver = resolve;
      this.stopTimer = setTimeout(() => {
        const heard = this.lastPartial.trim();
        cancelSpeech();
        this.teardownNative();
        this.resolveStop(heard);
      }, NATIVE_STOP_TIMEOUT_MS);
      try {
        stopSpeech();
      } catch {
        cancelSpeech();
        this.teardownNative();
        this.resolveStop(this.lastPartial.trim());
      }
    });
  }

  private static resolveStop(text: string) {
    const resolve = this.stopResolver;
    this.stopResolver = null;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (resolve) resolve(text);
  }

  /** A stop that is already awaiting gets the transcript as its return value, so only a
   * session that ended on its own may use the callback — otherwise the composer would
   * insert the same sentence twice. */
  private static deliver(text: string) {
    const awaited = this.stopResolver !== null;
    this.resolveStop(text);
    if (text && !awaited) this.options?.onFinalResult?.(text);
  }

  private static teardownNative() {
    const sub = this.sub;
    this.sub = null;
    if (sub) {
      try {
        sub.remove();
      } catch {}
    }
    if (this.engine === 'native') this.engine = null;
  }

  // ---------------------------------------------------------------- whisper via desktop

  private static startWhisper(): void {
    if (!BrownRecorder.isRecorderAvailable()) {
      this.options = null;
      throw new Error(
        'Voice input is unavailable on this phone. Reinstall the Brown app built from the latest dev client, or pair with Brown Desktop for Whisper transcription.'
      );
    }
    if (!BrownRecorder.startRecording()) {
      this.options = null;
      throw new Error('Recorder failed to start. Close other audio apps and try again.');
    }

    this.engine = 'whisper';
    this.listening = true;
    this.startedAt = Date.now();
    this.autoStoppedUri = null;
    this.autoTimer = setTimeout(() => {
      if (!SpeechToTextService.listening) return;
      try {
        SpeechToTextService.autoStoppedUri = BrownRecorder.stopRecording();
      } catch {}
    }, MAX_RECORD_MS);
  }

  private static async stopWhisper(): Promise<string> {
    const generation = this.generation;
    this.clearAutoTimer();
    this.listening = false;
    this.engine = null;

    let uri = this.autoStoppedUri;
    this.autoStoppedUri = null;
    if (!uri) {
      const duration = Date.now() - this.startedAt;
      uri = BrownRecorder.stopRecording();
      if (duration < MIN_RECORD_MS) {
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        this.options = null;
        return '';
      }
    }
    const options = this.options;
    this.options = null;

    if (!uri) {
      throw new Error('No audio was captured. Make sure the microphone is free and try again.');
    }

    let wavBase64 = '';
    try {
      wavBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      throw new Error('Could not read the recording. Try again.');
    } finally {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }

    try {
      // The caller of stopListening() inserts the returned transcript; firing the callback
      // here too would put the same sentence in the composer twice.
      return await DesktopSyncService.getInstance().transcribeAudio(wavBase64);
    } catch (err: any) {
      if (generation === this.generation) options?.onError?.(err);
      throw err;
    }
  }

  private static clearAutoTimer() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }
}
