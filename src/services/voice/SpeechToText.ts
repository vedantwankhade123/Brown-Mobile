export interface STTOptions {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (err: any) => void;
}

export class SpeechToTextService {
  private static isListening = false;

  static async startListening(options: STTOptions): Promise<void> {
    this.isListening = true;

    // Simulated STT for testing / preview
    const samplePhrases = [
      'Explain how neural quantization works on mobile NPUs.',
      'Summarize the core benefits of on-device local AI.',
      'Draft a TypeScript function for caching vector embeddings.',
      'What are the advantages of running Llama 3.2 offline?',
    ];
    const picked = samplePhrases[Math.floor(Math.random() * samplePhrases.length)];

    setTimeout(() => {
      options.onPartialResult?.(picked.slice(0, 20) + '...');
    }, 400);

    setTimeout(() => {
      options.onFinalResult?.(picked);
      this.isListening = false;
    }, 1100);
  }

  static async stopListening(): Promise<void> {
    this.isListening = false;
  }

  static getIsListening(): boolean {
    return this.isListening;
  }
}
