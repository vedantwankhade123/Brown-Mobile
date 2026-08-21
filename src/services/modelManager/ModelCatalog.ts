import { ModelMetadata, MobileRamTier } from '../../types/model';
import { DeviceRamTier } from './DeviceProfiler';
import { getDiscoveredModels } from './HuggingFaceRegistry';

export const HEAVY_MODEL_PARAM_BILLION = 14;

export const CURATED_MODELS: ModelMetadata[] = [
  {
    id: 'llama-3.2-1b-instruct',
    name: 'Llama 3.2 1B Instruct',
    architecture: 'llama3',
    parameters: '1.23B',
    quantization: 'Q4_K_M',
    sizeBytes: 748000000, // ~748 MB
    sizeFormatted: '748 MB',
    recommendedRamMb: 1200,
    ramTier: '1GB Budget',
    description: 'Ultra-fast, low-memory model optimized for smartphones. Excellent for quick Q&A, brainstorming, and text summarization.',
    downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    contextLength: 4096,
    parameterBillion: 1.23,
    ramRequiredMb: 1200,
    ollamaName: 'llama3.2:1b',
    official: true,
    tags: ['Ultra Fast', 'Low Battery', '1GB+ RAM', 'Chat'],
    source: 'offline',
    provider: 'device',
    capabilities: {
      documents: true,
      images: false,
      voice: true,
    },
  },
  {
    id: 'qwen-2.5-1.5b-instruct',
    name: 'Qwen 2.5 1.5B Instruct',
    architecture: 'qwen25',
    parameters: '1.54B',
    quantization: 'Q4_K_M',
    sizeBytes: 986000000, // ~986 MB
    sizeFormatted: '986 MB',
    recommendedRamMb: 1500,
    ramTier: '2GB Standard',
    description: 'Exceptional reasoning and multilingual performance with strong coding and structured markdown output.',
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    contextLength: 4096,
    parameterBillion: 1.54,
    ramRequiredMb: 1500,
    ollamaName: 'qwen2.5:1.5b',
    official: true,
    tags: ['Multilingual', 'Code Specialist', 'Math', 'Chat'],
    source: 'offline',
    provider: 'device',
    capabilities: {
      documents: true,
      images: false,
      voice: true,
    },
  },
  {
    id: 'gemma-2-2b-instruct',
    name: 'Gemma 2 2B Instruct',
    architecture: 'gemma2',
    parameters: '2.61B',
    quantization: 'Q4_K_M',
    sizeBytes: 1650000000, // ~1.65 GB
    sizeFormatted: '1.65 GB',
    recommendedRamMb: 2200,
    ramTier: '2GB Standard',
    description: 'Built on Google research with sliding window attention for rich factual accuracy and high nuance in writing.',
    downloadUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    filename: 'gemma-2-2b-it-Q4_K_M.gguf',
    contextLength: 4096,
    parameterBillion: 2.61,
    ramRequiredMb: 2200,
    ollamaName: 'gemma2:2b',
    official: true,
    tags: ['Google Research', 'Nuanced', '2GB+ RAM', 'Chat'],
    source: 'offline',
    provider: 'device',
    capabilities: {
      documents: true,
      images: false,
      voice: true,
    },
  },
  {
    id: 'llama-3.2-3b-instruct',
    name: 'Llama 3.2 3B Instruct',
    architecture: 'llama3',
    parameters: '3.21B',
    quantization: 'Q4_K_M',
    sizeBytes: 2020000000, // ~2.02 GB
    sizeFormatted: '2.02 GB',
    recommendedRamMb: 2800,
    ramTier: '3GB Performance',
    description: 'Flagship on-device intelligence model. High quality step-by-step reasoning, complex drafting, and analytical depth.',
    downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    contextLength: 8192,
    parameterBillion: 3.21,
    ramRequiredMb: 2800,
    ollamaName: 'llama3.2:3b',
    official: true,
    tags: ['Flagship Quality', 'Deep Reasoning', '3GB+ RAM', 'Chat'],
    source: 'offline',
    provider: 'device',
    capabilities: {
      documents: true,
      images: false,
      voice: true,
    },
  },
];

export const EXTRA_MOBILE_GGUF: ModelMetadata[] = [
  {
    id: 'qwen-2.5-0.5b-instruct',
    name: 'Qwen 2.5 0.5B Instruct',
    architecture: 'qwen25',
    parameters: '0.5B',
    quantization: 'Q4_K_M',
    sizeBytes: 398000000,
    sizeFormatted: '398 MB',
    recommendedRamMb: 800,
    ramTier: 'Ultra-Light',
    description: 'Tiny multilingual chat model for phones under 4GB RAM. Fast replies with low battery draw.',
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    contextLength: 4096,
    tags: ['Ultra-Light', 'Multilingual', 'Chat'],
    source: 'offline',
    provider: 'device',
    parameterBillion: 0.5,
    ramRequiredMb: 800,
    ollamaName: 'qwen2.5:0.5b',
    official: true,
    capabilities: { documents: true, images: false, voice: true, chat: true, multilingual: true, code: false },
  },
  {
    id: 'smollm2-1.7b-instruct',
    name: 'SmolLM2 1.7B Instruct',
    architecture: 'llama3',
    parameters: '1.7B',
    quantization: 'Q4_K_M',
    sizeBytes: 1050000000,
    sizeFormatted: '1.05 GB',
    recommendedRamMb: 1700,
    ramTier: 'Ultra-Light',
    description: 'HuggingFace SmolLM2 tuned for on-device chat. Compact weights for older smartphones.',
    downloadUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
    filename: 'smollm2-1.7b-instruct-q4_k_m.gguf',
    contextLength: 8192,
    tags: ['Ultra-Light', 'Chat', 'Hugging Face'],
    source: 'offline',
    provider: 'device',
    parameterBillion: 1.7,
    ramRequiredMb: 1700,
    ollamaName: 'smollm2:1.7b',
    official: true,
    capabilities: { documents: true, images: false, voice: true, chat: true, multilingual: false, code: true },
  },
  {
    id: 'phi-3.5-mini-instruct',
    name: 'Phi-3.5 Mini 3.8B',
    architecture: 'llama3',
    parameters: '3.8B',
    quantization: 'Q4_K_M',
    sizeBytes: 2390000000,
    sizeFormatted: '2.39 GB',
    recommendedRamMb: 3600,
    ramTier: 'Standard',
    description: 'Microsoft Phi-3.5 Mini for coding and reasoning on 4–6GB phones. Strong instruction following.',
    downloadUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    contextLength: 8192,
    tags: ['Code', 'Chat', 'Standard'],
    source: 'offline',
    provider: 'device',
    parameterBillion: 3.8,
    ramRequiredMb: 3600,
    ollamaName: 'phi3.5:3.8b',
    official: true,
    capabilities: { documents: true, images: false, voice: true, chat: true, multilingual: true, code: true },
  },
  {
    id: 'deepseek-r1-distill-qwen-7b',
    name: 'DeepSeek-R1-Distill-Qwen-7B',
    architecture: 'qwen25',
    parameters: '7B',
    quantization: 'Q4_K_M',
    sizeBytes: 4680000000,
    sizeFormatted: '4.68 GB',
    recommendedRamMb: 6500,
    ramTier: 'Flagship',
    description: 'Reasoning distill of DeepSeek R1. Q4_K_M GGUF for flagship phones with 8GB+ RAM.',
    downloadUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    filename: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    contextLength: 16384,
    tags: ['Reasoning', 'Code', 'Flagship', 'Hugging Face'],
    source: 'offline',
    provider: 'device',
    parameterBillion: 7,
    ramRequiredMb: 6500,
    ollamaName: 'deepseek-r1:7b',
    official: true,
    capabilities: { documents: true, images: false, voice: true, chat: true, multilingual: true, code: true },
  },
  {
    id: 'mistral-7b-instruct-v0.3',
    name: 'Mistral 7B Instruct 0.3',
    architecture: 'llama3',
    parameters: '7B',
    quantization: 'Q4_K_M',
    sizeBytes: 4370000000,
    sizeFormatted: '4.37 GB',
    recommendedRamMb: 6200,
    ramTier: 'Flagship',
    description: 'Mistral 7B v0.3 instruct for flagship Android devices. Balanced chat and coding quality.',
    downloadUrl: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    filename: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    contextLength: 8192,
    tags: ['Chat', 'Code', 'Multilingual', 'Flagship'],
    source: 'offline',
    provider: 'device',
    parameterBillion: 7,
    ramRequiredMb: 6200,
    ollamaName: 'mistral:7b',
    official: true,
    capabilities: { documents: true, images: false, voice: true, chat: true, multilingual: true, code: true },
  },
];

export const MOBILE_GGUF_LIBRARY: ModelMetadata[] = [...CURATED_MODELS, ...EXTRA_MOBILE_GGUF];

export const ONLINE_OLLAMA_MODELS: ModelMetadata[] = [
  {
    id: 'llama-3.3-70b-ollama',
    name: 'Llama 3.3 70B (Desktop)',
    architecture: 'llama3',
    parameters: '70B',
    quantization: 'Q4_K_M',
    sizeBytes: 42000000000,
    sizeFormatted: 'Desktop Stream',
    recommendedRamMb: 0,
    ramTier: '3GB Performance',
    description: 'Large reasoning model streamed from the paired Ultron Desktop.',
    downloadUrl: 'http://localhost:11434/api/generate.gguf',
    filename: 'llama-3.3-70b-ollama.gguf',
    contextLength: 32768,
    tags: ['Desktop', '70B Parameters', 'High Compute'],
    source: 'online',
    provider: 'ollama',
    apiModel: 'llama3.3',
    capabilities: {
      documents: true,
      images: true,
      voice: true,
    },
  },
  {
    id: 'deepseek-r1-ollama',
    name: 'DeepSeek R1 (Desktop)',
    architecture: 'qwen25',
    parameters: '14B',
    quantization: 'Q4_K_M',
    sizeBytes: 8500000000,
    sizeFormatted: 'Desktop Stream',
    recommendedRamMb: 0,
    ramTier: '2GB Standard',
    description: 'Deep chain-of-thought reasoning streamed from the paired Ultron Desktop.',
    downloadUrl: 'http://localhost:11434/api/generate.gguf',
    filename: 'deepseek-r1-ollama.gguf',
    contextLength: 32768,
    tags: ['Desktop', 'Reasoning Specialist', 'Stream'],
    source: 'online',
    provider: 'ollama',
    apiModel: 'deepseek-r1',
    capabilities: {
      documents: true,
      images: true,
      voice: true,
    },
  },
];

export const GEMINI_CLOUD_MODELS: ModelMetadata[] = [];

export const ALL_MODELS: ModelMetadata[] = [
  ...CURATED_MODELS,
  ...EXTRA_MOBILE_GGUF,
  ...ONLINE_OLLAMA_MODELS,
  ...GEMINI_CLOUD_MODELS,
];

export function getModelById(modelId: string): ModelMetadata | undefined {
  return [...ALL_MODELS, ...getDiscoveredModels()].find((m) => m.id === modelId);
}

export function getDefaultModel(): ModelMetadata {
  return CURATED_MODELS[0];
}

export function getInstalledDeviceModels(downloadedIds: string[]): ModelMetadata[] {
  const downloaded = new Set(downloadedIds);
  return [...CURATED_MODELS, ...EXTRA_MOBILE_GGUF, ...getDiscoveredModels()].filter(
    (m) => m.provider === 'device' && downloaded.has(m.id)
  );
}

function formatOllamaSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Installed';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function mapLiveOllamaModel(tag: { name: string; size?: number }): ModelMetadata {
  const name = tag.name || 'ollama';
  const known = ONLINE_OLLAMA_MODELS.find(
    (m) => m.apiModel === name || name === m.apiModel || name.startsWith(`${m.apiModel}:`) || name.startsWith(m.apiModel || '___')
  );
  if (known) {
    return {
      ...known,
      id: `ollama-live-${name}`,
      name,
      apiModel: name,
      sizeFormatted: formatOllamaSize(tag.size),
      sizeBytes: tag.size || known.sizeBytes,
    };
  }
  return {
    id: `ollama-live-${name}`,
    name,
    architecture: /qwen|deepseek/i.test(name) ? 'qwen25' : /gemma/i.test(name) ? 'gemma2' : 'llama3',
    parameters: 'Live',
    quantization: 'Q4_K_M',
    sizeBytes: tag.size || 0,
    sizeFormatted: formatOllamaSize(tag.size),
    recommendedRamMb: 0,
    ramTier: '2GB Standard',
    description: 'Installed on the paired Ultron Desktop.',
    downloadUrl: 'http://127.0.0.1:11434/api/generate',
    filename: name,
    contextLength: 8192,
    tags: ['Desktop', 'Live'],
    source: 'online',
    provider: 'ollama',
    apiModel: name,
    capabilities: { documents: true, images: false, voice: true },
  };
}

export function buildAvailableChatModels(options: {
  downloadedIds: string[];
  hasGeminiKey: boolean;
  ollamaTags?: Array<{ name: string; size?: number }>;
  geminiModels?: ModelMetadata[];
  activeModel?: ModelMetadata | null;
  allowEmpty?: boolean;
}): ModelMetadata[] {
  const deviceLibrary = [...CURATED_MODELS, ...EXTRA_MOBILE_GGUF, ...getDiscoveredModels()];
  const downloaded = new Set(options.downloadedIds);
  const list: ModelMetadata[] = deviceLibrary.filter(
    (m) => m.provider === 'device' && downloaded.has(m.id)
  );

  if (options.geminiModels && options.geminiModels.length) {
    list.push(
      ...options.geminiModels.filter(
        (m) => m.provider === 'gemini' && m.apiModel && !/gemini-3\.5/i.test(m.apiModel + m.name)
      )
    );
  }

  for (const tag of options.ollamaTags || []) {
    if (!tag?.name) continue;
    list.push(mapLiveOllamaModel(tag));
  }

  const active = options.activeModel;
  if (
    active &&
    !list.some((m) => m.id === active.id) &&
    (
      (active.provider === 'device' && downloaded.has(active.id)) ||
      (active.provider === 'gemini' && !!active.apiModel && !/gemini-3\.5/i.test(active.apiModel)) ||
      (active.provider === 'ollama' && (options.ollamaTags || []).some((t) => t.name === active.apiModel || t.name === active.name))
    )
  ) {
    list.unshift(active);
  }

  if (list.length === 0 && !options.allowEmpty) {
    list.push(getDefaultModel());
  }

  const seen = new Set<string>();
  return list.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function parseParameterBillion(parameters: string, explicit?: number): number {
  if (typeof explicit === 'number' && explicit > 0) return explicit;
  const match = String(parameters || '').match(/([\d.]+)\s*B/i);
  return match ? parseFloat(match[1]) : 0;
}

export function mobileCapabilityTier(model: ModelMetadata): MobileRamTier {
  if (model.ramTier === 'Ultra-Light' || model.ramTier === 'Standard' || model.ramTier === 'Flagship') {
    return model.ramTier;
  }
  const ram = model.ramRequiredMb || model.recommendedRamMb;
  if (ram <= 1800) return 'Ultra-Light';
  if (ram <= 4000) return 'Standard';
  return 'Flagship';
}

export function isTooHeavyForDevice(model: ModelMetadata, totalRamMb: number): boolean {
  const billion = parseParameterBillion(model.parameters, model.parameterBillion);
  if (billion >= HEAVY_MODEL_PARAM_BILLION) return true;
  const need = model.ramRequiredMb || model.recommendedRamMb;
  if (need > 0 && need > totalRamMb * 0.7) return true;
  const tier = mobileCapabilityTier(model);
  if (totalRamMb < 4096 && tier !== 'Ultra-Light') return true;
  if (totalRamMb < 8192 && tier === 'Flagship') return true;
  return false;
}

export function filterMobileSafeModels(
  models: ModelMetadata[],
  totalRamMb: number
): ModelMetadata[] {
  return models.filter((m) => m.provider === 'device' && !isTooHeavyForDevice(m, totalRamMb));
}

export function groupMobileModelsByTier(
  models: ModelMetadata[]
): Record<MobileRamTier, ModelMetadata[]> {
  const groups: Record<MobileRamTier, ModelMetadata[]> = {
    'Ultra-Light': [],
    Standard: [],
    Flagship: [],
  };
  for (const model of models) {
    groups[mobileCapabilityTier(model)].push(model);
  }
  return groups;
}

function mapHfToMetadata(row: any): ModelMetadata | null {
  const id = String(row?.id || '');
  const name = id.split('/').pop() || id;
  if (!name) return null;
  const billion = parseParameterBillion(name);
  if (billion >= HEAVY_MODEL_PARAM_BILLION) return null;
  return {
    id: `hf-${id.replace(/[^\w.-]+/g, '-').toLowerCase()}`,
    name: name.replace(/-GGUF$/i, '').replace(/-/g, ' '),
    architecture: /qwen/i.test(name) ? 'qwen25' : /gemma/i.test(name) ? 'gemma2' : 'llama3',
    parameters: billion ? `${billion}B` : 'SLM',
    quantization: 'Q4_K_M',
    sizeBytes: Math.max(400000000, Math.round((billion || 1.5) * 650000000)),
    sizeFormatted: billion ? `~${(billion * 0.65).toFixed(1)} GB` : 'GGUF',
    recommendedRamMb: Math.round((billion || 1.5) * 900),
    ramTier: billion <= 1.8 ? 'Ultra-Light' : billion <= 4 ? 'Standard' : 'Flagship',
    description: `Curated GGUF from Hugging Face (${id}). Hidden automatically if it exceeds this phone's RAM budget.`,
    downloadUrl: `https://huggingface.co/${id}`,
    filename: `${name}.gguf`,
    contextLength: 4096,
    tags: ['HuggingFace', 'GGUF', 'Chat'],
    source: 'offline',
    provider: 'device',
    parameterBillion: billion || undefined,
    ramRequiredMb: Math.round((billion || 1.5) * 900),
    official: false,
    capabilities: { documents: true, images: false, voice: true, chat: true },
  };
}

export async function fetchLiveMobileRegistry(): Promise<ModelMetadata[]> {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), 4000);
    const res = await fetch(
      'https://huggingface.co/api/models?search=instruct%20Q4_K_M%20gguf&filter=gguf&limit=24&sort=downloads',
      { signal: controller?.signal as any }
    );
    clearTimeout(timer);
    if (!res.ok) return MOBILE_GGUF_LIBRARY;
    const rows = await res.json();
    const live = Array.isArray(rows)
      ? rows.map(mapHfToMetadata).filter(Boolean) as ModelMetadata[]
      : [];
    const merged = [...MOBILE_GGUF_LIBRARY];
    for (const item of live) {
      if (!merged.some((m) => m.id === item.id || m.name === item.name)) {
        merged.push(item);
      }
    }
    return merged;
  } catch {
    return MOBILE_GGUF_LIBRARY;
  }
}
