/**
 * Real Kokoro ONNX inference for mobile (Heart / Michael).
 * Downloads align with desktop: onnx-community/Kokoro-82M-v1.0-ONNX q8 + voice bins.
 */
import { Platform } from 'react-native';
import { StoragePaths } from '../storage/StoragePaths';
import type { KokoroVoiceId } from './KokoroTtsService';
import { phonemizeAmerican, tokenizeKokoroPhonemes } from './KokoroPhonemizer';

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const HF = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main`;

export const KOKORO_HF_ASSETS = {
  model: {
    fileName: 'model_quantized.onnx',
    url: `${HF}/onnx/model_quantized.onnx?download=true`,
    minBytes: 75 * 1024 * 1024,
  },
  voices: {
    af_heart: {
      fileName: 'af_heart.bin',
      url: `${HF}/voices/af_heart.bin?download=true`,
      minBytes: 400 * 1024,
    },
    am_michael: {
      fileName: 'am_michael.bin',
      url: `${HF}/voices/am_michael.bin?download=true`,
      minBytes: 400 * 1024,
    },
  },
  tokenizer: {
    fileName: 'tokenizer.json',
    url: `${HF}/tokenizer.json?download=true`,
    minBytes: 1024,
  },
} as const;

let ortModule: any = null;
let sessionPromise: Promise<any> | null = null;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const placeHolders = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytesCount = Math.max(0, Math.floor((len * 3) / 4) - placeHolders);
  const bytes = new Uint8Array(bytesCount);

  let curByte = 0;
  for (let i = 0; i < len; i += 4) {
    const enc1 = B64_LOOKUP[clean.charCodeAt(i)];
    const enc2 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const enc3 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const enc4 = B64_LOOKUP[clean.charCodeAt(i + 3)];

    if (curByte < bytesCount) bytes[curByte++] = (enc1 << 2) | (enc2 >> 4);
    if (curByte < bytesCount) bytes[curByte++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (curByte < bytesCount) bytes[curByte++] = ((enc3 & 3) << 6) | (enc4 & 63);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    result += B64_CHARS.charAt(b1 >> 2);
    result += B64_CHARS.charAt(((b1 & 3) << 4) | (b2 >> 4));
    result += i + 1 < len ? B64_CHARS.charAt(((b2 & 15) << 2) | (b3 >> 6)) : '=';
    result += i + 2 < len ? B64_CHARS.charAt(b3 & 63) : '=';
  }
  return result;
}

async function getCacheDir(): Promise<string> {
  const models = await StoragePaths.getModelsDir();
  const dir = `${models}tts-cache/kokoro-engine/`;
  await StoragePaths.ensureDir(dir);
  return dir;
}

export async function isKokoroOnnxRuntimeReady(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { NativeModules } = require('react-native');
    if (!NativeModules?.Onnxruntime) {
      return false;
    }
    if (!ortModule) {
      ortModule = require('onnxruntime-react-native');
    }
    return Boolean(ortModule?.InferenceSession);
  } catch {
    return false;
  }
}

async function loadVoiceStyle(
  cacheDir: string,
  voiceId: KokoroVoiceId,
  phonemeCount: number
): Promise<Float32Array> {
  const FileSystem = require('expo-file-system');
  const asset = KOKORO_HF_ASSETS.voices[voiceId];
  const path = `${cacheDir}${asset.fileName}`;
  const b64 = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(b64);
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  // Style row keyed by phoneme length (without pad tokens), clamped to available rows
  const rowCount = Math.floor(all.length / 256);
  const row = Math.min(Math.max(phonemeCount, 0), Math.max(rowCount - 1, 0), 509);
  const offset = row * 256;
  return all.slice(offset, offset + 256);
}

async function getSession(cacheDir: string): Promise<any> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    if (!ortModule) ortModule = require('onnxruntime-react-native');
    const modelPath = `${cacheDir}${KOKORO_HF_ASSETS.model.fileName}`;
    const path = modelPath.replace(/^file:\/+/, '/');
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
  const b64 = uint8ArrayToBase64(bytes);
  return FileSystem.writeAsStringAsync(outPath, b64, {
    encoding: FileSystem.EncodingType.Base64,
  }).then(() => outPath);
}

function toInt64Data(ids: number[]): any {
  // Prefer BigInt64Array when available (Hermes / modern JSI)
  try {
    if (typeof BigInt64Array !== 'undefined') {
      return BigInt64Array.from(ids.map((n) => BigInt(n)));
    }
  } catch {}
  // Fallback: some ORT builds accept number[] with int64 type
  return ids;
}

async function synthesizeChunk(
  cacheDir: string,
  text: string,
  voiceId: KokoroVoiceId,
  speed: number
): Promise<Float32Array> {
  const phonemes = phonemizeAmerican(text);
  const ids = tokenizeKokoroPhonemes(phonemes);
  if (ids.length < 3) {
    throw new Error('Kokoro phonemizer produced empty tokens for this text.');
  }

  const phonemeCount = Math.max(ids.length - 2, 0);
  const style = await loadVoiceStyle(cacheDir, voiceId, phonemeCount);
  const session = await getSession(cacheDir);
  const { Tensor } = ortModule;

  const feeds: Record<string, any> = {
    input_ids: new Tensor('int64', toInt64Data(ids), [1, ids.length]),
    style: new Tensor('float32', style, [1, 256]),
    speed: new Tensor('float32', Float32Array.from([Math.max(0.5, Math.min(2, speed))]), [1]),
  };

  const out = await session.run(feeds);
  const waveform = out.waveform || out[Object.keys(out)[0]];
  const data: Float32Array =
    waveform?.data instanceof Float32Array
      ? waveform.data
      : new Float32Array(waveform?.data || []);

  if (!data.length) throw new Error('Kokoro ONNX produced empty audio.');
  return data;
}

/** Split long text into sentence-ish chunks that fit Kokoro's 510 phoneme budget. */
function chunkTextForKokoro(text: string, maxChars = 220): string[] {
  const cleaned = String(text || '').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g) || [cleaned];
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((buf + ' ' + piece).trim().length <= maxChars) {
      buf = (buf + ' ' + piece).trim();
    } else {
      if (buf) chunks.push(buf);
      if (piece.length <= maxChars) {
        buf = piece;
      } else {
        // Hard-split very long sentences
        for (let i = 0; i < piece.length; i += maxChars) {
          chunks.push(piece.slice(i, i + maxChars));
        }
        buf = '';
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
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
  const voiceInfo = await FileSystem.getInfoAsync(
    `${cacheDir}${KOKORO_HF_ASSETS.voices[voiceId].fileName}`
  );
  if (!modelInfo?.exists || Number(modelInfo.size || 0) < KOKORO_HF_ASSETS.model.minBytes) {
    throw new Error('Kokoro ONNX model is missing or incomplete.');
  }
  if (!voiceInfo?.exists || Number(voiceInfo.size || 0) < KOKORO_HF_ASSETS.voices[voiceId].minBytes) {
    throw new Error(`Kokoro voice ${voiceId} is missing. Re-download Heart & Michael.`);
  }

  const chunks = chunkTextForKokoro(text);
  if (!chunks.length) return null;

  const sampleArrays: Float32Array[] = [];
  for (const chunk of chunks) {
    sampleArrays.push(await synthesizeChunk(cacheDir, chunk, voiceId, speed));
  }

  let total = 0;
  for (const a of sampleArrays) total += a.length;
  const merged = new Float32Array(total);
  let offset = 0;
  for (const a of sampleArrays) {
    merged.set(a, offset);
    offset += a.length;
  }

  const outPath = `${cacheDir}tts-out-${Date.now()}.wav`;
  const uri = await floatToWavUri(merged, 24000, outPath);
  return { uri, sampleRate: 24000 };
}

export function resetKokoroOnnxSession(): void {
  sessionPromise = null;
}
