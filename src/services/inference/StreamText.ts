/** llama.rn's parsed content is a snapshot of the whole answer, not a token. */
export function nativeTextDelta(data: { content?: string; reasoning_content?: string; token?: string }, current: string): string {
  if (typeof data.content === 'string') {
    return data.content.startsWith(current) ? data.content.slice(current.length) : '';
  }
  return data.reasoning_content ? '' : String(data.token ?? '');
}

/** React Native fetch can return the SSE body without a readable stream. */
export function bufferedCloudText(raw: string, provider: 'openai' | 'anthropic'): string {
  const extract = (event: any): string => provider === 'anthropic'
    ? (event.type === 'content_block_delta' ? event.delta?.text || '' :
      Array.isArray(event.content) ? event.content.filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('') : '')
    : event.choices?.[0]?.delta?.content || event.choices?.[0]?.message?.content || event.choices?.[0]?.text || '';
  try { return extract(JSON.parse(raw)); } catch {}
  return raw.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => {
    try { return extract(JSON.parse(line.slice(5).trim())); } catch { return ''; }
  }).join('');
}
