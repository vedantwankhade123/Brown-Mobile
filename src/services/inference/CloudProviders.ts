/**
 * Ultron Mobile Multi-Provider Cloud Hub
 * Mirrors the desktop multi-provider-hub: OpenAI, Anthropic Claude, DeepSeek,
 * Groq, and Custom OpenAI-compatible endpoints (LM Studio / vLLM / OpenRouter).
 */
import { ChatMessage } from '../../types/chat';
import { ModelMetadata } from '../../types/model';
import { SecureStore } from '../storage/SecureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CloudProviderId = 'openai' | 'anthropic' | 'deepseek' | 'groq' | 'custom';

export interface CloudModelDef {
  id: string;
  name: string;
  description: string;
  speed?: string;
}

export interface CloudProviderDef {
  id: CloudProviderId;
  name: string;
  badge: string;
  color: string;
  keyPlaceholder: string;
  docsUrl: string;
  endpoint: string;
  hasCustomUrl?: boolean;
  defaultUrl?: string;
  models: CloudModelDef[];
}

export const CLOUD_PROVIDERS: Record<CloudProviderId, CloudProviderDef> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    badge: 'Cloud GPT',
    color: '#10a37f',
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    endpoint: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5', name: 'GPT-5', description: 'Flagship reasoning + multimodal chat model', speed: 'Fast' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Affordable, fast intelligent model', speed: 'Very Fast' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal omni model for complex tasks', speed: 'Fast' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Affordable, fast intelligent model', speed: 'Very Fast' },
      { id: 'o3-mini', name: 'o3-mini', description: 'High-speed STEM, math, and coding reasoning', speed: 'Reasoning' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    badge: 'Cloud Claude',
    color: '#d97706',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    endpoint: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Hybrid reasoning and premier coding engine', speed: 'High Precision' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Superior nuance, architecture, and writing', speed: 'Fast' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Instant response speeds and rapid agent tool calls', speed: 'Ultra-Fast' },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek API',
    badge: 'Reasoning R1',
    color: '#3b82f6',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    endpoint: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', description: 'Open reasoning frontier model with full CoT', speed: 'Reasoning' },
      { id: 'deepseek-chat', name: 'DeepSeek-V3', description: 'General purpose 671B MoE architecture', speed: 'Fast' },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    badge: '300+ Tokens/sec',
    color: '#f97316',
    keyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    endpoint: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', description: '300+ tok/sec LPU accelerated inference', speed: '300+ tok/s' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek-R1 Distill 70B', description: 'Ultra-fast distilled reasoning on Groq LPU', speed: '280+ tok/s' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', description: '32k context MoE model with sub-second latency', speed: '400+ tok/s' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Groq)', description: 'Fast Google Gemma on Groq hardware', speed: '350+ tok/s' },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom Models (LM Studio / vLLM / OpenRouter)',
    badge: 'CUSTOM',
    color: '#8b5cf6',
    keyPlaceholder: 'Optional key',
    docsUrl: 'https://openrouter.ai/keys',
    endpoint: 'http://localhost:1234/v1',
    hasCustomUrl: true,
    defaultUrl: 'http://localhost:1234/v1',
    models: [
      { id: 'custom-model', name: 'Custom Model (Local Server / Proxy)', description: 'Connects to any custom local LLM server or proxy' },
    ],
  },
};

export const CLOUD_PROVIDER_IDS: CloudProviderId[] = ['openai', 'anthropic', 'deepseek', 'groq', 'custom'];

const keyStorageId = (providerId: CloudProviderId) => `${providerId}_api_key`;
const MODELS_CACHE_PREFIX = '@ultron_cloud_models_';
const CUSTOM_URL_KEY = 'custom_endpoint_url';

// ---------- Key & endpoint storage ----------

export async function getProviderApiKey(providerId: CloudProviderId): Promise<string> {
  const local = await SecureStore.getItem(keyStorageId(providerId));
  return local || '';
}

export async function saveProviderApiKey(providerId: CloudProviderId, key: string): Promise<void> {
  await SecureStore.setItem(keyStorageId(providerId), key.trim());
}

export async function deleteProviderApiKey(providerId: CloudProviderId): Promise<void> {
  await SecureStore.deleteItem(keyStorageId(providerId));
  try {
    await AsyncStorage.removeItem(MODELS_CACHE_PREFIX + providerId);
  } catch {}
}

export async function getCustomEndpointUrl(): Promise<string> {
  try {
    const stored = await SecureStore.getItem(CUSTOM_URL_KEY);
    if (stored) return stored;
    const url = await AsyncStorage.getItem(CUSTOM_URL_KEY);
    return url || '';
  } catch {
    return '';
  }
}

export async function saveCustomEndpointUrl(url: string): Promise<void> {
  try {
    await SecureStore.setItem(CUSTOM_URL_KEY, url.trim());
    await AsyncStorage.setItem(CUSTOM_URL_KEY, url.trim());
  } catch {}
}

export async function clearCustomEndpointUrl(): Promise<void> {
  try {
    await SecureStore.deleteItem(CUSTOM_URL_KEY);
    await AsyncStorage.removeItem(CUSTOM_URL_KEY);
    await AsyncStorage.removeItem(MODELS_CACHE_PREFIX + 'custom');
  } catch {}
}



// ---------- Provider detection (desktop parity) ----------

export function detectProviderForModel(modelName: string): CloudProviderId | 'gemini' | 'ollama' {
  const m = String(modelName || '').toLowerCase();
  if (m.startsWith('gemini')) return 'gemini';
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
  if (m.startsWith('claude')) return 'anthropic';
  if (m.endsWith('(groq)') || m.startsWith('groq/') || m === 'llama-3.3-70b-versatile' || m.includes('distill-llama') || m === 'mixtral-8x7b-32768' || m === 'gemma2-9b-it') return 'groq';
  if (m.includes('deepseek-reasoner') || m.includes('deepseek-chat') || (m.startsWith('deepseek') && !m.includes(':'))) return 'deepseek';
  if (m.startsWith('custom') || m.startsWith('http://') || m.startsWith('https://')) return 'custom';
  return 'ollama';
}

// ---------- Model metadata mapping ----------

export function cloudModelToMetadata(providerId: CloudProviderId, model: CloudModelDef): ModelMetadata {
  const provider = CLOUD_PROVIDERS[providerId];
  const supportsImages = /gpt-4o|gpt-4\.1|claude-3|claude-4|gemini|vision|llava/i.test(
    `${model.id} ${model.name}`
  );
  return {
    id: `${providerId}-cloud-${model.id}`,
    name: model.name,
    architecture: 'gemma2',
    parameters: model.speed || 'Cloud',
    quantization: 'Q4_K_M',
    sizeBytes: 0,
    sizeFormatted: 'Cloud',
    recommendedRamMb: 0,
    ramTier: '1GB Budget',
    description: model.description || `${model.name} via ${provider.name}`,
    downloadUrl: provider.docsUrl,
    filename: model.id,
    contextLength: 128000,
    tags: ['Cloud', provider.badge],
    source: 'cloud',
    provider: providerId,
    apiModel: model.id,
    capabilities: { documents: true, images: supportsImages, voice: true, chat: true },
  };
}

async function getCachedDiscoveredModels(providerId: CloudProviderId): Promise<CloudModelDef[]> {
  try {
    const raw = await AsyncStorage.getItem(MODELS_CACHE_PREFIX + providerId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m: any) => m && m.id && m.name);
  } catch {
    return [];
  }
}

async function cacheDiscoveredModels(providerId: CloudProviderId, models: CloudModelDef[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MODELS_CACHE_PREFIX + providerId, JSON.stringify(models));
  } catch {}
}

/** Models available for a configured provider (live-discovered first, catalog fallback). */
export async function getProviderModels(providerId: CloudProviderId): Promise<ModelMetadata[]> {
  const cached = await getCachedDiscoveredModels(providerId);
  const defs = cached.length ? cached : CLOUD_PROVIDERS[providerId].models;
  return defs.map((m) => cloudModelToMetadata(providerId, m));
}

/** All cloud models for providers that currently have credentials configured. */
export async function getConfiguredCloudModels(): Promise<ModelMetadata[]> {
  const results: ModelMetadata[] = [];
  for (const providerId of CLOUD_PROVIDER_IDS) {
    try {
      const configured =
        providerId === 'custom'
          ? Boolean(await getCustomEndpointUrl())
          : Boolean(await getProviderApiKey(providerId));
      if (!configured) continue;
      results.push(...(await getProviderModels(providerId)));
    } catch {}
  }
  return results;
}

// ---------- Connection testing & live model discovery ----------

function openAiCompatibleModelsUrl(providerId: CloudProviderId, customUrl?: string): string {
  if (providerId === 'custom') {
    const base = String(customUrl || CLOUD_PROVIDERS.custom.defaultUrl || '').replace(/\/+$/, '');
    return `${base}/models`;
  }
  return `${CLOUD_PROVIDERS[providerId].endpoint}/models`;
}

export async function testProviderConnection(
  providerId: CloudProviderId,
  key: string,
  customUrl?: string
): Promise<CloudModelDef[]> {
  const trimmedKey = String(key || '').trim();

  if (providerId === 'anthropic') {
    if (!trimmedKey) throw new Error('Anthropic API key is required');
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': trimmedKey, 'anthropic-version': '2023-06-01' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error?.message || `Anthropic returned HTTP ${res.status}`);
    }
    const discovered: CloudModelDef[] = (Array.isArray(data.data) ? data.data : [])
      .map((m: any) => ({ id: String(m.id || ''), name: String(m.display_name || m.id || ''), description: 'Claude model', speed: 'Fast' }))
      .filter((m: CloudModelDef) => m.id);
    if (discovered.length) {
      await cacheDiscoveredModels('anthropic', discovered);
      return discovered;
    }
    return CLOUD_PROVIDERS.anthropic.models;
  }

  // OpenAI-compatible providers (openai / deepseek / groq / custom)
  if (providerId === 'custom' && !(customUrl || '').trim()) {
    throw new Error('Set the server URL first (e.g. http://localhost:1234/v1).');
  }
  const res = await fetch(openAiCompatibleModelsUrl(providerId, customUrl), {
    headers: trimmedKey ? { Authorization: `Bearer ${trimmedKey}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `API returned HTTP ${res.status}`);
  }
  const rawList = Array.isArray(data.data) ? data.data : [];
  const discovered: CloudModelDef[] = rawList
    .map((m: any) => ({ id: String(m.id || ''), name: String(m.id || ''), description: 'Discovered model', speed: 'Fast' }))
    .filter((m: CloudModelDef) => m.id);
  if (discovered.length) {
    await cacheDiscoveredModels(providerId, discovered);
    return discovered;
  }
  return CLOUD_PROVIDERS[providerId].models;
}

// ---------- Streaming chat clients ----------

function toChatMessages(history: ChatMessage[], prompt: string, systemPrompt?: string) {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const msg of history) {
    if (!msg.content) continue;
    messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
  }
  if (!messages.some((m) => m.role === 'user' && m.content === prompt)) {
    messages.push({ role: 'user', content: prompt });
  }
  return messages;
}

async function streamOpenAiCompatible(options: {
  endpoint: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  onToken: (token: string) => void;
}): Promise<string> {
  const res = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API Error HTTP ${res.status}`);
  }

  const reader = (res.body as any)?.getReader?.();
  if (!reader) {
    const data = await res.json();
    const output = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
    if (output) {
      for (const word of String(output).split(/(\s+)/)) if (word) options.onToken(word);
    }
    return String(output).trim();
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            options.onToken(delta);
          }
        } catch {}
      }
    }
  }
  return full.trim();
}

async function streamAnthropic(options: {
  model: string;
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  onToken: (token: string) => void;
}): Promise<string> {
  const chatMessages = options.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 4096,
      messages: chatMessages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Anthropic HTTP ${res.status}`);
  }

  const reader = (res.body as any)?.getReader?.();
  if (!reader) {
    const data = await res.json();
    const output = Array.isArray(data.content)
      ? data.content.map((b: any) => b?.text || '').join('')
      : '';
    if (output) {
      for (const word of String(output).split(/(\s+)/)) if (word) options.onToken(word);
    }
    return String(output).trim();
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          full += parsed.delta.text;
          options.onToken(parsed.delta.text);
        }
      } catch {}
    }
  }
  return full.trim();
}

/** Unified cloud streaming entry point used by the LlamaEngine. */
export async function streamCloudReply(options: {
  provider: CloudProviderId;
  apiModel: string;
  prompt: string;
  history: ChatMessage[];
  systemPrompt?: string;
  onToken: (token: string) => void;
}): Promise<string> {
  const providerId = options.provider;
  const key = await getProviderApiKey(providerId);
  const customUrl = providerId === 'custom' ? await getCustomEndpointUrl() : '';

  if (providerId !== 'custom' && !key) {
    throw new Error(`Add a ${CLOUD_PROVIDERS[providerId].name} API key in Settings → Models.`);
  }
  if (providerId === 'custom' && !customUrl) {
    throw new Error('Set the custom server URL in Settings → Models.');
  }

  const messages = toChatMessages(options.history, options.prompt, options.systemPrompt);

  switch (providerId) {
    case 'anthropic':
      return streamAnthropic({ model: options.apiModel, apiKey: key, messages, onToken: options.onToken });
    case 'openai':
      return streamOpenAiCompatible({
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: options.apiModel,
        apiKey: key,
        messages,
        onToken: options.onToken,
      });
    case 'deepseek':
      return streamOpenAiCompatible({
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: options.apiModel,
        apiKey: key,
        messages,
        onToken: options.onToken,
      });
    case 'groq':
      return streamOpenAiCompatible({
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        model: options.apiModel.replace(/\s*\(Groq\)/i, ''),
        apiKey: key,
        messages,
        onToken: options.onToken,
      });
    case 'custom':
    default: {
      const base = String(customUrl || CLOUD_PROVIDERS.custom.defaultUrl).replace(/\/+$/, '');
      return streamOpenAiCompatible({
        endpoint: `${base}/chat/completions`,
        model: options.apiModel,
        apiKey: key,
        messages,
        onToken: options.onToken,
      });
    }
  }
}
