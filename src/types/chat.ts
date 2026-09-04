export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  timestamp: number;
  tokensPerSecond?: number;
  totalTokens?: number;
  modelId?: string;
  isStreaming?: boolean;
  /** Prompt-aware status shown while waiting for the first token. */
  statusLabel?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview?: string;
}

export interface GenerationStats {
  tokensEvaluated: number;
  tokensGenerated: number;
  evalDurationMs: number;
  generateDurationMs: number;
  tokensPerSecond: number;
}
