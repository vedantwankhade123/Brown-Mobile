import * as BrownRecorder from 'brown-recorder';
import { DesktopSyncService } from '../sync/DesktopSync';

const FileSystem = require('expo-file-system');
const { Audio } = require('expo-av');

export interface STTOptions {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (err: any) => void;
}

const MAX_RECORD_MS = 30_000;
const MIN_RECORD_MS = 600;

/**
 * Whisper STT. Captures real 16 kHz mono PCM WAV on-device (brown-recorder)
 * and transcribes with the Whisper engine on the paired Brown Desktop.
 * stopListening() finalizes; cancelListening() discards the recording.
 */
export class SpeechToTextService {
  private static listening = false;
  private static options: STTOptions | null = null;
  private static startedAt = 0;
  private static autoTimer: ReturnType<typeof setTimeout> | null = null;
  private static autoStoppedUri: string | null = null;

  static async startListening(options: STTOptions): Promise<void> {
    await SpeechToTextService.cancelListening();

    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Microphone permission denied. Allow microphone access in system settings, then try again.');
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    } catch {}

    if (!BrownRecorder.isRecorderAvailable()) {
      throw new Error(
        'Voice input recorder is unavailable. Reinstall the Brown app built from the latest dev client to enable Whisper voice input.'
      );
    }
    if (!BrownRecorder.startRecording()) {
      throw new Error('Recorder failed to start. Close other audio apps and try again.');
    }

    this.listening = true;
    this.options = options;
    this.startedAt = Date.now();
    this.autoStoppedUri = null;
    this.autoTimer = setTimeout(() => {
      if (!SpeechToTextService.listening) return;
      try {
        SpeechToTextService.autoStoppedUri = BrownRecorder.stopRecording();
      } catch {}
    }, MAX_RECORD_MS);
  }

  /** User confirmed stop — send the recording to Whisper and return the text. */
  static async stopListening(): Promise<string> {
    if (!this.listening) return '';
    this.clearAutoTimer();
    this.listening = false;

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
      const text = await DesktopSyncService.getInstance().transcribeAudio(wavBase64);
      if (text?.trim()) options?.onFinalResult?.(text.trim());
      return text;
    } catch (err: any) {
      options?.onError?.(err);
      throw err;
    }
  }

  /** User cancelled — discard the recording without transcribing. */
  static async cancelListening(): Promise<void> {
    this.clearAutoTimer();
    const wasListening = this.listening;
    this.listening = false;
    this.options = null;
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
  }

  static getIsListening(): boolean {
    return this.listening;
  }

  private static clearAutoTimer() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }
}
