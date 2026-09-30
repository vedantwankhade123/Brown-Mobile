import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModelMetadata } from '../../types/model';
import { getModelById } from './ModelCatalog';

const SELECTED_MODEL_KEY = '@brown_selected_model_v1';

/**
 * The chosen model has to survive both a screen change (Model Store → Chat) and an app
 * restart. ChatScreen used to fall back to whichever installed model came first, which
 * silently ignored the user's pick.
 */
export async function saveSelectedModel(model: ModelMetadata): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
  } catch (err) {
    console.warn('[ModelSelection] could not persist selection:', err);
  }
}

export async function loadSelectedModel(): Promise<ModelMetadata | null> {
  try {
    const raw = await AsyncStorage.getItem(SELECTED_MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Older builds stored just the id.
    if (typeof parsed === 'string') return getModelById(parsed) || null;
    if (parsed && typeof parsed === 'object' && parsed.id) return parsed as ModelMetadata;
    return null;
  } catch {
    return null;
  }
}

/** Only honor the stored pick when it is actually available right now. */
export function matchSelectedModel(
  selected: ModelMetadata | null,
  available: ModelMetadata[]
): ModelMetadata | null {
  if (!selected || available.length === 0) return null;
  return available.find((m) => m.id === selected.id) || null;
}
