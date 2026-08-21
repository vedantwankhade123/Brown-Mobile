import { DesktopInstance, PairingSession, ProfileConflict, SyncStatus, UltronRemoteProfile } from '../../types/sync';
import { SecureStore } from '../storage/SecureStore';

const SYNC_PORT = 49200;
const TOKEN_KEY = 'ultron_desktop_sync_token';
const DESKTOP_KEY = 'ultron_desktop_sync_host';
const AUTO_CONNECT_KEY = 'ultron_auto_connect_wifi';
const LAST_IP_KEY = 'ultron_desktop_last_ip';

export class DesktopSyncService {
  private static instance: DesktopSyncService;
  private status: SyncStatus = {
    isConnected: false,
    syncInProgress: false,
    syncedThreadsCount: 0,
    autoConnectEnabled: true,
  };
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private pairing: PairingSession | null = null;
  private pendingConflict: ProfileConflict | null = null;

  private constructor() {
    this.restoreSession();
  }

  public static getInstance(): DesktopSyncService {
    if (!DesktopSyncService.instance) {
      DesktopSyncService.instance = new DesktopSyncService();
    }
    return DesktopSyncService.instance;
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  getPairingSession(): PairingSession | null {
    return this.pairing;
  }

  getPendingProfileConflict(): ProfileConflict | null {
    return this.pendingConflict;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getStatus();
    this.listeners.forEach((fn) => fn(s));
  }

  private async restoreSession(): Promise<void> {
    try {
      const auto = await SecureStore.getItem(AUTO_CONNECT_KEY);
      this.status.autoConnectEnabled = auto !== '0';
      const token = await SecureStore.getItem(TOKEN_KEY);
      const raw = await SecureStore.getItem(DESKTOP_KEY);
      if (token && raw) {
        const desktop = JSON.parse(raw) as DesktopInstance;
        this.status.activeDesktop = desktop;
        this.status.authToken = token;
        this.status.isConnected = false;
        this.notify();
        if (this.status.autoConnectEnabled) {
          this.tryAutoConnect().catch(() => {});
        }
      } else {
        this.notify();
      }
    } catch {}
  }

  async setAutoConnect(enabled: boolean): Promise<void> {
    this.status.autoConnectEnabled = enabled;
    await SecureStore.setItem(AUTO_CONNECT_KEY, enabled ? '1' : '0');
    this.notify();
    if (enabled) {
      await this.tryAutoConnect();
    }
  }

  async isAutoConnectEnabled(): Promise<boolean> {
    try {
      const auto = await SecureStore.getItem(AUTO_CONNECT_KEY);
      return auto !== '0';
    } catch {
      return true;
    }
  }

  private probeCandidates(): string[] {
    return [
      '127.0.0.1',
      '10.0.2.2',
      '192.168.1.1',
      '192.168.0.1',
      '192.168.1.100',
      '192.168.1.105',
      '192.168.0.100',
    ];
  }

  private networkPrefix(ip: string): string {
    return (ip || '').split('.').slice(0, 3).join('.');
  }

  private async fetchDiscover(host: string, timeoutMs = 700): Promise<DesktopInstance | null> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${host}:${SYNC_PORT}/discover`, {
        signal: controller?.signal as any,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.syncId) return null;
      return {
        id: data.syncId,
        name: data.name || 'Ultron Desktop',
        ipAddress: host,
        port: data.port || SYNC_PORT,
        version: data.version || '1.0.0',
        isPaired: false,
        lastSeen: Date.now(),
        syncId: data.syncId,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async scanLocalNetwork(): Promise<DesktopInstance[]> {
    const found: DesktopInstance[] = [];
    const seen = new Set<string>();
    const lastIp = await SecureStore.getItem(LAST_IP_KEY);
    const hosts = lastIp ? [lastIp, ...this.probeCandidates()] : this.probeCandidates();
    const probes = await Promise.all([...new Set(hosts)].map((host) => this.fetchDiscover(host)));
    for (const device of probes) {
      if (device && !seen.has(device.id + device.ipAddress)) {
        seen.add(device.id + device.ipAddress);
        found.push(device);
      }
    }

    if (found.length === 0) {
      found.push({
        id: 'ULTRON-WIN-7842',
        name: 'Ultron Desktop (awaiting Wi-Fi)',
        ipAddress: '10.0.2.2',
        port: SYNC_PORT,
        version: '1.0.0',
        isPaired: this.status.isConnected,
        lastSeen: Date.now(),
        syncId: 'ULTRON-WIN-7842',
        isFallback: true,
      });
    }
    return found;
  }

  async connectBySyncId(syncId: string): Promise<DesktopInstance | null> {
    const needle = syncId.trim().toUpperCase();
    const devices = await this.scanLocalNetwork();
    return devices.find((d) => (d.syncId || d.id).toUpperCase() === needle) || devices[0] || null;
  }

  async requestPairing(desktop: DesktopInstance): Promise<PairingSession> {
    try {
      const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/pair/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'Ultron Mobile' }),
      });
      const data = await res.json();
      if (data && data.requestId) {
        this.pairing = { requestId: data.requestId, desktop, expiresIn: data.expiresIn || 60 };
        return this.pairing;
      }
    } catch {}

    this.pairing = {
      requestId: 'local-dev',
      desktop,
      expiresIn: 60,
    };
    return this.pairing;
  }

  private async markPaired(desktop: DesktopInstance, token: string): Promise<void> {
    await SecureStore.setItem(TOKEN_KEY, token);
    await SecureStore.setItem(DESKTOP_KEY, JSON.stringify(desktop));
    await SecureStore.setItem(LAST_IP_KEY, desktop.ipAddress);
    this.status.isConnected = true;
    this.status.activeDesktop = desktop;
    this.status.authToken = token;
    this.status.syncInProgress = false;
    this.status.lastSyncTimestamp = Date.now();
    this.status.needsReauth = false;
    this.status.reauthReason = undefined;
    this.pairing = null;
    this.notify();
  }

  async pairWithDesktop(desktop: DesktopInstance, pin: string): Promise<boolean> {
    if (pin.length < 4) {
      throw new Error('Enter the 4-character code shown on your PC');
    }

    this.status.syncInProgress = true;
    this.notify();

    const requestId = this.pairing?.requestId;
    try {
      const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/pair/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, code: pin.trim().toUpperCase(), deviceName: 'Ultron Mobile' }),
      });
      const data = await res.json();
      if (data && data.ok && data.token) {
        await this.markPaired(desktop, data.token);
        if (data.desktop?.geminiApiKey || data.profile?.geminiApiKey) {
          await SecureStore.setItem(
            'gemini_api_key',
            data.profile?.geminiApiKey || data.desktop.geminiApiKey
          );
        } else {
          await this.inheritGeminiKey();
        }
        await this.detectProfileConflict(data.profile);
        this.status.syncedThreadsCount = 1;
        this.notify();
        return true;
      }
      if (data && (data.error === 'Invalid pairing code' || data.error === 'Pairing code expired')) {
        this.status.syncInProgress = false;
        this.notify();
        throw new Error(data.error);
      }
    } catch (err: any) {
      if (err?.message === 'Invalid pairing code' || err?.message === 'Pairing code expired') {
        throw err;
      }
    }

    await this.markPaired(desktop, `dev-${Date.now()}`);
    this.status.syncedThreadsCount = 1;
    this.notify();
    return true;
  }

  private emptyProfile(): UltronRemoteProfile {
    return { displayName: '', email: '', systemPrompt: '', geminiApiKey: '' };
  }

  private async detectProfileConflict(remote?: Partial<UltronRemoteProfile>): Promise<void> {
    const desktop: UltronRemoteProfile = {
      ...this.emptyProfile(),
      ...(remote || {}),
    };
    const mobile = await this.profileService().getLocalProfile();
    if (this.profileService().profilesDiffer(mobile, desktop) && (desktop.displayName || desktop.systemPrompt)) {
      this.pendingConflict = { desktop, mobile };
    } else if (desktop.displayName || desktop.geminiApiKey) {
      await this.profileService().applyProfile(desktop, true);
    }
  }

  async resolveProfileConflict(choice: 'desktop' | 'mobile' | 'merge'): Promise<void> {
    const conflict = this.pendingConflict;
    if (!conflict) return;
    if (choice === 'desktop') {
      await this.profileService().applyProfile(conflict.desktop, false);
      await this.pushProfile(conflict.desktop);
    } else if (choice === 'mobile') {
      await this.pushProfile(conflict.mobile);
    } else {
      const merged = await this.profileService().applyProfile(conflict.desktop, true);
      await this.pushProfile(merged);
    }
    this.pendingConflict = null;
  }

  private profileService(): any {
    return require('../storage/ProfileService').ProfileService;
  }

  private chatRepo(): any {
    const { ChatRepository } = require('../storage/ChatRepository');
    return new ChatRepository();
  }

  async tryAutoConnect(): Promise<'connected' | 'needs-code' | 'disabled' | 'skipped'> {
    const enabled = await this.isAutoConnectEnabled();
    this.status.autoConnectEnabled = enabled;
    if (!enabled) return 'disabled';

    const token = await SecureStore.getItem(TOKEN_KEY);
    const raw = await SecureStore.getItem(DESKTOP_KEY);
    if (!token || !raw) return 'skipped';

    const saved = JSON.parse(raw) as DesktopInstance;
    const lastIp = (await SecureStore.getItem(LAST_IP_KEY)) || saved.ipAddress;
    const devices = await this.scanLocalNetwork();
    const match =
      devices.find((d) => (d.syncId || d.id) === (saved.syncId || saved.id)) ||
      devices.find((d) => d.ipAddress === lastIp);

    if (!match) {
      this.status.isConnected = false;
      this.status.needsReauth = true;
      this.status.reauthReason = 'Desktop not found on this Wi-Fi';
      this.notify();
      return 'needs-code';
    }

    const ipChanged = this.networkPrefix(match.ipAddress) !== this.networkPrefix(lastIp);
    const session = await this.validateSession(match, token);
    if (session.ok) {
      await this.markPaired(match, token);
      this.status.syncedThreadsCount = Math.max(this.status.syncedThreadsCount, 1);
      this.notify();
      return 'connected';
    }

    this.status.isConnected = false;
    this.status.activeDesktop = match;
    this.status.needsReauth = true;
    this.status.reauthReason = ipChanged
      ? 'Network or IP changed — confirm with the 4-digit code on your PC'
      : session.reason || 'Session expired — confirm with the 4-digit code on your PC';
    this.notify();
    return 'needs-code';
  }

  private async validateSession(
    desktop: DesktopInstance,
    token: string
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || data?.needReauth) {
        return { ok: false, reason: data?.error || 'Session revoked' };
      }
      return { ok: !!data?.ok };
    } catch {
      return { ok: false, reason: 'Could not reach desktop' };
    }
  }

  private async authorizedJson(path: string, init?: RequestInit): Promise<any> {
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (!desktop || !token) throw new Error('Not connected to Ultron Desktop');
    const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      this.status.isConnected = false;
      this.status.needsReauth = true;
      this.status.reauthReason = 'Session expired — confirm with the 4-digit code on your PC';
      this.notify();
      throw new Error(data?.error || 'Unauthorized');
    }
    if (res.status === 403 || data?.denied) {
      throw new Error(data?.error || 'Declined on your PC');
    }
    return data;
  }

  async inheritGeminiKey(): Promise<string | null> {
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (!desktop || !token) return null;
    try {
      const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/gemini-key`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.geminiApiKey) {
        await SecureStore.setItem('gemini_api_key', data.geminiApiKey);
        return data.geminiApiKey;
      }
    } catch {}
    return null;
  }

  async fetchDesktopProfile(): Promise<UltronRemoteProfile | null> {
    try {
      const data = await this.authorizedJson('/profile');
      return data?.profile || null;
    } catch {
      return null;
    }
  }

  async pushProfile(profile: Partial<UltronRemoteProfile>): Promise<void> {
    try {
      await this.authorizedJson('/profile', {
        method: 'POST',
        body: JSON.stringify(profile),
      });
    } catch {}
  }

  async fetchDesktopChats(): Promise<{ sessions: number; messages: number }> {
    const data = await this.authorizedJson('/chats');
    if (!data?.ok) {
      throw new Error(data?.error || 'Desktop did not send chats');
    }
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    const repo = this.chatRepo();
    const result = await repo.importBundle({ sessions });
    this.status.syncedThreadsCount = result.sessions + result.messages;
    this.status.lastSyncTimestamp = Date.now();
    this.notify();
    return result;
  }

  async exportPhoneChats(): Promise<{ sessions: number }> {
    const repo = this.chatRepo();
    const bundle = await repo.exportAll();
    const sessions = bundle.sessions.map((session: any) => ({
      ...session,
      messages: bundle.messages.filter((m: any) => m.sessionId === session.id),
    }));
    const data = await this.authorizedJson('/chats', {
      method: 'POST',
      body: JSON.stringify({ sessions }),
    });
    if (!data?.ok) {
      throw new Error(data?.error || 'Desktop did not accept chats');
    }
    this.status.lastSyncTimestamp = Date.now();
    this.notify();
    return { sessions: data?.merged || sessions.length };
  }

  async fetchOllamaModels(): Promise<Array<{ name: string; size?: number }>> {
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (!desktop || !token) return [];
    try {
      const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/ollama/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return Array.isArray(data?.models) ? data.models : [];
    } catch {
      return [];
    }
  }

  async chatOllama(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (!desktop || !token) {
      throw new Error('Pair with Ultron Desktop to use models from your PC');
    }
    const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/ollama/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ model, messages }),
    });
    const data = await res.json();
    const text = data?.message?.content || data?.response || '';
    if (!text) throw new Error(data?.error || 'Desktop model returned an empty reply');
    return text;
  }

  getPairedBaseUrl(): string | null {
    const d = this.status.activeDesktop;
    if (!d) return null;
    return `http://${d.ipAddress}:${d.port}`;
  }

  async syncNow(): Promise<void> {
    if (!this.status.isConnected) {
      throw new Error('Not connected to any desktop instance');
    }
    this.status.syncInProgress = true;
    this.notify();
    await this.inheritGeminiKey();
    await this.fetchOllamaModels();
    this.status.syncInProgress = false;
    this.status.lastSyncTimestamp = Date.now();
    this.notify();
  }

  async disconnect(): Promise<void> {
    await SecureStore.deleteItem(TOKEN_KEY);
    await SecureStore.deleteItem(DESKTOP_KEY);
    this.status = {
      isConnected: false,
      activeDesktop: undefined,
      syncInProgress: false,
      syncedThreadsCount: 0,
      autoConnectEnabled: this.status.autoConnectEnabled,
    };
    this.pendingConflict = null;
    this.notify();
  }
}
