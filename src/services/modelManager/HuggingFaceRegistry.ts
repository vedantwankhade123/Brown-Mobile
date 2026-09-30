import { ModelMetadata, QuantizationTier } from '../../types/model';

const HF_MODELS_API = 'https://huggingface.co/api/models';
const PAGE_SIZE = 10;
const DISCOVERED_KEY = '@ultron_hf_discovered_models';
const HEAVY_BILLION = 14;
const MAX_MOBILE_GGUF_BYTES = 4 * 1024 * 1024 * 1024;
const MIN_MOBILE_GGUF_BYTES = 100 * 1024 * 1024;
/** Hugging Face's API regularly stalls on mobile networks; never wait on it forever. */
const HF_TIMEOUT_MS = 20_000;

export const HF_PAGE_SIZE = PAGE_SIZE;

let discoveredCache: ModelMetadata[] = [];

function getStore(): { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> } | null {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

export function getDiscoveredModels(): ModelMetadata[] {
  return discoveredCache;
}

export async function hydrateDiscoveredModels(): Promise<ModelMetadata[]> {
  try {
    const store = getStore();
    const raw = store ? await store.getItem(DISCOVERED_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    discoveredCache = Array.isArray(parsed) ? parsed.filter((m) => m?.id && m?.downloadUrl) : [];
  } catch {
    discoveredCache = [];
  }
  return discoveredCache;
}

export async function rememberDiscoveredModels(models: ModelMetadata[]): Promise<void> {
  for (const model of models) {
    if (!model?.id) continue;
    const idx = discoveredCache.findIndex((m) => m.id === model.id);
    if (idx >= 0) discoveredCache[idx] = model;
    else discoveredCache.push(model);
  }
  try {
    const store = getStore();
    if (store) await store.setItem(DISCOVERED_KEY, JSON.stringify(discoveredCache));
  } catch {}
}

export function parseLinkNext(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (match) return match[1];
  }
  return null;
}

export function pickMobileGgufFile(
  siblings: Array<{ rfilename?: string; size?: number }> | undefined
): { filename: string; sizeBytes: number } | null {
  const files = (siblings || [])
    .map((s) => ({
      filename: String(s?.rfilename || ''),
      sizeBytes: Number(s?.size || 0),
    }))
    .filter((f) => {
      if (!/\.gguf$/i.test(f.filename)) return false;
      if (/(mmproj|imatrix|\.gguf\.lora|0000\d-of-)/i.test(f.filename)) return false;
      if (/-\d{5}-of-\d{5}/i.test(f.filename)) return false;
      return true;
    });

  // Split dumps and fp16 files are never loadable on a phone, so they are only used
  // when the repo offers literally nothing else.
  const pool = files.filter((f) => f.sizeBytes <= 0 || f.sizeBytes <= MAX_MOBILE_GGUF_BYTES);
  const candidates = pool.length ? pool : files;

  const preferred = [
    /Q4_K_M/i,
    /Q4_K_S/i,
    /IQ4_XS/i,
    /Q5_K_M/i,
    /Q4_0/i,
    /Q5_K_S/i,
  ];
  for (const re of preferred) {
    const hit = candidates.find((f) => re.test(f.filename));
    if (hit) return hit;
  }

  const sized = candidates.filter((f) => f.sizeBytes > 0);
  if (sized.length) {
    // Smallest file that is still large enough to hold weights — beats picking an
    // arbitrary first entry, which is often a tokenizer-only or fp16 dump.
    const weightLike = sized.filter((f) => f.sizeBytes >= MIN_MOBILE_GGUF_BYTES);
    const shortlist = weightLike.length ? weightLike : sized;
    return shortlist.reduce((smallest, f) => (f.sizeBytes < smallest.sizeBytes ? f : smallest));
  }
  return candidates[0] || null;
}

function parseBillion(text: string): number {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*B/i);
  return match ? parseFloat(match[1]) : 0;
}

function guessArchitecture(name: string): ModelMetadata['architecture'] {
  if (/qwen|deepseek/i.test(name)) return 'qwen25';
  if (/gemma/i.test(name)) return 'gemma2';
  return 'llama3';
}

function guessQuant(filename: string): QuantizationTier {
  if (/Q8_0/i.test(filename)) return 'Q8_0';
  if (/Q5_K_M/i.test(filename)) return 'Q5_K_M';
  return 'Q4_K_M';
}

function formatSize(bytes: number, billion: number): string {
  if (bytes > 0) {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  if (billion > 0) return `~${(billion * 0.65).toFixed(1)} GB`;
  return 'GGUF';
}

export function mapHfRepoToMetadata(row: any, file: { filename: string; sizeBytes: number }): ModelMetadata | null {
  const repoId = String(row?.id || row?.modelId || '');
  if (!repoId) return null;
  const display = (repoId.split('/').pop() || repoId).replace(/-GGUF$/i, '');
  const billion = parseBillion(display) || parseBillion(file.filename) || parseBillion(String(row?.pipeline_tag || ''));
  if (billion >= HEAVY_BILLION) return null;
  const sizeBytes = file.sizeBytes || Math.max(400000000, Math.round((billion || 1.5) * 650000000));
  const ram = Math.round((billion || 1.5) * 900);
  return {
    id: `hf-${repoId.replace(/[^\w.-]+/g, '-').toLowerCase()}`,
    name: display.replace(/-/g, ' '),
    architecture: guessArchitecture(display + file.filename),
    parameters: billion ? `${billion}B` : 'SLM',
    quantization: guessQuant(file.filename),
    sizeBytes,
    sizeFormatted: formatSize(sizeBytes, billion),
    recommendedRamMb: ram,
    ramTier: ram <= 1800 ? 'Ultra-Light' : ram <= 4000 ? 'Standard' : 'Flagship',
    description: `GGUF from Hugging Face (${repoId}). ${file.filename}`,
    downloadUrl: `https://huggingface.co/${repoId}/resolve/main/${file.filename}`,
    filename: file.filename.split('/').pop() || file.filename,
    contextLength: 4096,
    tags: ['HuggingFace', 'GGUF', 'Chat'],
    source: 'offline',
    provider: 'device',
    parameterBillion: billion || undefined,
    ramRequiredMb: ram,
    official: false,
    capabilities: { documents: true, images: false, voice: true, chat: true },
  };
}

async function fetchWithTimeout(url: string, timeoutMs = HF_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal as any });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRepoSiblings(repoId: string): Promise<Array<{ rfilename?: string; size?: number }>> {
  const res = await fetchWithTimeout(`${HF_MODELS_API}/${repoId}`);
  if (!res.ok) return [];
  const payload = await res.json();
  return Array.isArray(payload?.siblings) ? payload.siblings : [];
}

export interface HuggingFaceSearchPage {
  models: ModelMetadata[];
  nextUrl: string | null;
  query: string;
}

function buildSearchUrl(query: string, skip: number, limit: number): string {
  const q = encodeURIComponent(query.trim() || 'instruct gguf');
  return `${HF_MODELS_API}?search=${q}&filter=gguf&sort=downloads&direction=-1&limit=${limit}&full=true&skip=${Math.max(0, skip)}`;
}

export async function searchHuggingFaceGgufs(options: {
  query: string;
  nextUrl?: string | null;
  skip?: number;
  limit?: number;
}): Promise<HuggingFaceSearchPage> {
  const limit = options.limit || PAGE_SIZE;
  const url = options.nextUrl || buildSearchUrl(options.query, options.skip || 0, limit);
  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (/abort/i.test(msg)) {
      throw new Error('Hugging Face took too long to respond. Check the connection and search again.');
    }
    throw new Error('Cannot reach Hugging Face. Check the connection and search again.');
  }
  if (!res.ok) {
    throw new Error(`Hugging Face returned HTTP ${res.status}`);
  }
  const rows = await res.json();
  const nextUrl = parseLinkNext(res.headers.get('link') || res.headers.get('Link'));
  const list = Array.isArray(rows) ? rows : [];
  const models: ModelMetadata[] = [];

  for (const row of list) {
    const repoId = String(row?.id || '');
    if (!repoId) continue;
    let siblings = Array.isArray(row?.siblings) ? row.siblings : [];
    if (!siblings.length) {
      try {
        siblings = await fetchRepoSiblings(repoId);
      } catch {
        siblings = [];
      }
    }
    const file = pickMobileGgufFile(siblings);
    if (!file) continue;
    const mapped = mapHfRepoToMetadata(row, file);
    if (!mapped) continue;
    if (!mapped.downloadUrl.toLowerCase().includes('.gguf')) continue;
    models.push(mapped);
  }

  await rememberDiscoveredModels(models);
  return {
    models,
    nextUrl: nextUrl || (list.length >= limit ? buildSearchUrl(options.query, (options.skip || 0) + limit, limit) : null),
    query: options.query,
  };
}
