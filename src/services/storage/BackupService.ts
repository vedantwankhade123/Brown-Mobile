import { ChatMessage, ChatSession } from '../../types/chat';
import { ChatRepository } from './ChatRepository';
import { AssistantMemory } from './AssistantMemory';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
type RestorableSession = ChatSession & { messages: ChatMessage[] };
export interface ValidatedBackup {
  sessions: RestorableSession[];
  preferences: string[];
  messageCount: number;
}

function fail(): never { throw new Error('This is not a valid Brown backup. Choose an unmodified backup exported by Brown.'); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function time(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }

/** Validate the whole file before any storage mutation. Accept existing unversioned exports. */
export function validateBackup(raw: string): ValidatedBackup {
  if (raw.length > MAX_BACKUP_BYTES) throw new Error('Backup is too large. Choose a file smaller than 10 MB.');
  let value: any;
  try { value = JSON.parse(raw); } catch { return fail(); }
  if (!value || value.app !== 'Brown' || (value.schemaVersion !== undefined && value.schemaVersion !== 1) || !Array.isArray(value.sessions) || value.sessions.length > 10000) return fail();
  const byId = new Map<string, RestorableSession>();
  for (const session of value.sessions) {
    if (!session || !text(session.id, 200) || byId.has(session.id) || !text(session.title, 1000) || !time(session.createdAt) || !time(session.updatedAt) || typeof session.modelId !== 'string') return fail();
    byId.set(session.id, { id: session.id, title: session.title, modelId: session.modelId, createdAt: session.createdAt, updatedAt: session.updatedAt, messageCount: 0, messages: [] });
  }
  if (value.messages === undefined && value.sessions.some((s: any) => s.messages !== undefined && !Array.isArray(s.messages))) return fail();
  const messages = value.messages === undefined ? value.sessions.flatMap((s: any) => Array.isArray(s.messages) ? s.messages : []) : value.messages;
  if (!Array.isArray(messages) || messages.length > 50000) return fail();
  const seen = new Set<string>();
  for (const message of messages) {
    if (!message || !text(message.id, 200) || seen.has(message.id) || !byId.has(message.sessionId) || !['user', 'assistant', 'system'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 1000000 || !time(message.timestamp)) return fail();
    seen.add(message.id);
    byId.get(message.sessionId)!.messages.push({ id: message.id, sessionId: message.sessionId, role: message.role, content: message.content, timestamp: message.timestamp, ...(typeof message.modelId === 'string' ? { modelId: message.modelId } : {}) });
  }
  const memory = value.assistantMemory;
  if (memory !== undefined && (!memory || !Array.isArray(memory.preferences) || memory.preferences.length > 20 || memory.preferences.some((p: unknown) => !text(p, 400) || !(p as string).trim()))) return fail();
  const preferences = [...new Map<string, string>((memory?.preferences || []).map((p: string) => [p.trim().toLowerCase(), p.trim()])).values()];
  for (const session of byId.values()) {
    session.messages.sort((a, b) => a.timestamp - b.timestamp);
    session.messageCount = session.messages.length;
    session.lastMessagePreview = session.messages[session.messages.length - 1]?.content.slice(0, 80) || '';
  }
  return { sessions: [...byId.values()], preferences, messageCount: messages.length };
}

/** Merge without replacing chats or changing whether saved memory is enabled. */
export async function restoreBackup(backup: ValidatedBackup): Promise<{ sessions: number; messages: number; preferences: number }> {
  const saved = await AssistantMemory.list();
  const known = new Set(saved.map(p => p.toLowerCase()));
  const additions = backup.preferences.filter(p => !known.has(p.toLowerCase()));
  if (saved.length + additions.length > 20) throw new Error('Restoring these preferences would exceed the 20-preference limit. Remove some saved preferences first.');
  const result = await new ChatRepository().importBundle({ sessions: backup.sessions });
  await AssistantMemory.merge(additions);
  return { ...result, preferences: additions.length };
}
