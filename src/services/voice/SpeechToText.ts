export interface STTOptions {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (err: any) => void;
}

/**
 * Speech-to-text session. Captures audio until the user explicitly stops.
 * Does NOT finalize / emit transcript until stopListening() is called.
 * cancelListening() discards the session without inserting text.
 */
export class SpeechToTextService {
  private static isListening = false;
  private static options: STTOptions | null = null;
  private static pendingTranscript = '';
  private static captureTimer: ReturnType<typeof setTimeout> | null = null;

  private static samplePhrases = [
    'Explain how neural quantization works on mobile NPUs.',
    'Summarize the core benefits of on-device local AI.',
    'Draft a TypeScript function for caching vector embeddings.',
    'What are the advantages of running Llama 3.2 offline?',
  ];

  static async startListening(options: STTOptions): Promise<void> {
    this.cancelTimers();
    this.isListening = true;
    this.options = options;
    this.pendingTranscript = '';

    // Simulated capture: accumulate a phrase while listening, but never finalize yet.
    // Real device STT should stream partials into pendingTranscript the same way.
    this.captureTimer = setTimeout(() => {
      if (!this.isListening) return;
      const picked = this.samplePhrases[Math.floor(Math.random() * this.samplePhrases.length)];
      this.pendingTranscript = picked;
      options.onPartialResult?.(picked);
    }, 600);
  }

  /** User confirmed stop — convert captured speech to text. */
  static async stopListening(): Promise<string> {
    this.cancelTimers();
    const wasListening = this.isListening;
    this.isListening = false;
    const text = (this.pendingTranscript || '').trim();
    this.options = null;
    this.pendingTranscript = '';
    return wasListening ? text : '';
  }

  /** User cancelled — discard without converting. */
  static async cancelListening(): Promise<void> {
    this.cancelTimers();
    this.isListening = false;
    this.options = null;
    this.pendingTranscript = '';
  }

  static getIsListening(): boolean {
    return this.isListening;
  }

  private static cancelTimers() {
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
  }
}
