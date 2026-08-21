import { AppDatabase } from './Database';
import { ChatMessage, ChatSession } from '../../types/chat';

export class ChatRepository {
  private db: AppDatabase;

  constructor() {
    this.db = AppDatabase.getInstance();
  }

  async createSession(title: string, modelId: string): Promise<ChatSession> {
    const now = Date.now();
    const session: ChatSession = {
      id: 'session_' + Math.random().toString(36).substring(2, 11),
      title: title || 'New Conversation',
      modelId,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      lastMessagePreview: '',
    };

    await this.db.exec(
      `INSERT INTO sessions (id, title, model_id, created_at, updated_at, message_count, last_message_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.title, session.modelId, session.createdAt, session.updatedAt, 0, '']
    );

    return session;
  }

  async getAllSessions(): Promise<ChatSession[]> {
    const rows = await this.db.getAll<any>(
      `SELECT id, title, model_id as modelId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, last_message_preview as lastMessagePreview
       FROM sessions ORDER BY updated_at DESC`
    );
    return rows;
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    const row = await this.db.getFirst<any>(
      `SELECT id, title, model_id as modelId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, last_message_preview as lastMessagePreview
       FROM sessions WHERE id = ?`,
      [sessionId]
    );
    return row;
  }

  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    const fullMessage: ChatMessage = {
      ...message,
      id: 'msg_' + Math.random().toString(36).substring(2, 11),
    };

    await this.db.exec(
      `INSERT INTO messages (id, session_id, role, content, timestamp, tokens_per_second, total_tokens, model_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullMessage.id,
        fullMessage.sessionId,
        fullMessage.role,
        fullMessage.content,
        fullMessage.timestamp,
        fullMessage.tokensPerSecond || 0,
        fullMessage.totalTokens || 0,
        fullMessage.modelId || '',
      ]
    );

    // Update session timestamp & preview
    const preview = fullMessage.content.slice(0, 80).replace(/\n/g, ' ');
    await this.db.exec(
      `UPDATE sessions 
       SET updated_at = ?, last_message_preview = ?, message_count = message_count + 1
       WHERE id = ?`,
      [fullMessage.timestamp, preview, fullMessage.sessionId]
    );

    return fullMessage;
  }

  async upsertSession(session: ChatSession): Promise<void> {
    await this.db.exec(
      `INSERT OR REPLACE INTO sessions (id, title, model_id, created_at, updated_at, message_count, last_message_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.title,
        session.modelId,
        session.createdAt,
        session.updatedAt,
        session.messageCount,
        session.lastMessagePreview || '',
      ]
    );
  }

  async upsertMessage(message: ChatMessage): Promise<void> {
    await this.db.exec(
      `INSERT OR REPLACE INTO messages (id, session_id, role, content, timestamp, tokens_per_second, total_tokens, model_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.timestamp,
        message.tokensPerSecond || 0,
        message.totalTokens || 0,
        message.modelId || '',
      ]
    );
  }

  async exportAll(): Promise<{ sessions: ChatSession[]; messages: ChatMessage[] }> {
    const sessions = await this.getAllSessions();
    const messages: ChatMessage[] = [];
    for (const session of sessions) {
      const rows = await this.getMessagesForSession(session.id);
      messages.push(...rows);
    }
    return { sessions, messages };
  }

  async importBundle(bundle: {
    sessions: Array<Partial<ChatSession> & { id: string; messages?: ChatMessage[] }>;
  }): Promise<{ sessions: number; messages: number }> {
    let sessionCount = 0;
    let messageCount = 0;
    const existingSessions = await this.getAllSessions();
    const sessionIds = new Set(existingSessions.map((s) => s.id));

    for (const incoming of bundle.sessions || []) {
      if (!incoming.id) continue;
      const existing = existingSessions.find((s) => s.id === incoming.id);
      const createdAt = Number(incoming.createdAt) || Date.now();
      const updatedAt = Number(incoming.updatedAt) || createdAt;
      const title = incoming.title || existing?.title || 'Synced conversation';
      const nested = incoming.messages || [];

      if (!sessionIds.has(incoming.id)) {
        await this.upsertSession({
          id: incoming.id,
          title,
          modelId: incoming.modelId || existing?.modelId || 'synced',
          createdAt,
          updatedAt,
          messageCount: nested.length || incoming.messageCount || 0,
          lastMessagePreview: incoming.lastMessagePreview || nested[nested.length - 1]?.content?.slice(0, 80),
        });
        sessionIds.add(incoming.id);
        sessionCount++;
      } else if (existing && updatedAt > existing.updatedAt) {
        await this.upsertSession({
          ...existing,
          title,
          updatedAt,
          lastMessagePreview: incoming.lastMessagePreview || existing.lastMessagePreview,
        });
      }

      const existingMsgs = await this.getMessagesForSession(incoming.id);
      const seen = new Set(existingMsgs.map((m) => m.id));
      const contentKeys = new Set(existingMsgs.map((m) => `${m.timestamp}|${m.content}`));

      for (const msg of nested) {
        const id = msg.id || `msg_${incoming.id}_${msg.timestamp}_${Math.random().toString(36).slice(2, 7)}`;
        const contentKey = `${msg.timestamp}|${msg.content}`;
        if (seen.has(id) || contentKeys.has(contentKey)) continue;
        await this.upsertMessage({
          id,
          sessionId: incoming.id,
          role: msg.role || 'user',
          content: msg.content || '',
          timestamp: msg.timestamp || Date.now(),
          modelId: msg.modelId,
        });
        seen.add(id);
        contentKeys.add(contentKey);
        messageCount++;
      }
    }

    return { sessions: sessionCount, messages: messageCount };
  }

  async getMessagesForSession(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.db.getAll<any>(
      `SELECT id, session_id as sessionId, role, content, timestamp, tokens_per_second as tokensPerSecond, total_tokens as totalTokens, model_id as modelId
       FROM messages WHERE session_id = ? ORDER BY timestamp ASC`,
      [sessionId]
    );
    return rows;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.exec(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
    await this.db.exec(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
  }

  async clearAllHistory(): Promise<void> {
    await this.db.exec(`DELETE FROM messages`);
    await this.db.exec(`DELETE FROM sessions`);
  }
}
