/**
 * Generation status labels for the mobile chat bubble.
 * Provides dynamic and contextual status messages based on prompt analysis and inference phase.
 */
export function getContextualThinkingLabel(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') return 'Thinking';
  const p = prompt.toLowerCase();
  if (/\b(search|find|google|look up|who is|price|latest news|weather|where is|news|stock|shoe|shoes|buy|store|flight)\b/i.test(p)) {
    return 'Searching knowledge';
  }
  if (/\b(code|function|debug|fix|python|javascript|react|typescript|program|bug|error|script|app|component)\b/i.test(p)) {
    return 'Analyzing code';
  }
  if (/\b(calculate|math|solve|sum|equation|\d+\s*[\+\-\*\/]\s*\d+)\b/i.test(p)) {
    return 'Calculating';
  }
  if (/\b(translate|french|spanish|german|hindi|japanese|chinese|language)\b/i.test(p)) {
    return 'Translating';
  }
  if (/\b(summarize|pdf|document|file|notes|article|contract|resume)\b/i.test(p)) {
    return 'Reading document';
  }
  if (/\b(what can u do|what can you do|help|capabilities|who are you)\b/i.test(p)) {
    return 'Analyzing request';
  }
  return 'Thinking';
}

/** Delay before promoting Thinking → Formulating response while awaiting tokens. */
export const ANSWERING_PROMOTE_MS = 1400;

/** Delay before secondary prompt if model load is taking time. */
export const GENERATING_PROMOTE_MS = 3500;
