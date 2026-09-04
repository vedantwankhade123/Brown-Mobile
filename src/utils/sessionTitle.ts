/**
 * Instant session titles from the first user prompt (mirrors desktop).
 */

export function generateSessionTitle(userPrompt: string): string {
  if (!userPrompt || typeof userPrompt !== 'string') return 'New Chat';

  let clean = userPrompt
    .trim()
    .replace(/^[\s\W_]+/, '')
    .replace(
      /^(can you|please|could you|help me with|help me|i want to|how to|what is|tell me about|explain|write a|create a|give me|what can you)\s+/i,
      ''
    )
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) clean = userPrompt.trim().replace(/\s+/g, ' ');

  const words = clean.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return 'New Chat';

  let title = words
    .map((word) => {
      if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  if (title.length > 32) {
    title = `${title.substring(0, 29)}...`;
  }

  return title || 'New Chat';
}

export function isDefaultSessionTitle(title?: string | null): boolean {
  const normalized = String(title || '')
    .trim()
    .toLowerCase();
  return !normalized || normalized === 'new chat' || normalized === 'new conversation';
}
