export type ModelArchitecture = 'llama3' | 'gemma2' | 'qwen25';

export type QuantizationTier = 'Q4_K_M' | 'Q5_K_M' | 'Q8_0';

export type MobileRamTier = 'Ultra-Light' | 'Standard' | 'Flagship';

export interface ModelCapabilities {
  documents: boolean;
  images: boolean;
  voice: boolean;
  code?: boolean;
  chat?: boolean;
  multilingual?: boolean;
}

export interface ModelMetadata {
  id: string;
  name: string;
  architecture: ModelArchitecture;
  parameters: string;
  quantization: QuantizationTier;
  sizeBytes: number;
  sizeFormatted: string;
  recommendedRamMb: number;
  ramTier: '1GB Budget' | '2GB Standard' | '3GB Performance' | MobileRamTier;
  description: string;
  downloadUrl: string;
  filename: string;
  contextLength: number;
  tags: string[];
  source?: 'offline' | 'online' | 'cloud';
  provider?: 'device' | 'ollama' | 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'groq' | 'custom';
  apiModel?: string;
  capabilities?: ModelCapabilities;
  parameterBillion?: number;
  ramRequiredMb?: number;
  ollamaName?: string;
  official?: boolean;
}

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'downloaded' | 'error';

export interface ModelDownloadState {
  modelId: string;
  status: DownloadStatus;
  progress: number; // 0 to 100
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  localPath?: string;
  error?: string;
}

export interface InferenceSettings {
  temperature: number;
  topP: number;
  contextSize: number;
  threads: number;
  systemPrompt: string;
  useHardwareAcceleration: boolean;
}
