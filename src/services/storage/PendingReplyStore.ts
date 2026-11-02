import AsyncStorage from '@react-native-async-storage/async-storage';

export type PendingReply = { id: string; requestId?: string; sessionId: string; prompt: string; content: string; modelId?: string; timestamp: number };
const KEY = '@brown_pending_reply_v1';
type Store = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

/** One inference slot, serialized durable checkpoints. Recovery never resubmits a request. */
export class PendingReplyStore {
  private queue: Promise<unknown> = Promise.resolve();
  private current: PendingReply | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private storage: Store = AsyncStorage) {}
  private write(value: PendingReply | null): Promise<void> {
    const job = this.queue.catch(() => {}).then(() => value ? this.storage.setItem(KEY, JSON.stringify(value)) : this.storage.removeItem(KEY));
    this.queue = job; return job;
  }
  async read(): Promise<PendingReply | null> {
    await this.queue.catch(() => {});
    const raw = await this.storage.getItem(KEY); if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!value || !['id','sessionId','prompt','content'].every(key => typeof value[key] === 'string') || !Number.isFinite(value.timestamp)) throw Error('Invalid pending reply');
      return value;
    } catch { await this.write(null); return null; }
  }
  begin(value: PendingReply): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.current = { ...value }; return this.write(this.current);
  }
  update(id: string, content: string): void {
    if (!this.current || (this.current.requestId||this.current.id) !== id) return;
    this.current = { ...this.current, content: content.slice(0,200000) };
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void this.flush().catch(() => {}); }, 1000);
  }
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    return this.current ? this.write({ ...this.current }) : this.queue.then(() => {});
  }
  finish(id: string): Promise<void> {
    if (this.current && (this.current.requestId||this.current.id) !== id) return Promise.resolve();
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.current = null; return this.write(null);
  }
}
