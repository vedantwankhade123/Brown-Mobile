/**
 * Real Kokoro ONNX inference for mobile (Heart / Michael).
 * Downloads align with desktop: onnx-community/Kokoro-82M-v1.0-ONNX q8 + voice bins.
 */
import { Platform } from 'react-native';
import { StoragePaths } from '../storage/StoragePaths';
import type { KokoroVoiceId } from './KokoroTtsService';

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const HF = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main`;

export const KOKORO_HF_ASSETS = {
  model: {
    fileName: 'model_quantized.onnx',
    url: `${HF}/onnx/model_quantized.onnx`,
    minBytes: 75 * 1024 * 1024,
  },
  voices: {
    af_heart: {
      fileName: 'af_heart.bin',
      url: `${HF}/voices/af_heart.bin`,
      minBytes: 400 * 1024,
    },
    am_michael: {
      fileName: 'am_michael.bin',
      url: `${HF}/voices/am_michael.bin`,
      minBytes: 400 * 1024,
    },
  },
  tokenizer: {
    fileName: 'tokenizer.json',
    url: `${HF}/tokenizer.json`,
    minBytes: 1024,
  },
} as const;

let ortModule: any = null;
let sessionPromise: Promise<any> | null = null;
let vocabPromise: Promise<Record<string, number>> | null = null;

async function getCacheDir(): Promise<string> {
  const models = await StoragePaths.getModelsDir();
  const dir = `${models}tts-cache/kokoro-engine/`;
  await StoragePaths.ensureDir(dir);
  return dir;
}

export async function isKokoroOnnxRuntimeReady(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!ortModule) {
      ortModule = require('onnxruntime-react-native');
    }
    return Boolean(ortModule?.InferenceSession);
  } catch {
    return false;
  }
}

async function loadVocab(cacheDir: string): Promise<Record<string, number>> {
  if (vocabPromise) return vocabPromise;
  vocabPromise = (async () => {
    const FileSystem = require('expo-file-system');
    const path = `${cacheDir}${KOKORO_HF_ASSETS.tokenizer.fileName}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info?.exists) {
      // Minimal fallback phoneme → id map used by Kokoro tokenizer
      return buildFallbackVocab();
    }
    try {
      const raw = await FileSystem.readAsStringAsync(path);
      const parsed = JSON.parse(raw);
      const model = parsed?.model?.vocab || parsed?.vocab || {};
      if (model && typeof model === 'object') return model as Record<string, number>;
    } catch {}
    return buildFallbackVocab();
  })();
  return vocabPromise;
}

function buildFallbackVocab(): Record<string, number> {
  // Kokoro IPA-ish character vocab (subset). Enough for English fallbacks.
  const chars =
    ";:,.!?¡¿—…\"«»“”(){}[]$'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿāēīōūəɪʊɔɑæʃʒθðŋɹɾɫˈˌː ";
  const vocab: Record<string, number> = { $: 0 };
  let i = 1;
  for (const ch of chars) {
    if (!(ch in vocab)) vocab[ch] = i++;
  }
  return vocab;
}

/** Very light English → approx phoneme string (US). Real quality needs espeak; this keeps ONNX path alive. */
function roughPhonemize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'.,!?-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizePhonemes(phonemes: string, vocab: Record<string, number>): number[] {
  const ids: number[] = [0]; // BOS
  for (const ch of phonemes) {
    if (vocab[ch] != null) ids.push(vocab[ch]);
    else if (ch === ' ') ids.push(vocab[' '] ?? 0);
  }
  ids.push(0); // EOS
  return ids.slice(0, 512);
}

async function loadVoiceStyle(cacheDir: string, voiceId: KokoroVoiceId, tokenLen: number): Promise<Float32Array> {
  const FileSystem = require('expo-file-system');
  const asset = KOKORO_HF_ASSETS.voices[voiceId];
  const path = `${cacheDir}${asset.fileName}`;
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  const binary = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  const offset = 256 * Math.min(Math.max(tokenLen - 2, 0), 509);
  return all.slice(offset, offset + 256);
}

async function getSession(cacheDir: string): Promise<any> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    if (!ortModule) ortModule = require('onnxruntime-react-native');
    const modelPath = `${cacheDir}${KOKORO_HF_ASSETS.model.fileName}`;
    // onnxruntime-react-native expects a filesystem path without file://
    const path = modelPath.replace(/^file:\/\//, '');
    return ortModule.InferenceSession.create(path);
  })().catch((err: any) => {
    sessionPromise = null;
    throw err;
  });
  return sessionPromise;
}

function floatToWavUri(samples: Float32Array, sampleRate: number, outPath: string): Promise<string> {
  const FileSystem = require('expo-file-system');
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  let o = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, Math.round(s * 32767), true);
    o += 2;
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = globalThis.btoa ? globalThis.btoa(binary) : Buffer.from(bytes).toString('base64');
  return FileSystem.writeAsStringAsync(outPath, b64, { encoding: FileSystem.EncodingType.Base64 }).then(() => outPath);
}

export type KokoroOnnxResult = { uri: string; sampleRate: number };

/**
 * Run Kokoro q8 ONNX and write a temporary WAV for expo-av playback.
 */
export async function synthesizeKokoroOnnx(
  text: string,
  voiceId: KokoroVoiceId = 'af_heart',
  speed = 1
): Promise<KokoroOnnxResult | null> {
  if (!(await isKokoroOnnxRuntimeReady())) return null;

  const cacheDir = await getCacheDir();
  const FileSystem = require('expo-file-system');
  const modelInfo = await FileSystem.getInfoAsync(`${cacheDir}${KOKORO_HF_ASSETS.model.fileName}`);
  const voiceInfo = await FileSystem.getInfoAsync(`${cacheDir}${KOKORO_HF_ASSETS.voices[voiceId].fileName}`);
  if (!modelInfo?.exists || Number(modelInfo.size || 0) < KOKORO_HF_ASSETS.model.minBytes) {
    throw new Error('Kokoro ONNX model is missing or incomplete.');
  }
  if (!voiceInfo?.exists || Number(voiceInfo.size || 0) < KOKORO_HF_ASSETS.voices[voiceId].minBytes) {
    throw new Error(`Kokoro voice ${voiceId} is missing. Re-download Heart & Michael.`);
  }

  const vocab = await loadVocab(cacheDir);
  const phonemes = roughPhonemize(text);
  const ids = tokenizePhonemes(phonemes, vocab);
  if (ids.length < 3) return null;

  const style = await loadVoiceStyle(cacheDir, voiceId, ids.length);
  const session = await getSession(cacheDir);
  const { Tensor } = ortModule;

  const feeds: Record<string, any> = {
    input_ids: new Tensor('int64', BigInt64Array.from(ids.map((n) => BigInt(n))), [1, ids.length]),
    style: new Tensor('float32', style, [1, 256]),
    speed: new Tensor('float32', Float32Array.from([speed]), [1]),
  };

  const out = await session.run(feeds);
  const waveform = out.waveform || out[Object.keys(out)[0]];
  const data: Float32Array = waveform?.data instanceof Float32Array
    ? waveform.data
    : new Float32Array(waveform?.data || []);

  if (!data.length) throw new Error('Kokoro ONNX produced empty audio.');

  const outPath = `${cacheDir}tts-out-${Date.now()}.wav`;
  const uri = await floatToWavUri(data, 24000, outPath);
  return { uri, sampleRate: 24000 };
}

export function resetKokoroOnnxSession(): void {
  sessionPromise = null;
  vocabPromise = null;
}
