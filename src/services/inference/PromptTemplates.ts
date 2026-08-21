import { ChatMessage } from '../../types/chat';
import { ModelArchitecture } from '../../types/model';

export const DEFAULT_SYSTEM_PROMPT =
  'You are Ultron Mobile, a fast, completely offline, privacy-first AI companion running directly on this mobile device. Be concise, insightful, helpful, and direct.';

/**
 * Format conversation history into model-specific chat template
 */
export function formatPromptForModel(
  architecture: ModelArchitecture,
  messages: ChatMessage[],
  customSystemPrompt?: string
): string {
  const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

  switch (architecture) {
    case 'llama3':
      return formatLlama3Prompt(messages, systemPrompt);
    case 'gemma2':
      return formatGemma2Prompt(messages, systemPrompt);
    case 'qwen25':
      return formatQwen25Prompt(messages, systemPrompt);
    default:
      return formatLlama3Prompt(messages, systemPrompt);
  }
}

/**
 * Llama 3.2 Chat Template
 * <|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|>
 * <|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|>
 * <|start_header_id|>assistant<|end_header_id|>\n\n
 */
function formatLlama3Prompt(messages: ChatMessage[], systemPrompt: string): string {
  let prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>\n`;

  for (const msg of messages) {
    if (msg.role === 'user') {
      prompt += `<|start_header_id|>user<|end_header_id|>\n\n${msg.content}<|eot_id|>\n`;
    } else if (msg.role === 'assistant') {
      prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n${msg.content}<|eot_id|>\n`;
    }
  }

  prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
  return prompt;
}

/**
 * Gemma 2 Chat Template
 * <start_of_turn>user\n{system}\n\n{user}<end_of_turn>\n<start_of_turn>model\n{assistant}<end_of_turn>\n<start_of_turn>model\n
 */
function formatGemma2Prompt(messages: ChatMessage[], systemPrompt: string): string {
  let prompt = '';
  let isFirstUser = true;

  for (const msg of messages) {
    if (msg.role === 'user') {
      prompt += `<start_of_turn>user\n`;
      if (isFirstUser) {
        prompt += `${systemPrompt}\n\n`;
        isFirstUser = false;
      }
      prompt += `${msg.content}<end_of_turn>\n`;
    } else if (msg.role === 'assistant') {
      prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
    }
  }

  prompt += `<start_of_turn>model\n`;
  return prompt;
}

/**
 * Qwen 2.5 Chat Template (ChatML)
 * <|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n
 */
function formatQwen25Prompt(messages: ChatMessage[], systemPrompt: string): string {
  let prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n`;

  for (const msg of messages) {
    if (msg.role === 'user') {
      prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
    } else if (msg.role === 'assistant') {
      prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
    }
  }

  prompt += `<|im_start|>assistant\n`;
  return prompt;
}
