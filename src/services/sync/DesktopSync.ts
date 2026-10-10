import { Platform, AppState } from 'react-native';
import { CompanionTransport, companionNative, connectionSessionId } from './CompanionTransport';
import { DesktopInstance, PairingSession, ProfileConflict, SyncStatus, UltronRemoteProfile } from '../../types/sync';
import { SecureStore } from '../storage/SecureStore';
import { isAccountResetting } from '../storage/AccountLifecycle';

const SYNC_PORT = 49200;
const TOKEN_KEY = 'ultron_desktop_sync_token';
const DESKTOP_KEY = 'ultron_desktop_sync_host';
const AUTO_CONNECT_KEY = 'ultron_auto_connect_wifi';
const LAST_IP_KEY = 'ultron_desktop_last_ip';
const HISTORY_KEY = 'ultron_desktop_paired_history';

export interface PairedDesktopHistoryItem {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  platform?: string;
  lastConnectedAt: number;
}

/**
 * A pairing host must be on the same local network as the phone. A scanned QR code is
 * attacker-supplied text, so without this gate one could point the phone at an internet host,
 * hand it the pairing code, and receive the sync token plus the desktop's Gemini key.
 */
export function isPrivateLanAddress(raw: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(raw || '').trim());
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 127) return true; // loopback, for adb reverse / same-machine testing
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT range
  return false;
}

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
  private transferRequestBusy = false;
  private transport = new CompanionTransport();
  private reconnectTask: Promise<'connected' | 'needs-code' | 'disabled' | 'skipped'> | null = null;
  private connectionGeneration = 0;
  private networkTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.restoreSession();
    AppState.addEventListener('change', state => { if (state === 'active') this.networkChanged(); });
    try { companionNative()?.addListener('networkChanged', () => this.networkChanged()); } catch {}
  }

  private networkChanged(): void {
    this.transport.reset();
    if (this.networkTimer) clearTimeout(this.networkTimer);
    this.networkTimer = setTimeout(() => { if (this.status.autoConnectEnabled && !isAccountResetting()) this.tryAutoConnect().catch(() => {}); }, 750);
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

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    return this.subscribe(listener);
  }

  private notify(): void {
    if (isAccountResetting()) return;
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
        this.startHealthLoop();
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
    await SecureStore.setItem(AUTO_CONNECT_KEY, enabled ? '1' : '0');
    this.status.autoConnectEnabled = enabled;
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

  private async fetchDiscover(host: string, timeoutMs = 700, port = SYNC_PORT): Promise<DesktopInstance | null> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${host}:${port}/discover`, {
        signal: controller?.signal as any,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.syncId) return null;
      return {
        id: data.syncId,
        name: data.name || 'Brown Desktop',
        ipAddress: host,
        port: data.port || port,
        version: data.version || '1.0.0',
        isPaired: false,
        lastSeen: Date.now(),
        syncId: data.syncId,
        companion: data.companion,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async scanNetwork(): Promise<DesktopInstance[]> {
    return this.scanLocalNetwork();
  }

  async scanLocalNetwork(): Promise<DesktopInstance[]> {
    const found: DesktopInstance[] = [];
    const seen = new Set<string>();
    const lastIp = await SecureStore.getItem(LAST_IP_KEY);
    let discoveryPort = this.status.activeDesktop?.port || SYNC_PORT;
    try { const saved = await SecureStore.getItem(DESKTOP_KEY); if (saved) discoveryPort = JSON.parse(saved).port || discoveryPort; } catch {}
    const hosts = lastIp ? [lastIp, ...this.probeCandidates()] : this.probeCandidates();
    try {
      const localAddresses: string[] = await companionNative()?.addresses() || [];
      for (const ip of localAddresses.filter(isPrivateLanAddress)) {
        const prefix = this.networkPrefix(ip);
        // Wi-Fi, phone-hosted hotspots and USB tethering each supply their own subnet.
        for (let host = 1; host < 255; host++) hosts.push(`${prefix}.${host}`);
      }
    } catch {}
    const candidates = [...new Set(hosts)];
    const probes: Array<DesktopInstance | null> = [];
    for (let offset = 0; offset < candidates.length; offset += 32) probes.push(...await Promise.all(candidates.slice(offset, offset + 32).map(host => this.fetchDiscover(host, 350, discoveryPort))));
    for (const device of probes) {
      if (device && !seen.has(device.id + device.ipAddress)) {
        seen.add(device.id + device.ipAddress);
        found.push(device);
      }
    }
    return found;
  }

  async connectBySyncId(syncId: string): Promise<DesktopInstance | null> {
    const needle = syncId.trim().toUpperCase();
    const devices = await this.scanLocalNetwork();
    return devices.find((d) => (d.syncId || d.id).toUpperCase() === needle) || null;
  }

  private async getMobileDeviceName(): Promise<string> {
    try {
      const profile = await this.profileService().getLocalProfile();
      if (profile && profile.displayName && profile.displayName.trim()) {
        return `${profile.displayName.trim()} (Brown Mobile)`;
      }
    } catch {}
    const isIos = Platform.OS === 'ios';
    return isIos ? 'iPhone (Brown Mobile)' : 'Android (Brown Mobile)';
  }

  async requestPairing(desktop: DesktopInstance): Promise<PairingSession> {
    const devName = await this.getMobileDeviceName();
    const clientPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    let res: Response;
    try {
      res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/pair/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: devName, platform: clientPlatform }),
      });
    } catch {
      throw new Error(
        `Could not reach ${desktop.name || 'the desktop'} at ${desktop.ipAddress}. Check both devices are on the same Wi-Fi and Brown Desktop is open.`
      );
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.requestId) {
      this.pairing = { requestId: data.requestId, desktop, expiresIn: data.expiresIn || 120 };
      return this.pairing;
    }
    throw new Error(data?.error || 'Desktop rejected the pairing request');
  }

  private async markPaired(desktop: DesktopInstance, token: string): Promise<void> {
    if (isAccountResetting()) return;
    const generation = this.connectionGeneration;
    const wasConnected = this.status.isConnected;
    if (desktop.companion) desktop = { ...desktop, companion: { ...desktop.companion, bootstrapKey: undefined, keyId: undefined } };
    await SecureStore.setItem(TOKEN_KEY, token);
    await SecureStore.setItem(DESKTOP_KEY, JSON.stringify(desktop));
    await SecureStore.setItem(LAST_IP_KEY, desktop.ipAddress);
    try {
      const histRaw = await SecureStore.getNonSecretItem(HISTORY_KEY);
      let history: PairedDesktopHistoryItem[] = histRaw ? JSON.parse(histRaw) : [];
      const id = desktop.id || desktop.syncId || desktop.ipAddress;
      history = history.filter((h) => h.id !== id && h.ipAddress !== desktop.ipAddress);
      history.unshift({
        id,
        name: desktop.name || 'Brown Desktop',
        ipAddress: desktop.ipAddress,
        port: desktop.port,
        platform: desktop.platform || 'windows',
        lastConnectedAt: Date.now(),
      });
      await SecureStore.setNonSecretItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
    } catch {}

    if (generation !== this.connectionGeneration || isAccountResetting()) return;
    this.status.isConnected = true;
    this.status.activeDesktop = desktop;
    this.status.authToken = token;
    this.status.syncInProgress = false;
    this.status.lastSyncTimestamp = Date.now();
    this.status.needsReauth = false;
    this.status.reauthReason = undefined;
    this.status.connectionType = this.transport.type || 'local';
    this.pairing = null;
    this.notify();
    this.startHealthLoop();
    // Pre-warm desktop Whisper so the first voice message isn't slow.
    if (!wasConnected) this.warmDesktopStt();
  }

  private healthTimer: ReturnType<typeof setInterval> | null = null;

  private startHealthLoop(): void {
    this.stopHealthLoop();
    this.healthTimer = setInterval(() => {
      this.healthCheck().catch(() => {});
    }, 15 * 1000);
  }

  private stopHealthLoop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async healthCheck(): Promise<void> {
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (!desktop || !token) return;
    if (this.status.isConnected) {
      try {
        const info = await this.authorizedJson('/session');
        this.status.preferences = info.preferences;
        this.status.transferRequest = info.transferRequest;
        this.notify();
        return;
      } catch {
        this.status.isConnected = false;
        this.notify();
      }
    }
    if (!this.status.autoConnectEnabled) return;
    await this.tryAutoConnect();
  }

  async getPairedHistory(): Promise<PairedDesktopHistoryItem[]> {
    try {
      const histRaw = await SecureStore.getNonSecretItem(HISTORY_KEY);
      return histRaw ? JSON.parse(histRaw) : [];
    } catch {
      return [];
    }
  }

  async clearPairedHistory(): Promise<void> {
    try {
      await SecureStore.deleteItem(HISTORY_KEY);
    } catch {}
  }

  async pairWithDesktop(desktop: DesktopInstance, pin: string): Promise<boolean> {
    const generation = this.connectionGeneration;
    if (pin.length < 6) {
      throw new Error('Enter the 6-character code shown on your PC');
    }
    if (!isPrivateLanAddress(desktop.ipAddress) && !desktop.companion?.bootstrapKey) {
      throw new Error('That desktop address is not on your local network. Pairing refused.');
    }

    this.status.syncInProgress = true;
    this.notify();

    const fail = (message: string): never => {
      this.status.syncInProgress = false;
      this.notify();
      throw new Error(message);
    };

    // Only reuse a pairing session started against this exact desktop.
    const requestId =
      this.pairing && this.pairing.desktop?.ipAddress === desktop.ipAddress
        ? this.pairing.requestId
        : undefined;
    const devName = await this.getMobileDeviceName();
    const clientPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    let res: Response;
    try {
      const init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, code: pin.trim().toUpperCase(), deviceName: devName, platform: clientPlatform }),
      };
      if (desktop.companion?.bootstrapKey) {
        await this.transport.select(desktop, desktop.companion.bootstrapKey, true);
        const result = await this.transport.request(desktop, desktop.companion.bootstrapKey, '/pair/verify', init, true);
        res = { ok: result.status >= 200 && result.status < 300, json: async () => result.body } as Response;
      } else res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/pair/verify`, init);
    } catch (error: any) {
      return fail(
        `Could not connect to ${desktop.name || 'the desktop'} at ${desktop.ipAddress}:${desktop.port}. ${error?.message || 'Connection failed'}. Keep Brown Desktop open on the same Wi-Fi, phone hotspot, or USB connection, and scan a fresh pairing QR.`
      );
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data?.token) {
      if (generation !== this.connectionGeneration || isAccountResetting()) return false;
      desktop = { ...desktop, companion: data.desktop?.companion || desktop.companion };
      this.transport.reset();
      if (desktop.companion?.v === 2) await this.transport.select(desktop, data.token);
      await this.markPaired(desktop, data.token);
      this.status.preferences = data.preferences;
      if (data.preferences?.profileMode !== 'separate' && (data.desktop?.geminiApiKey || data.profile?.geminiApiKey)) {
        await SecureStore.setItem(
          'gemini_api_key',
          data.profile?.geminiApiKey || data.desktop.geminiApiKey
        );
      } else if (data.preferences?.profileMode !== 'separate') {
        await this.inheritGeminiKey();
      }
      if (data.preferences?.profileMode !== 'separate') await this.detectProfileConflict(data.profile);
      this.status.syncedThreadsCount = 1;
      this.notify();
      return true;
    }
    return fail(data?.error || 'Pairing failed — generate a new code or QR on the PC');
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
    if (this.reconnectTask) return this.reconnectTask;
    const task = this.reconnect();
    this.reconnectTask = task;
    try { return await task; } finally { if (this.reconnectTask === task) this.reconnectTask = null; }
  }

  private async reconnect(): Promise<'connected' | 'needs-code' | 'disabled' | 'skipped'> {
    const generation = this.connectionGeneration;
    const enabled = await this.isAutoConnectEnabled();
    this.status.autoConnectEnabled = enabled;
    if (!enabled) return 'disabled';

    const token = await SecureStore.getItem(TOKEN_KEY);
    const raw = await SecureStore.getItem(DESKTOP_KEY);
    if (!token || !raw) return 'skipped';

    const saved = JSON.parse(raw) as DesktopInstance;
    if (saved.companion?.v === 2) {
      try {
        let info: any;
        try { info = await this.transport.select(saved, token); }
        catch {
          const discovered = (await this.scanLocalNetwork()).find(d => (d.syncId || d.id) === (saved.syncId || saved.id));
          if (!discovered) throw new Error('Desktop unreachable');
          saved.ipAddress = discovered.ipAddress; saved.port = discovered.port;
          info = await this.transport.select(saved, token);
        }
        if (generation !== this.connectionGeneration || isAccountResetting()) return 'skipped';
        if (info.disconnected) { this.status.isConnected = false; this.status.needsReauth = false; this.status.reauthReason = info.error; this.notify(); return 'skipped'; }
        saved.companion = info.companion || saved.companion;
        await this.markPaired(saved, token);
        this.status.preferences = info.preferences;
        this.status.transferRequest = info.transferRequest;
        this.notify();
        return 'connected';
      } catch (error: any) {
        if (generation !== this.connectionGeneration) return 'skipped';
        this.status.isConnected = false;
        this.status.needsReauth = false;
        this.status.reauthReason = error?.message || 'Waiting for desktop to reconnect';
        this.notify();
        return 'skipped';
      }
    }
    const lastIp = (await SecureStore.getItem(LAST_IP_KEY)) || saved.ipAddress;
    const devices = await this.scanLocalNetwork();
    const match =
      devices.find((d) => (d.syncId || d.id) === (saved.syncId || saved.id));

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
      if (generation !== this.connectionGeneration) return 'skipped';
      await this.markPaired(match, token);
      this.status.syncedThreadsCount = Math.max(this.status.syncedThreadsCount, 1);
      this.notify();
      return 'connected';
    }

    this.status.isConnected = false;
    this.status.activeDesktop = match;
    this.status.needsReauth = true;
    this.status.reauthReason = ipChanged
      ? 'Network or IP changed — confirm with the 6-character code on your PC'
      : session.reason || 'Session expired — confirm with the 6-character code on your PC';
    this.notify();
    return 'needs-code';
  }

  private async validateSession(
    desktop: DesktopInstance,
    token: string
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      if (desktop.companion?.v === 2) {
        const info = await this.transport.select(desktop, token);
        return { ok: info.syncId === (desktop.syncId || desktop.id) };
      }
      const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}/session`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Brown-Session': connectionSessionId },
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
    if (!desktop || !token) throw new Error('Not connected to Brown Desktop');
    if (desktop.companion?.v === 2) {
      const result = await this.transport.request(desktop, token, path, init);
      if (result.body?.disconnected) { this.status.isConnected = false; this.status.needsReauth = false; this.status.reauthReason = result.body.error; this.notify(); throw new Error(result.body.error); }
      if (result.status === 401) { this.status.isConnected = false; this.status.needsReauth = true; this.notify(); }
      if (result.status >= 400) throw new Error(result.body?.error || `Desktop returned ${result.status}`);
      return result.body;
    }
    const res = await fetch(`http://${desktop.ipAddress}:${desktop.port}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Brown-Session': connectionSessionId,
        ...(init?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (data?.disconnected) { this.status.isConnected = false; this.status.needsReauth = false; this.status.reauthReason = data.error; this.notify(); throw new Error(data.error); }
    if (res.status === 401) {
      this.status.isConnected = false;
      this.status.needsReauth = true;
      this.status.reauthReason = 'Session expired — confirm with the 6-character code on your PC';
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
      const data = await this.authorizedJson('/gemini-key');
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

  async setDevicePreferences(preferences: NonNullable<SyncStatus['preferences']>): Promise<void> {
    const result = await this.authorizedJson('/sync/preferences', { method: 'POST', body: JSON.stringify(preferences) });
    this.status.preferences = result.preferences;
    this.notify();
    if (preferences.profileMode === 'shared') {
      const profile = await this.fetchDesktopProfile();
      if (profile) await this.detectProfileConflict(profile);
    }
  }

  async completeTransferRequest(approved: boolean): Promise<void> {
    if (this.transferRequestBusy) return;
    const request = this.status.transferRequest;
    if (!request || request.expiresAt < Date.now()) return;
    this.transferRequestBusy = true;
    try {
    if (approved) {
      if (request.action === 'profile') await this.setDevicePreferences({ modelAccess: this.status.preferences?.modelAccess !== false, voiceAccess: this.status.preferences?.voiceAccess !== false, profileMode: 'shared' });
      if (request.action === 'send' || request.action === 'merge') await this.fetchDesktopChats();
      if (request.action === 'import' || request.action === 'merge') await this.exportPhoneChats();
    }
    await this.authorizedJson('/sync/ack', { method: 'POST', body: JSON.stringify({ id: request.id, success: approved }) });
    this.status.transferRequest = null;
    this.notify();
    } finally { this.transferRequestBusy = false; }
  }
  async publishChatPreview(snapshot: { visible: boolean; sessionId?: string | null; title?: string; model?: string; generating?: boolean; messages?: Array<{ id: string; role: string; content: string }> }): Promise<void> {
    if (!this.status.isConnected || !this.status.preferences?.livePreview) return;
    const messages = snapshot.messages?.slice(-60);
    if (messages) while (messages.length > 1 && JSON.stringify({ ...snapshot, messages }).length > 190000) messages.shift();
    await this.authorizedJson('/sync/activity', { method: 'POST', body: JSON.stringify({ ...snapshot, messages }) });
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
      const data = await this.authorizedJson('/ollama/tags');
      return Array.isArray(data?.models) ? data.models : [];
    } catch {
      return [];
    }
  }

  async chatOllama(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (!desktop || !token) {
      throw new Error('Pair with Brown Desktop to use models from your PC');
    }
    let data: any;
    try {
      data = await this.authorizedJson('/ollama/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model, messages }),
      });
    } catch (err: any) {
      throw new Error(`Could not connect to desktop (${desktop.ipAddress}): ${err?.message || 'Network error'}. Make sure Brown Desktop is open.`);
    }

    if (data?.error) {
      let rawError = data.error;
      if (/allocate|buffer|cuda|out of memory|vram|projector cpu offload/i.test(rawError)) {
        throw new Error(`PC Out of Memory: Your desktop ran out of GPU/RAM memory while loading "${model}". Try switching to a lighter model (like Llama 3.2 1B or 3B) or free up memory on your PC.`);
      }
      if (/not found|try pulling/i.test(rawError)) {
        throw new Error(`Model "${model}" is not installed in Ollama on your PC.`);
      }
      throw new Error(rawError);
    }

    const text = data?.message?.content || data?.response || '';
    if (!text) throw new Error('Desktop model returned an empty reply');
    return text;
  }

  async warmDesktopStt(): Promise<void> {
    try {
      await this.authorizedJson('/stt/warmup', { method: 'POST', body: '{}' });
    } catch {}
  }

  async getDesktopSttStatus(): Promise<{ ok: boolean; ready?: boolean; error?: string }> {
    try {
      return await this.authorizedJson('/stt/status');
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Desktop unreachable' };
    }
  }

  /** Upload a 16-bit PCM WAV (base64) and get Whisper's transcript from the PC. */
  async transcribeAudio(wavBase64: string): Promise<string> {
    const desktop = this.status.activeDesktop;
    if (!desktop || !this.status.authToken) {
      throw new Error('Pair with Brown Desktop to use voice input — Whisper runs on your PC.');
    }
    let data: any;
    try {
      data = await this.authorizedJson('/stt', {
        method: 'POST',
        body: JSON.stringify({ audio: wavBase64 }),
      });
    } catch (err: any) {
      if (/network request failed|could not connect/i.test(String(err?.message || ''))) {
        throw new Error(
          `Could not reach Brown Desktop (${desktop.ipAddress}). Open Brown Desktop and try again.`
        );
      }
      throw err;
    }
    if (!data?.ok) {
      throw new Error(data?.error || 'Desktop could not transcribe the recording');
    }
    return String(data.text || '');
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

  async refreshStatus(): Promise<SyncStatus> {
    if (this.status.activeDesktop && this.status.authToken) {
      await this.tryAutoConnect();
    } else {
      const token = await SecureStore.getItem(TOKEN_KEY);
      if (token) {
        await this.restoreSession();
      } else {
        this.status.isConnected = false;
        this.notify();
      }
    }
    return this.getStatus();
  }

  async disconnectSession(): Promise<void> {
    // The desktop retains a runtime block; health probes can reconnect after its restart.
    const result = await this.authorizedJson('/sync/disconnect', { method: 'POST' });
    if (!result.success) throw new Error(result.error || 'Could not disconnect');
    this.connectionGeneration++;
    this.status.isConnected = false;
    this.status.needsReauth = false;
    this.status.reauthReason = 'Disconnected for this session. Reopen either app to reconnect.';
    this.status.transferRequest = null;
    this.notify();
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++;
    if (this.networkTimer) clearTimeout(this.networkTimer);
    this.stopHealthLoop();
    await this.reconnectTask?.catch(() => {});
    const desktop = this.status.activeDesktop;
    const token = this.status.authToken;
    if (desktop && token) {
      try {
        this.authorizedJson('/pair/unpair', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      } catch {}
    }
    await SecureStore.deleteItem(TOKEN_KEY);
    await SecureStore.deleteItem(DESKTOP_KEY);
    this.stopHealthLoop();
    this.transport.reset();
    this.status.isConnected = false;
    this.status.activeDesktop = undefined;
    this.status.authToken = undefined;
    this.status.preferences = undefined;
    this.status.transferRequest = null;
    this.status.syncInProgress = false;
    this.status.needsReauth = false;
    this.status.reauthReason = undefined;
    this.notify();
  }

  stopForAccountDeletion(): void {
    this.connectionGeneration++;
    if (this.networkTimer) clearTimeout(this.networkTimer);
    this.transport.reset();
    this.stopHealthLoop();
    this.pairing = null;
    this.pendingConflict = null;
    this.status = { isConnected: false, syncInProgress: false, syncedThreadsCount: 0, autoConnectEnabled: false };
  }
}
