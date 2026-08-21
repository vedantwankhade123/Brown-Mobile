import { ChatMessage } from '../../types/chat';
import { ModelMetadata } from '../../types/model';
import { SecureStore } from '../storage/SecureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GEMINI_KEY = 'gemini_api_key';
const GEMINI_MODELS_CACHE = '@ultron_gemini_live_models';

export async function getGeminiApiKey(): Promise<string> {
  const local = await SecureStore.getItem(GEMINI_KEY);
  return local || '';
}

export async function saveGeminiApiKey(key: string): Promise<void> {
  await SecureStore.setItem(GEMINI_KEY, key.trim());
}

function toGeminiContents(history: ChatMessage[], prompt: string) {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const msg of history) {
    if (!msg.content) continue;
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  if (!contents.length || contents[contents.length - 1].parts[0].text !== prompt) {
    contents.push({ role: 'user', parts: [{ text: prompt }] });
  }
  return contents;
}

export async function streamGeminiReply(options: {
  apiModel: string;
  prompt: string;
  history: ChatMessage[];
  onToken: (token: string) => void;
}): Promise<string> {
  const key = await getGeminiApiKey();
  if (!key) {
    throw new Error('Add a Gemini API key in Settings, or pair with Desktop to inherit one.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.apiModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: toGeminiContents(options.history, options.prompt),
      generationConfig: { temperature: 0.7, topP: 0.9 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${options.apiModel}:generateContent?key=${encodeURIComponent(key)}`;
    const fallback = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGeminiContents(options.history, options.prompt),
        generationConfig: { temperature: 0.7, topP: 0.9 },
      }),
    });
    if (!fallback.ok) {
      const fallbackText = await fallback.text();
      throw new Error((fallbackText || errText).slice(0, 180) || `Gemini request failed (${res.status})`);
    }
    const assembled = extractGeminiText(await fallback.text());
    if (assembled) {
      for (const word of assembled.split(/(\s+)/)) {
        if (word) options.onToken(word);
      }
    }
    return assembled;
  }

  const reader = (res.body as any)?.getReader?.();
  if (!reader) {
    const raw = await res.text();
    const assembled = extractGeminiText(raw);
    if (assembled) {
      for (const word of assembled.split(/(\s+)/)) {
        if (word) options.onToken(word);
      }
    }
    return assembled;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = line.replace(/^data:\s*/, '').trim();
      if (!json || json === '[DONE]') continue;
      try {
        const piece = extractGeminiText(json);
        if (piece) {
          full += piece;
          options.onToken(piece);
        }
      } catch {}
    }
  }
  return full;
}

function extractGeminiText(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const parts = parsed?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p: any) => p.text || '').join('');
    }
  } catch {}
  const matches = [...raw.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g)];
  return matches.map((m) => m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')).join('');
}

export interface DiscoveredGeminiModel {
  name: string;
  tag: string;
  desc: string;
}

const GEMINI_FALLBACK: DiscoveredGeminiModel[] = [
  { name: 'gemini-2.5-flash', tag: '2.5 FLASH', desc: 'Latest fast Gemini chat model' },
  { name: 'gemini-2.5-pro', tag: '2.5 PRO', desc: 'Latest high-quality Gemini chat model' },
  { name: 'gemini-2.0-flash', tag: '2.0 FLASH', desc: 'Fast multimodal model' },
  { name: 'gemini-2.0-flash-lite', tag: '2.0 FLASH LITE', desc: 'Lightweight fast model' },
  { name: 'gemini-1.5-flash-latest', tag: '1.5 FLASH', desc: 'Stable flash model' },
];

function geminiModelTag(name: string): string {
  return String(name || '')
    .replace(/^gemini-/i, '')
    .replace(/-/g, ' ')
    .toUpperCase();
}

function isGeminiChatModel(name: string): boolean {
  const n = String(name || '').toLowerCase().replace(/^models\//, '');
  if (!n.startsWith('gemini-')) return false;
  if (/(embedding|aqa|imagen|image-generation|tts|robotics|computer-use|live|native-audio|deep-research)/i.test(n)) {
    return false;
  }
  if (/-image\b|-image-|-image$/i.test(n)) return false;
  if (/preview-image|flash-image|generate-image/i.test(n)) return false;
  return true;
}

function geminiModelSortScore(name: string): number {
  const n = String(name || '').toLowerCase();
  if (n.includes('gemini-2.5-flash') && !n.includes('preview') && !n.includes('lite')) return 0;
  if (n.includes('gemini-2.5-pro') && !n.includes('preview')) return 1;
  if (n.includes('gemini-2.5') && !n.includes('preview')) return 2;
  if (n === 'gemini-2.0-flash') return 3;
  if (n === 'gemini-2.0-flash-lite') return 4;
  if (n.includes('gemini-2.0-flash')) return 5;
  if (n.includes('1.5-flash')) return 6;
  if (n.includes('1.5-pro')) return 7;
  if (n.includes('preview') || n.includes('exp')) return 20;
  return 10;
}

function isListModelsBlocked(message: string): boolean {
  return /listmodels|modelservice\.listmodels|method.*blocked|not available in your country|has not been used in project|permission denied/i.test(String(message || ''));
}

export function geminiToMetadata(model: DiscoveredGeminiModel): ModelMetadata {
  const name = model.name.replace(/^models\//, '');
  return {
    id: `gemini-live-${name}`,
    name: name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    architecture: 'gemma2',
    parameters: model.tag,
    quantization: 'Q4_K_M',
    sizeBytes: 0,
    sizeFormatted: 'Cloud',
    recommendedRamMb: 0,
    ramTier: '1GB Budget',
    description: model.desc || `${name} via Gemini API`,
    downloadUrl: 'https://generativelanguage.googleapis.com',
    filename: name,
    contextLength: 1048576,
    tags: ['Cloud', 'Gemini', model.tag],
    source: 'cloud',
    provider: 'gemini',
    apiModel: name,
    capabilities: { documents: true, images: true, voice: true, chat: true },
  };
}

export async function getCachedGeminiModels(): Promise<ModelMetadata[]> {
  try {
    const raw = await AsyncStorage.getItem(GEMINI_MODELS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiscoveredGeminiModel[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m?.name && isGeminiChatModel(m.name) && !/gemini-3\.5/i.test(m.name))
      .map(geminiToMetadata);
  } catch {
    return [];
  }
}

async function cacheGeminiModels(models: DiscoveredGeminiModel[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GEMINI_MODELS_CACHE, JSON.stringify(models));
  } catch {}
}

async function pingGeminiModel(apiKey: string, modelName: string): Promise<void> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly: ok' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google API returned HTTP ${response.status}`);
  }
}

export async function discoverGeminiModels(apiKey: string): Promise<ModelMetadata[]> {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('API key is empty.');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = payload.error?.message || `Google API returned HTTP ${response.status}`;
      if (isListModelsBlocked(apiMessage)) {
        throw new Error('LIST_MODELS_BLOCKED');
      }
      throw new Error(apiMessage);
    }
    const discovered: DiscoveredGeminiModel[] = (payload.models || [])
      .map((model: any) => {
        const name = String(model.name || '').replace(/^models\//, '');
        const methods = model.supportedGenerationMethods || [];
        return { model, name, methods };
      })
      .filter(({ name, methods }: any) => isGeminiChatModel(name) && methods.includes('generateContent'))
      .map(({ model, name }: any) => ({
        name,
        tag: geminiModelTag(name),
        desc: model.description || model.displayName || name,
      }))
      .sort((a: DiscoveredGeminiModel, b: DiscoveredGeminiModel) => {
        const diff = geminiModelSortScore(a.name) - geminiModelSortScore(b.name);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
    if (discovered.length) {
      await cacheGeminiModels(discovered);
      return discovered.map(geminiToMetadata);
    }
  } catch (err: any) {
    const message = String(err?.message || '');
    if (!isListModelsBlocked(message) && message !== 'LIST_MODELS_BLOCKED') {
      if (/invalid|api key|unauthorized|401|403|permission/i.test(message) && !isListModelsBlocked(message)) {
        throw err;
      }
    }
  }

  const candidates = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
  ];
  for (const model of candidates) {
    try {
      await pingGeminiModel(key, model);
      await cacheGeminiModels(GEMINI_FALLBACK);
      return GEMINI_FALLBACK.map(geminiToMetadata);
    } catch (err: any) {
      const message = String(err?.message || '');
      if (/invalid|api key|unauthorized|401/i.test(message)) {
        throw new Error(message);
      }
    }
  }
  throw new Error('This API key could not access any Gemini chat models.');
}
