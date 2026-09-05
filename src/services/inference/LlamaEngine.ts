import { Platform } from 'react-native';
import { ChatMessage, GenerationStats } from '../../types/chat';
import { ModelMetadata, InferenceSettings } from '../../types/model';
import { formatPromptForModel } from './PromptTemplates';
import { MockLlamaEngine } from './MockLlamaEngine';
import { streamGeminiReply } from './GeminiClient';
import { streamCloudReply, CloudProviderId } from './CloudProviders';
import { ModelDownloader } from '../modelManager/Downloader';
import { DesktopSyncService } from '../sync/DesktopSync';

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

    const provider = model.provider || (model.source === 'online' ? 'ollama' : model.source === 'cloud' ? 'gemini' : 'device');

    if (provider === 'device' && Platform.OS !== 'web') {
      const loaded = await this.initNativeContext(model, settings);
      this.useNativeEngine = loaded;
      return loaded;
    }

    this.useNativeEngine = false;
    return this.mockEngine.loadModel(model, settings);
  }

  private async initNativeContext(model: ModelMetadata, settings?: Partial<InferenceSettings>): Promise<boolean> {
    try {
      const state = ModelDownloader.getInstance().getState(model.id);
      const localPath = state.localPath;
      if (!localPath) return false;

      const FileSystem = require('expo-file-system');
      if (FileSystem?.getInfoAsync) {
        let info = await FileSystem.getInfoAsync(localPath);
        if (!info?.exists && !localPath.startsWith('file:')) {
          info = await FileSystem.getInfoAsync('file://' + localPath);
        }
        if (!info?.exists) return false;
      }

      let llamaModule: any = null;
      try {
        const { NativeModules } = require('react-native');
        if (NativeModules && (NativeModules.RNLlama || NativeModules.LlamaContext)) {
          const modName = ['llama', 'rn'].join('.');
          const reqFn = typeof (globalThis as any)?.__webpack_require__ !== 'undefined' ? null : (globalThis as any)?.require;
          if (typeof reqFn === 'function') {
            llamaModule = reqFn(modName);
          }
        }
      } catch {
        llamaModule = null;
      }
      const initLlama = typeof llamaModule?.initLlama === 'function'
        ? llamaModule.initLlama
        : (typeof llamaModule?.default?.initLlama === 'function' ? llamaModule.default.initLlama : null);

      if (!initLlama) {
        // Native llama.rn binary is not compiled into this build; will use direct runtime bridge
        return false;
      }

      const nCtx = Math.min(settings?.contextSize || model.contextLength || 2048, 4096);
      this.llamaContext = await initLlama({
        model: localPath,
        n_ctx: nCtx,
        n_threads: settings?.threads || 4,
        n_gpu_layers: Platform.OS === 'ios' && settings?.useHardwareAcceleration ? 99 : 0,
        use_mmap: true,
      });
      return !!this.llamaContext;
    } catch (err: any) {
      this.llamaContext = null;
      return false;
    }
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
        console.warn('Native inference error, falling back to local runtime bridge:', err);
      }
    }

    // Try direct Ollama or Desktop Sync bridge for installed/local models before mock fallback
    const targetModelName = this.activeModel.ollamaName || this.activeModel.apiModel || this.activeModel.filename.replace(/\.gguf$/i, '') || this.activeModel.id;
    try {
      const directResult = await this.tryDirectOllamaInference(targetModelName, history, settings, onToken);
      if (directResult) {
        const words = directResult.split(/(\s+)/).filter(Boolean);
        onComplete(directResult, {
          tokensEvaluated: Math.round(formattedPrompt.length / 4),
          tokensGenerated: words.length,
          evalDurationMs: 35,
          generateDurationMs: 450,
          tokensPerSecond: 28,
        });
        return;
      }
    } catch (_) {}

    // No silent mock answers in production — surface a clear actionable error
    throw new Error(
      'On-device GGUF inference is unavailable in this build. Open Models and use a Cloud model (Gemini / OpenAI / etc.), or pair with Desktop Sync.'
    );
  }

  private async tryDirectOllamaInference(
    modelName: string,
    history: ChatMessage[],
    settings: InferenceSettings,
    onToken: (token: string) => void
  ): Promise<string | null> {
    const candidateHosts = [
      'http://10.0.2.2:11434', // Android Emulator host loopback
      'http://127.0.0.1:11434',
      'http://localhost:11434',
    ];

    try {
      const pairedUrl = DesktopSyncService.getInstance().getPairedBaseUrl();
      if (pairedUrl) {
        candidateHosts.unshift(pairedUrl.replace(/\/$/, ''));
      }
    } catch {}

    const messages = history.map((m) => ({ role: m.role, content: m.content }));

    for (const host of candidateHosts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const checkRes = await fetch(`${host}/api/tags`, {
          signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timeoutId);

        if (!checkRes || !checkRes.ok) continue;

        const tagData = await checkRes.json().catch(() => ({}));
        const models: Array<{ name: string }> = Array.isArray(tagData?.models) ? tagData.models : [];
        const matched = models.find(m =>
          m.name === modelName ||
          m.name.startsWith(modelName + ':') ||
          modelName.startsWith(m.name.split(':')[0])
        ) || models[0];

        const target = matched ? matched.name : modelName;

        const chatRes = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: target,
            messages,
            stream: false,
            options: {
              temperature: settings.temperature || 0.7,
              top_p: settings.topP || 0.9,
            }
          }),
        });

        if (!chatRes.ok) continue;
        const resData = await chatRes.json().catch(() => ({}));
        const replyText = resData?.message?.content || resData?.response || '';
        if (replyText) {
          const words = replyText.split(/(\s+)/);
          for (const w of words) {
            if (w) onToken(w);
          }
          return replyText;
        }
      } catch {}
    }
    return null;
  }
}
