export interface IDatabaseService {
  init(): Promise<void>;
  exec(sql: string, params?: any[]): Promise<any>;
  getAll<T>(sql: string, params?: any[]): Promise<T[]>;
  getFirst<T>(sql: string, params?: any[]): Promise<T | null>;
}

export class AppDatabase implements IDatabaseService {
  private static instance: AppDatabase;
  private db: any = null;
  private isInitialized = false;
  private memoryStore: { [table: string]: any[] } = {
    sessions: [],
    messages: [],
    settings: [],
    legal_consents: [],
  };

  private constructor() {}

  public static getInstance(): AppDatabase {
    if (!AppDatabase.instance) {
      AppDatabase.instance = new AppDatabase();
    }
    return AppDatabase.instance;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const { Platform } = require('react-native');
      if (Platform.OS !== 'web') {
        const SQLite = require('expo-sqlite');
        if (SQLite && (SQLite.openDatabaseSync || SQLite.openDatabaseAsync)) {
          this.db = SQLite.openDatabaseSync ? SQLite.openDatabaseSync('ultron.db') : await SQLite.openDatabaseAsync('ultron.db');
        }
      }
    } catch {
      // In-memory mock driver
      this.db = null;
    }

    await this.runMigrations();
    this.isInitialized = true;
  }

  private async runMigrations(): Promise<void> {
    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0,
        last_message_preview TEXT
      );
    `;

    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tokens_per_second REAL,
        total_tokens INTEGER,
        model_id TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `;

    const createConsentsTable = `
      CREATE TABLE IF NOT EXISTS legal_consents (
        id TEXT PRIMARY KEY,
        user_email TEXT,
        user_name TEXT,
        user_birthdate TEXT,
        terms_agreed INTEGER NOT NULL,
        privacy_agreed INTEGER NOT NULL,
        terms_version TEXT NOT NULL,
        privacy_version TEXT NOT NULL,
        agreed_at INTEGER NOT NULL,
        device_platform TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_consents_agreed ON legal_consents(agreed_at DESC);
    `;

    if (this.db) {
      try {
        if (this.db.execSync) {
          this.db.execSync(createSessionsTable);
          this.db.execSync(createMessagesTable);
          this.db.execSync(createConsentsTable);
          this.db.execSync(createIndexes);
        } else if (this.db.execAsync) {
          await this.db.execAsync(createSessionsTable);
          await this.db.execAsync(createMessagesTable);
          await this.db.execAsync(createConsentsTable);
          await this.db.execAsync(createIndexes);
        }
      } catch (err) {
        console.warn('SQLite migration error:', err);
      }
    }
  }

  async exec(sql: string, params: any[] = []): Promise<any> {
    if (!this.isInitialized) await this.init();

    if (this.db) {
      try {
        if (this.db.runSync) {
          return this.db.runSync(sql, params);
        } else if (this.db.runAsync) {
          return await this.db.runAsync(sql, params);
        }
      } catch (err) {
        console.warn('DB Exec error:', err);
      }
    }

    // In-memory fallback handler for unit tests / simulation
    return this.handleMemoryExec(sql, params);
  }

  async getAll<T>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.isInitialized) await this.init();

    if (this.db) {
      try {
        if (this.db.getAllSync) {
          return this.db.getAllSync(sql, params) as T[];
        } else if (this.db.getAllAsync) {
          return (await this.db.getAllAsync(sql, params)) as T[];
        }
      } catch (err) {
        console.warn('DB getAll error:', err);
      }
    }

    return this.handleMemoryQuery<T>(sql, params);
  }

  async getFirst<T>(sql: string, params: any[] = []): Promise<T | null> {
    const list = await this.getAll<T>(sql, params);
    return list.length > 0 ? list[0] : null;
  }

  private handleMemoryExec(sql: string, params: any[]): any {
    const lower = sql.toLowerCase();
    if (lower.includes('insert into sessions') || lower.includes('insert or replace into sessions')) {
      this.memoryStore.sessions = this.memoryStore.sessions.filter((s) => s.id !== params[0]);
      this.memoryStore.sessions.push({
        id: params[0],
        title: params[1],
        model_id: params[2],
        created_at: params[3],
        updated_at: params[4],
        message_count: params[5] || 0,
        last_message_preview: params[6] || '',
      });
    } else if (lower.includes('insert into messages') || lower.includes('insert or replace into messages')) {
      this.memoryStore.messages = this.memoryStore.messages.filter((m) => m.id !== params[0]);
      this.memoryStore.messages.push({
        id: params[0],
        session_id: params[1],
        role: params[2],
        content: params[3],
        timestamp: params[4],
        tokens_per_second: params[5],
        total_tokens: params[6],
        model_id: params[7],
      });
    } else if (lower.includes('into legal_consents')) {
      this.memoryStore.legal_consents.push({
        id: params[0],
        user_email: params[1],
        user_name: params[2],
        user_birthdate: params[3],
        terms_agreed: params[4],
        privacy_agreed: params[5],
        terms_version: params[6],
        privacy_version: params[7],
        agreed_at: params[8],
        device_platform: params[9],
        payload_json: params[10],
      });
    } else if (lower.includes('delete from messages where session_id =')) {
      this.memoryStore.messages = this.memoryStore.messages.filter((m) => m.session_id !== params[0]);
    } else if (lower.includes('delete from sessions where id =')) {
      this.memoryStore.sessions = this.memoryStore.sessions.filter((s) => s.id !== params[0]);
      this.memoryStore.messages = this.memoryStore.messages.filter((m) => m.session_id !== params[0]);
    } else if (lower.includes('delete from sessions')) {
      this.memoryStore.sessions = [];
    } else if (lower.includes('delete from messages')) {
      this.memoryStore.messages = [];
    }
    return { changes: 1 };
  }

  private handleMemoryQuery<T>(sql: string, params: any[]): T[] {
    const lower = sql.toLowerCase();
    if (lower.includes('from sessions')) {
      const rows = [...this.memoryStore.sessions]
        .sort((a, b) => b.updated_at - a.updated_at)
        .map((s) => ({
          ...s,
          modelId: s.model_id,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          messageCount: s.message_count,
          lastMessagePreview: s.last_message_preview,
        }));
      if (lower.includes('where id') && params[0]) {
        return rows.filter((s) => s.id === params[0]) as unknown as T[];
      }
      return rows as unknown as T[];
    }
    if (lower.includes('from messages')) {
      const rows = this.memoryStore.messages.map((m) => ({
        ...m,
        sessionId: m.session_id,
        tokensPerSecond: m.tokens_per_second,
        totalTokens: m.total_tokens,
        modelId: m.model_id,
      }));
      if (params.length > 0) {
        return rows
          .filter((m) => m.sessionId === params[0])
          .sort((a, b) => a.timestamp - b.timestamp) as unknown as T[];
      }
      return rows as unknown as T[];
    }
    if (lower.includes('from legal_consents')) {
      return [...this.memoryStore.legal_consents].sort((a, b) => b.agreed_at - a.agreed_at) as unknown as T[];
    }
    return [];
  }
}
