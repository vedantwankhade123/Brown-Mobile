import { Platform } from 'react-native';
import { ChatMessage, GenerationStats } from '../../types/chat';
import { ModelMetadata, InferenceSettings } from '../../types/model';
import { formatPromptForModel } from './PromptTemplates';
import { streamGeminiReply } from './GeminiClient';
import { streamCloudReply, CloudProviderId } from './CloudProviders';
import { ModelDownloader } from '../modelManager/Downloader';
import { DesktopSyncService } from '../sync/DesktopSync';
import { StoragePaths } from '../storage/StoragePaths';

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

function normalizeModelPath(uri: string): string {
  let path = String(uri || '');
  if (path.startsWith('file://')) path = path.replace(/^file:\/\//, '');
  else if (path.startsWith('file:/')) path = path.replace(/^file:\/+/, '/');
  // Android content/document paths stay as-is if llama.rn accepts them; prefer absolute fs
  return path;
}

async function resolveLocalGgufPath(model: ModelMetadata): Promise<string | null> {
  const FileSystem = require('expo-file-system');
  const state = ModelDownloader.getInstance().getState(model.id);
  const candidates: string[] = [];

  if (state.localPath) {
    candidates.push(state.localPath);
    if (!state.localPath.startsWith('file:')) candidates.push('file://' + state.localPath);
  }

  try {
    const dir = await StoragePaths.getModelsDir();
    if (model.filename) {
      candidates.push(dir + model.filename);
      candidates.push('file://' + (dir + model.filename).replace(/^file:\/\//, ''));
    }
  } catch {}

  for (const candidate of candidates) {
    try {
      if (!FileSystem?.getInfoAsync) continue;
      const info = await FileSystem.getInfoAsync(candidate);
      const size = Number(info?.size || 0);
      if (info?.exists && size > 1024 * 1024) {
        return normalizeModelPath(candidate);
      }
    } catch {}
  }
  return null;
}

export class LlamaEngine implements ILlamaService {
  private static instance: LlamaEngine;
  private activeModel: ModelMetadata | null = null;
  private isGenerating = false;
  private llamaContext: any = null;
  private useNativeEngine = false;
  private lastNativeError: string | null = null;

  public static getInstance(): LlamaEngine {
    if (!LlamaEngine.instance) {
      LlamaEngine.instance = new LlamaEngine();
    }
    return LlamaEngine.instance;
  }

  getLastNativeError(): string | null {
    return this.lastNativeError;
  }

  async loadModel(model: ModelMetadata, settings?: Partial<InferenceSettings>): Promise<boolean> {
    if (this.isGenerating) {
      this.stopGeneration();
    }

    if (this.llamaContext) {
      await this.unloadModel();
    }

    this.activeModel = model;
    this.lastNativeError = null;

    const provider =
      model.provider ||
      (model.source === 'online' ? 'ollama' : model.source === 'cloud' ? 'gemini' : 'device');

    if (provider === 'device' && Platform.OS !== 'web') {
      const loaded = await this.initNativeContext(model, settings);
      this.useNativeEngine = loaded;
      return loaded;
    }

    // Cloud / Ollama / Gemini — no native GGUF context needed
    this.useNativeEngine = false;
    return true;
  }

  private async initNativeContext(
    model: ModelMetadata,
    settings?: Partial<InferenceSettings>
  ): Promise<boolean> {
    try {
      const localPath = await resolveLocalGgufPath(model);
      if (!localPath) {
        this.lastNativeError =
          'Downloaded model file not found on device. Re-download it from Models, then try again.';
        return false;
      }

      let initLlama: ((opts: any, onProgress?: (p: number) => void) => Promise<any>) | null = null;
      try {
        // Prefer static package import (Metro resolves llama.rn native module)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const llamaRn = require('llama.rn');
        initLlama =
          typeof llamaRn?.initLlama === 'function'
            ? llamaRn.initLlama
            : typeof llamaRn?.default?.initLlama === 'function'
              ? llamaRn.default.initLlama
              : null;
      } catch (err: any) {
        this.lastNativeError =
          err?.message ||
          'llama.rn native module is missing. Rebuild the Android app (npx expo run:android / assembleRelease).';
        return false;
      }

      if (!initLlama) {
        this.lastNativeError =
          'llama.rn is installed but initLlama is unavailable. Rebuild the native app to link the module.';
        return false;
      }

      // Safe runtime check: ensure native RNLlama bindings exist before calling initLlama
      // Prevents Hermes from throwing uncaught TypeError: Cannot read property 'install' of null
      const reactNative = require('react-native');
      const turboRegistry = reactNative.TurboModuleRegistry;
      const nativeModules = reactNative.NativeModules;
      const hasTurbo = typeof turboRegistry?.get === 'function' && Boolean(turboRegistry.get('RNLlama'));
      const hasLegacy = Boolean(nativeModules?.RNLlama);
      const hasJsi = typeof (global as any).llamaInitContext === 'function';

      if (!hasTurbo && !hasLegacy && !hasJsi) {
        this.lastNativeError =
          'Native llama.rn binary is not linked. This happens when running in Expo Go. Run "npx expo run:android" or install a prebuilt APK to run local GGUF models.';
        console.warn('[LlamaEngine] initNativeContext:', this.lastNativeError);
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
      if (!this.llamaContext) {
        this.lastNativeError = 'Failed to create llama context for this GGUF.';
        return false;
      }
      return true;
    } catch (err: any) {
      this.llamaContext = null;
      const isMissingNative =
        typeof err?.message === 'string' &&
        err.message.includes('install') &&
        err.message.includes('null');
      this.lastNativeError = isMissingNative
        ? 'Native llama.rn binary is not linked. This happens when running in Expo Go. Run "npx expo run:android" or install a prebuilt APK to run local GGUF models.'
        : (err?.message || 'Failed to load GGUF model.');
      console.warn('[LlamaEngine] initNativeContext failed:', this.lastNativeError);
      return false;
    }
  }

  async unloadModel(): Promise<void> {
    if (this.llamaContext) {
      try {
        await this.llamaContext.release?.();
      } catch (err) {
        console.warn('Error releasing llama context:', err);
      }
      this.llamaContext = null;
    }
    this.activeModel = null;
    this.useNativeEngine = false;
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
        this.llamaContext.stopCompletion?.();
      } catch (err) {
        console.warn('Error stopping llama completion:', err);
      }
    }
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

    const provider =
      this.activeModel.provider ||
      (this.activeModel.source === 'online'
        ? 'ollama'
        : this.activeModel.source === 'cloud'
          ? 'gemini'
          : 'device');

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
        const ollamaName =
          this.activeModel.apiModel || this.activeModel.filename.replace('.gguf', '');
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

    // Device GGUF path
    if (!this.useNativeEngine || !this.llamaContext) {
      // Attempt (re)load if model file exists — covers cold start after download
      const reloaded = await this.initNativeContext(this.activeModel, settings);
      this.useNativeEngine = reloaded;
      if (!reloaded || !this.llamaContext) {
        throw new Error(
          this.lastNativeError ||
            'On-device GGUF could not be loaded. Rebuild the app with llama.rn linked (npx expo run:android), or use a Cloud model.'
        );
      }
    }

    const formattedPrompt = formatPromptForModel(
      this.activeModel.architecture,
      history,
      settings.systemPrompt
    );

    this.isGenerating = true;
    const startTime = Date.now();
    let tokenCount = 0;
    let accumulated = '';

    try {
      const result = await this.llamaContext.completion(
        {
          prompt: formattedPrompt,
          n_predict: 1024,
          temperature: settings.temperature ?? 0.7,
          top_p: settings.topP ?? 0.9,
          stop: ['<|eot_id|>', '<end_of_turn>', '<|im_end|>', 'User:', 'Assistant:'],
        },
        (data: any) => {
          const token = data?.token ?? '';
          if (token) {
            tokenCount++;
            accumulated += token;
            onToken(token);
          }
        }
      );

      if (!accumulated && result?.text) {
        accumulated = String(result.text);
        onToken(accumulated);
        tokenCount = Math.max(tokenCount, accumulated.split(/\s+/).filter(Boolean).length);
      }

      if (!accumulated.trim()) {
        throw new Error('Model returned an empty reply. Try again or pick another model.');
      }

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
    } catch (err: any) {
      this.isGenerating = false;
      console.warn('[LlamaEngine] completion failed:', err?.message || err);
      throw new Error(err?.message || 'On-device generation failed.');
    }
  }
}
