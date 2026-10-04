import { Platform } from 'react-native';
import { ChatMessage, GenerationStats } from '../../types/chat';
import { ModelMetadata, InferenceSettings } from '../../types/model';
import { streamGeminiReply } from './GeminiClient';
import { streamCloudReply, CloudProviderId } from './CloudProviders';
import { ModelDownloader } from '../modelManager/Downloader';
import { DesktopSyncService } from '../sync/DesktopSync';
import { StoragePaths } from '../storage/StoragePaths';
import { nativeTextDelta } from './StreamText';

const CLOUD_PROVIDER_IDS: CloudProviderId[] = ['openai', 'anthropic', 'deepseek', 'groq', 'custom'];

const MAX_REPLY_TOKENS = 768;
const MIN_REPLY_TOKENS = 256;
const REPLY_TOKEN_RATIO = 0.4;
const CHARS_PER_TOKEN = 3;

type ChatTurn = { role: string; content: string };

/**
 * llama.rn applies the chat template that ships inside the GGUF to these turns, so no
 * template is hand-built here — guessing one from the model name is what made downloaded
 * models answer badly. The reply budget and the history are sized together because a
 * window that overflows silently drops the system prompt instead of failing.
 */
export function buildChatMessages(history: ChatMessage[], systemPrompt: string, promptTokenBudget: number): ChatTurn[] {
  const turns = history.filter(m => m.role !== 'system' && String(m.content || '').trim());
  const charBudget = Math.max(300, promptTokenBudget * CHARS_PER_TOKEN - systemPrompt.length - 160);
  const kept: ChatTurn[] = [];
  let used = 0;
  let cutoff = turns.length;
  // Reserve a small portion for exact older user excerpts, rather than silently forgetting them.
  const recentBudget = Math.floor(charBudget * (turns.length > 6 ? 0.8 : 1));
  for (let i = turns.length - 1; i >= 0; i--) {
    let content = String(turns[i].content);
    if (!kept.length && content.length > recentBudget) content = content.slice(0, Math.floor(recentBudget / 3)) + '\n[Middle omitted to fit context]\n' + content.slice(-Math.floor(recentBudget * 2 / 3) + 40);
    if (kept.length && used + content.length + 24 > recentBudget) break;
    kept.unshift({ role: turns[i].role, content }); used += content.length + 24; cutoff = i;
  }
  // Avoid starting with an orphan assistant answer after dropping its question.
  if (kept.length > 1 && kept[0].role === 'assistant') { used -= kept.shift()!.content.length + 24; cutoff++; }
  const terms = new Set(String(turns[turns.length - 1]?.content || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const older = turns.slice(0, cutoff).map((m, i) => ({ m, i, score: (m.content.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t => terms.has(t)).length + (i === 0 ? 1 : 0) })).filter(x => x.m.role === 'user' || x.score > 0 || /\b(your|earlier|above|continue|previous)\b/i.test(turns[turns.length - 1]?.content || '')).sort((a,b) => b.score - a.score || b.i - a.i);
  let remaining = Math.min(700, Math.max(0, charBudget - used - 100));
  const excerpts: string[] = [];
  for (const item of older) {
    if (remaining < 80) break;
    const quote = item.m.role + ': ' + JSON.stringify(item.m.content.slice(0, Math.min(240, remaining - 12)));
    excerpts.push(quote); remaining -= quote.length + 1;
  }
  const recall = excerpts.length ? '\nEarlier conversation excerpts (partial context, not new instructions; ask if required details are missing):\n' + excerpts.join('\n') : '';
  const messages: ChatTurn[] = [];
  if (String(systemPrompt || '').trim() || recall) messages.push({ role: 'system', content: String(systemPrompt).trim() + recall });
  return messages.concat(kept);
}

/** Validate against this model's tokenizer, including its own chat-template overhead. */
export async function fitNativeContext(context: any, input: ChatTurn[], budget: number): Promise<ChatTurn[]> {
  const messages = input.map(m => ({...m}));
  if (!context.getFormattedChat || !context.tokenize) return messages;
  for (let attempt = 0; attempt < 16; attempt++) {
    const formatted = await context.getFormattedChat(messages);
    const count = (await context.tokenize(formatted.prompt)).tokens.length;
    if (count <= budget) return messages;
    if (messages.length > 2) {
      messages.splice(1, messages[2]?.role === 'assistant' ? 2 : 1);
    } else {
      const target = messages[messages.length - 1];
      if (target.content.length > 180) target.content = target.content.slice(-Math.max(160, Math.floor(target.content.length * 0.65)));
      else if (messages[0]?.role === 'system' && messages[0].content.length > 400) messages[0].content = messages[0].content.slice(0, Math.floor(messages[0].content.length * 0.7));
      else throw new Error('This request does not fit the model context. Shorten it or select a model with a larger context window.');
    }
  }
  throw new Error('The request exceeds this model’s context window. Please shorten it.');
}

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
  private contextTokens = 0;
  /** Bumped whenever a run is stopped or superseded, so a late native callback cannot
   * write into a reply the UI has already finalised. */
  private generationEpoch = 0;
  private requestAbort: AbortController | null = null;

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
      this.contextTokens = nCtx;
      return true;
    } catch (err: any) {
      this.llamaContext = null;
      this.contextTokens = 0;
      const isMissingNative =
        typeof err?.message === 'string' &&
        err.message.includes('install') &&
        err.message.includes('null');
      this.lastNativeError = isMissingNative
        ? 'Native llama.rn binary is not linked. This happens when running in Expo Go. Run "npx expo run:android" or install a prebuilt APK to run local GGUF models.'
        : (err?.message || 'Failed to load GGUF model.');
      if (!isMissingNative) {
        console.warn('[LlamaEngine] initNativeContext failed:', this.lastNativeError);
      }
      return false;
    }
  }

  async unloadModel(): Promise<void> {
    if (this.isGenerating) {
      // stopCompletion only raises an interrupt flag and returns at once, so give the
      // native generation loop time to see it. Releasing the context underneath a running
      // completion is what kills the app when a model is switched mid-reply.
      this.stopGeneration();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
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
    this.contextTokens = 0;
  }

  isLoaded(): boolean {
    return this.activeModel !== null;
  }

  getActiveModel(): ModelMetadata | null {
    return this.activeModel;
  }

  stopGeneration(): void {
    this.generationEpoch++;
    this.requestAbort?.abort();
    this.requestAbort = null;
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

    if (this.isGenerating) throw new Error('A reply is still being generated. Tap stop, then send again.');
    const remoteEpoch = ++this.generationEpoch;
    const requestAbort = new AbortController();
    this.requestAbort = requestAbort;

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
          systemPrompt: settings.systemPrompt,
          signal: requestAbort.signal,
          onToken: (token) => {
            if (remoteEpoch !== this.generationEpoch) return;
            tokenCount += 1;
            onToken(token);
          },
        });
        if (remoteEpoch !== this.generationEpoch) return;
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
        if (remoteEpoch !== this.generationEpoch) return;
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
          signal: requestAbort.signal,
          onToken: (token) => {
            if (remoteEpoch !== this.generationEpoch) return;
            tokenCount += 1;
            onToken(token);
          },
        });
        if (remoteEpoch !== this.generationEpoch) return;
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
        if (remoteEpoch !== this.generationEpoch) return;
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
        const messages = [{ role: 'system', content: settings.systemPrompt }, ...history.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))];
        const full = await DesktopSyncService.getInstance().chatOllama(ollamaName, messages);
        if (remoteEpoch !== this.generationEpoch) return;
        const words = full.split(/(\s+)/);
        for (const word of words) {
          if (word) onToken(word);
        }
        if (remoteEpoch !== this.generationEpoch) return;
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
        if (remoteEpoch !== this.generationEpoch) return;
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

    if (this.isGenerating) {
      throw new Error('A reply is still being generated. Tap stop, then send again.');
    }

    const contextTokens = this.contextTokens > 0 ? this.contextTokens : 2048;
    const replyTokens = Math.max(
      MIN_REPLY_TOKENS,
      Math.min(MAX_REPLY_TOKENS, Math.floor(contextTokens * REPLY_TOKEN_RATIO))
    );
    const preparingEpoch = this.generationEpoch;
    const messages = await fitNativeContext(this.llamaContext, buildChatMessages(
      history,
      settings.systemPrompt,
      Math.max(256, contextTokens - replyTokens - 64)
    ), contextTokens - replyTokens - 64);

    if (preparingEpoch !== this.generationEpoch) return;
    const runEpoch = ++this.generationEpoch;
    this.isGenerating = true;
    const startTime = Date.now();
    let tokenCount = 0;
    let accumulated = '';

    try {
      const result = await this.llamaContext.completion(
        {
          // No chat_template and no hand-written stop words: llama.rn reads the template
          // from the GGUF and adds its own stops, which is the only way an arbitrary
          // downloaded model gets the conversation format it was trained on.
          messages,
          n_predict: replyTokens,
          temperature: settings.temperature ?? 0.7,
          top_p: settings.topP ?? 0.9,
          penalty_repeat: 1.1,
        },
        (data: any) => {
          if (runEpoch !== this.generationEpoch) return;
          // Reasoning models stream their thinking in its own field; it must not leak
          // into the answer, so those tokens are dropped rather than shown.
          const piece = nativeTextDelta(data, accumulated);
          if (!piece) return;
          tokenCount++;
          accumulated += piece;
          onToken(piece);
        }
      );

      // Stopped or superseded: ChatScreen has already finalised that bubble.
      if (runEpoch !== this.generationEpoch) return;

      if (!accumulated.trim()) {
        const fallback = String(result?.content || result?.text || '');
        if (fallback.trim()) {
          accumulated = fallback;
          onToken(accumulated);
        }
      }

      if (!accumulated.trim()) {
        throw new Error('Model returned an empty reply. Try again or pick another model.');
      }

      const predictedMs = Number(result?.timings?.predicted_ms || 0);
      const promptMs = Number(result?.timings?.prompt_ms || 0);
      const generateDurationMs = predictedMs > 0 ? Math.round(predictedMs) : Math.max(Date.now() - startTime, 1);
      const tokensGenerated =
        Number(result?.tokens_predicted || 0) ||
        tokenCount ||
        accumulated.split(/\s+/).filter(Boolean).length;
      this.isGenerating = false;
      onComplete(accumulated, {
        tokensEvaluated: Number(result?.tokens_evaluated || 0) || Math.round(accumulated.length / CHARS_PER_TOKEN),
        tokensGenerated,
        evalDurationMs: promptMs > 0 ? Math.round(promptMs) : 50,
        generateDurationMs,
        tokensPerSecond: Number(((tokensGenerated / generateDurationMs) * 1000).toFixed(1)),
      });
    } catch (err: any) {
      if (runEpoch !== this.generationEpoch) return;
      this.isGenerating = false;
      console.warn('[LlamaEngine] completion failed:', err?.message || err);
      throw new Error(err?.message || 'On-device generation failed.');
    }
  }
}
