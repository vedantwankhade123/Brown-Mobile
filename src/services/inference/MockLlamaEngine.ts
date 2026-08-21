import { ChatMessage, GenerationStats } from '../../types/chat';
import { ModelMetadata, InferenceSettings } from '../../types/model';

/**
 * High performance mock / simulator engine for development, UI preview,
 * and environments without direct mobile GPU runtime.
 */
export class MockLlamaEngine {
  private activeModel: ModelMetadata | null = null;
  private isGenerating = false;
  private shouldStop = false;

  async loadModel(model: ModelMetadata, settings?: Partial<InferenceSettings>): Promise<boolean> {
    // Simulate loading delay based on model size
    await new Promise((resolve) => setTimeout(resolve, 600));
    this.activeModel = model;
    return true;
  }

  async unloadModel(): Promise<void> {
    this.activeModel = null;
  }

  isLoaded(): boolean {
    return this.activeModel !== null;
  }

  getActiveModel(): ModelMetadata | null {
    return this.activeModel;
  }

  stopGeneration(): void {
    this.shouldStop = true;
  }

  async generateStream(
    prompt: string,
    history: ChatMessage[],
    settings: InferenceSettings,
    onToken: (token: string) => void,
    onComplete: (fullText: string, stats: GenerationStats) => void
  ): Promise<void> {
    if (this.isGenerating) {
      throw new Error('Inference is already in progress');
    }

    this.isGenerating = true;
    this.shouldStop = false;

    const startTime = Date.now();
    const lastUserMessage = history[history.length - 1]?.content || prompt;

    // Generate intelligent contextual response
    const generatedResponse = this.craftContextualResponse(lastUserMessage, this.activeModel?.name);
    const words = generatedResponse.split(' ');

    let accumulatedText = '';
    let tokenCount = 0;

    for (let i = 0; i < words.length; i++) {
      if (this.shouldStop) {
        break;
      }

      const token = (i > 0 ? ' ' : '') + words[i];
      accumulatedText += token;
      tokenCount += 1;
      onToken(token);

      // Simulate realistic on-device mobile token speed (~25-45 ms/token -> 25-40 tokens/sec)
      await new Promise((resolve) => setTimeout(resolve, 32));
    }

    const elapsedMs = Math.max(Date.now() - startTime, 1);
    const tokensPerSec = Number(((tokenCount / elapsedMs) * 1000).toFixed(1));

    const stats: GenerationStats = {
      tokensEvaluated: Math.round(prompt.length / 4),
      tokensGenerated: tokenCount,
      evalDurationMs: Math.min(elapsedMs, 40),
      generateDurationMs: elapsedMs,
      tokensPerSecond: tokensPerSec,
    };

    this.isGenerating = false;
    onComplete(accumulatedText, stats);
  }

  private craftContextualResponse(userInput: string, modelName = 'Ultron SLM'): string {
    const inputLower = userInput.toLowerCase();

    if (inputLower.includes('hello') || inputLower.includes('hi') || inputLower.includes('hey')) {
      return `Greetings! I am **Ultron Mobile**, running completely on-device with ${modelName}. No internet connection or cloud servers are used for this response. How can I assist your workflow today?`;
    }

    if (inputLower.includes('who are you') || inputLower.includes('what are you')) {
      return `I am **Ultron Mobile**, an offline privacy-first AI companion. I run quantized GGUF neural models directly on your smartphone's Neural Engine & GPU with zero data tracking or cloud transmission.`;
    }

    if (inputLower.includes('code') || inputLower.includes('function') || inputLower.includes('javascript') || inputLower.includes('python')) {
      return `Here is an optimized example for your request:\n\n\`\`\`typescript\n// Fast On-Device Buffer Pipeline\nexport function computeThroughput(tokens: number, durationMs: number): number {\n  if (durationMs <= 0) return 0;\n  return Number(((tokens / durationMs) * 1000).toFixed(2));\n}\n\`\`\`\n\nThis executes in constant $O(1)$ time complexity and minimal memory allocation.`;
    }

    return `I processed your request using **${modelName}** offline on-device.\n\nKey analysis:\n1. **Local Privacy**: 100% offline on-device compute.\n2. **Low Latency**: Direct hardware inference via NPU/GPU acceleration.\n3. **Reliability**: Fully functional without cellular data or Wi-Fi.\n\nLet me know if you would like me to elaborate or format this in another format!`;
  }
}
