import { ChatMessage, GenerationStats } from '../../types/chat';
import { ModelMetadata, InferenceSettings } from '../../types/model';
import { formatPromptForModel } from './PromptTemplates';
import { MockLlamaEngine } from './MockLlamaEngine';
import { streamGeminiReply } from './GeminiClient';
import { streamCloudReply, CloudProviderId } from './CloudProviders';

const CLOUD_PROVIDER_IDS: CloudProviderId[] = ['openai', 'anthropic', 'deepseek', 'groq', 'custom'];

export interface ILlamaService {
  loadModel(model: ModelMetadata, settings?: Partial<InferenceSettings>): Promise<boolean>;
  unloadModel(): Promise<void>;
  isLoaded(): boolean;
  getActiveModel(): ModelMetadata | null;
  stopGeneration(): void;
  generateStream(
    prompt: string,
    history: ChatMessage[],
    settings: InferenceSettings,
    onToken: (token: string) => void,
    onComplete: (fullText: string, stats: GenerationStats) => void
  ): Promise<void>;
}

export class LlamaEngine implements ILlamaService {
  private static instance: LlamaEngine;
  private mockEngine: MockLlamaEngine;
  private activeModel: ModelMetadata | null = null;
  private isGenerating = false;
  private llamaContext: any = null;
  private useNativeEngine = false;

  private constructor() {
    this.mockEngine = new MockLlamaEngine();
  }

  public static getInstance(): LlamaEngine {
    if (!LlamaEngine.instance) {
      LlamaEngine.instance = new LlamaEngine();
    }
    return LlamaEngine.instance;
  }

  async loadModel(model: ModelMetadata, settings?: Partial<InferenceSettings>): Promise<boolean> {
    if (this.isGenerating) {
      this.stopGeneration();
    }

    if (this.llamaContext) {
      await this.unloadModel();
    }

    this.activeModel = model;
    return this.mockEngine.loadModel(model, settings);
  }

  async unloadModel(): Promise<void> {
    if (this.llamaContext) {
      try {
        await this.llamaContext.release();
      } catch (err) {
        console.warn('Error releasing llama context:', err);
      }
      this.llamaContext = null;
    }
    this.activeModel = null;
    await this.mockEngine.unloadModel();
  }

  isLoaded(): boolean {
    return this.activeModel !== null;
  }

  getActiveModel(): ModelMetadata | null {
    return this.activeModel;
  }

  stopGeneration(): void {
    this.isGenerating = false;
    if (this.llamaContext) {
      try {
        this.llamaContext.stopCompletion();
      } catch (err) {
        console.warn('Error stopping llama completion:', err);
      }
    }
    this.mockEngine.stopGeneration();
  }

  async generateStream(
    prompt: string,
    history: ChatMessage[],
    settings: InferenceSettings,
    onToken: (token: string) => void,
    onComplete: (fullText: string, stats: GenerationStats) => void
  ): Promise<void> {
    if (!this.activeModel) {
      throw new Error('No model loaded. Please select and load a model first.');
    }

    const provider = this.activeModel.provider || (this.activeModel.source === 'online' ? 'ollama' : this.activeModel.source === 'cloud' ? 'gemini' : 'device');

    if (provider === 'gemini') {
      this.isGenerating = true;
      const startTime = Date.now();
      let accumulated = '';
      let tokenCount = 0;
      try {
        accumulated = await streamGeminiReply({
          apiModel: this.activeModel.apiModel || 'gemini-2.5-flash',
          prompt,
          history,
          onToken: (token) => {
            tokenCount += 1;
            onToken(token);
          },
        });
        const elapsedMs = Math.max(Date.now() - startTime, 1);
        this.isGenerating = false;
        onComplete(accumulated, {
          tokensEvaluated: Math.round(prompt.length / 4),
          tokensGenerated: tokenCount || accumulated.split(/\s+/).length,
          evalDurationMs: 40,
          generateDurationMs: elapsedMs,
          tokensPerSecond: Number((((tokenCount || 1) / elapsedMs) * 1000).toFixed(1)),
        });
      } catch (err) {
        this.isGenerating = false;
        throw err;
      }
      return;
    }

    if (CLOUD_PROVIDER_IDS.includes(provider as CloudProviderId)) {
      this.isGenerating = true;
      const startTime = Date.now();
      let accumulated = '';
      let tokenCount = 0;
      try {
        accumulated = await streamCloudReply({
          provider: provider as CloudProviderId,
          apiModel: this.activeModel.apiModel || this.activeModel.filename,
          prompt,
          history,
          systemPrompt: settings.systemPrompt,
          onToken: (token) => {
            tokenCount += 1;
            onToken(token);
          },
        });
        const elapsedMs = Math.max(Date.now() - startTime, 1);
        this.isGenerating = false;
        onComplete(accumulated, {
          tokensEvaluated: Math.round(prompt.length / 4),
          tokensGenerated: tokenCount || accumulated.split(/\s+/).length,
          evalDurationMs: 40,
          generateDurationMs: elapsedMs,
          tokensPerSecond: Number((((tokenCount || 1) / elapsedMs) * 1000).toFixed(1)),
        });
      } catch (err) {
        this.isGenerating = false;
        throw err;
      }
      return;
    }

    if (provider === 'ollama') {
      this.isGenerating = true;
      const startTime = Date.now();
      try {
        const ollamaName = this.activeModel.apiModel || this.activeModel.filename.replace('.gguf', '');
        const messages = history.map((m) => ({ role: m.role, content: m.content }));
        const { DesktopSyncService } = require('../sync/DesktopSync');
        const full = await DesktopSyncService.getInstance().chatOllama(ollamaName, messages);
        const words = full.split(/(\s+)/);
        for (const word of words) {
          if (word) onToken(word);
        }
        const elapsedMs = Math.max(Date.now() - startTime, 1);
        this.isGenerating = false;
        onComplete(full, {
          tokensEvaluated: Math.round(prompt.length / 4),
          tokensGenerated: words.filter(Boolean).length,
          evalDurationMs: 40,
          generateDurationMs: elapsedMs,
          tokensPerSecond: Number(((words.length / elapsedMs) * 1000).toFixed(1)),
        });
      } catch (err) {
        this.isGenerating = false;
        throw err;
      }
      return;
    }

    const formattedPrompt = formatPromptForModel(
      this.activeModel.architecture,
      history,
      settings.systemPrompt
    );

    if (this.useNativeEngine && this.llamaContext) {
      try {
        this.isGenerating = true;
        const startTime = Date.now();
        let tokenCount = 0;
        let accumulated = '';

        await this.llamaContext.completion(
          {
            prompt: formattedPrompt,
            n_predict: 1024,
            temperature: settings.temperature,
            top_p: settings.topP,
            stop: ['<|eot_id|>', '<end_of_turn>', '<|im_end|>', 'User:', 'Assistant:'],
          },
          (data: { token: string }) => {
            if (data?.token) {
              tokenCount++;
              accumulated += data.token;
              onToken(data.token);
            }
          }
        );

        const elapsedMs = Math.max(Date.now() - startTime, 1);
        const tokensPerSec = Number(((tokenCount / elapsedMs) * 1000).toFixed(1));

        this.isGenerating = false;
        onComplete(accumulated, {
          tokensEvaluated: Math.round(formattedPrompt.length / 4),
          tokensGenerated: tokenCount,
          evalDurationMs: 50,
          generateDurationMs: elapsedMs,
          tokensPerSecond: tokensPerSec,
        });
        return;
      } catch (err) {
        console.warn('Native inference error, falling back:', err);
      }
    }

    // Fallback path
    return this.mockEngine.generateStream(prompt, history, settings, onToken, onComplete);
  }
}
