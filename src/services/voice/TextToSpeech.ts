export type TtsStatus = 'idle' | 'speaking' | 'paused';

export class TextToSpeechService {
  private static status: TtsStatus = 'idle';
  private static fullText = '';
  private static elapsedMs = 0;
  private static durationMs = 0;
  private static startedAt = 0;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;
  private static onDone?: () => void;

  static async speak(text: string, onDone?: () => void): Promise<void> {
    this.clearTimer();
    this.fullText = text;
    this.durationMs = Math.min(Math.max(text.length * 30, 800), 4000);
    this.elapsedMs = 0;
    this.onDone = onDone;
    this.startPlayback();
  }

  static pause(): void {
    if (this.status !== 'speaking') return;
    this.elapsedMs += Date.now() - this.startedAt;
    this.clearTimer();
    this.status = 'paused';
  }

  static resume(): void {
    if (this.status !== 'paused') return;
    this.startPlayback();
  }

  static stop(): void {
    this.clearTimer();
    this.status = 'idle';
    this.elapsedMs = 0;
    this.fullText = '';
    this.onDone = undefined;
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

  private static startPlayback(): void {
    this.status = 'speaking';
    this.startedAt = Date.now();
    const remaining = Math.max(this.durationMs - this.elapsedMs, 0);

    this.clearTimer();
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.status = 'idle';
      this.elapsedMs = 0;
      this.fullText = '';
      const done = this.onDone;
      this.onDone = undefined;
      done?.();
    }, remaining);
  }

  private static clearTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
