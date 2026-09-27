import { ModelMetadata } from '../../types/model';
import { ModelDownloader } from './Downloader';
import { buildAvailableChatModels } from './ModelCatalog';
import { getCachedGeminiModels, getGeminiApiKey, discoverGeminiModels } from '../inference/GeminiClient';
import { getConfiguredCloudModels } from '../inference/CloudProviders';
import { DesktopSyncService } from '../sync/DesktopSync';

export function modelCaption(model: ModelMetadata): string {
  const isCloud = model.source === 'cloud' || model.provider === 'gemini';
  if (isCloud) return 'Cloud · Full power';
  if (model.ramTier === 'Ultra-Light') return 'On-device · Fast answers';
  if (model.ramTier === 'Flagship') return 'On-device · Advanced reasoning';
  return 'On-device · All-around help';
}

/** Trim a display name down to just family + version ("Llama 3.2 1B Instruct" -> "Llama 3.2"). */
export function shortModelName(name?: string | null): string {
  if (!name) return '';
  const tokens = name.split(/[\s/]+/).filter(Boolean);
  const kept: string[] = [];
  for (const t of tokens) {
    if (/^\d+(\.\d+)?[bB]$/.test(t)) break; // param size: 1B, 7B, 1.5B
    if (/^[Qq]\d/.test(t)) break; // quant: Q4, Q4_K_M, Q8_0
    if (/^\d+(\.\d+)?\s?(GB|MB|g)$/i.test(t)) break; // size: 4GB
    if (
      /^(instruct|chat|gguf|it|dpo|sft|code|vision|vl|audio|beta|latest|preview|base|nl)$/i.test(t)
    )
      break;
    kept.push(t);
  }
  const result = kept.join(' ').trim();
  return result.length ? result : name.trim();
}

export async function fetchAvailableChatModels(
  activeModel?: ModelMetadata | null
): Promise<ModelMetadata[]> {
  const downloader = ModelDownloader.getInstance();
  await downloader.whenReady();
  const downloadedIds = downloader.getDownloadedIds();

  let hasGeminiKey = false;
  let geminiModels: ModelMetadata[] = [];
  try {
    const key = await getGeminiApiKey();
    hasGeminiKey = !!key;
    if (key) {
      geminiModels = await getCachedGeminiModels();
      if (!geminiModels.length) {
        geminiModels = await discoverGeminiModels(key);
      }
    }
  } catch {}

  let ollamaTags: Array<{ name: string; size?: number }> = [];
  try {
    const sync = DesktopSyncService.getInstance();
    if (sync.getStatus().isConnected) {
      ollamaTags = await sync.fetchOllamaModels();
    }
  } catch {}

  let cloudModels: ModelMetadata[] = [];
  try {
    cloudModels = await getConfiguredCloudModels();
  } catch {}

  return buildAvailableChatModels({
    downloadedIds,
    hasGeminiKey,
    ollamaTags,
    geminiModels,
    cloudModels,
    activeModel: activeModel || null,
    allowEmpty: true,
  });
}
