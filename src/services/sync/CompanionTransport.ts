import { DesktopInstance } from '../../types/sync';

export type ConnectionType = 'local' | 'direct' | 'relay';
type Route = { type: ConnectionType; url: string };
// React Native's fallback Promise implementation does not provide Promise.any.
function firstSuccessful<T>(tasks: Array<Promise<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    let remaining = tasks.length;
    if (!remaining) { reject(new Error('No routes')); return; }
    tasks.forEach(task => task.then(resolve, error => { if (--remaining === 0) reject(error); }));
  });
}
let native: any;
export function companionNative(): any {
  if (!native) native = require('expo-modules-core').requireOptionalNativeModule('BrownCompanion');
  return native;
}
export function secureEndpoint(raw: string | undefined, relay = false): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const octets = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ? url.hostname.split('.').map(Number) : [];
    const local = url.hostname === 'localhost' || (octets.length === 4 && octets.every(n => n <= 255)
      && (octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)));
    if (url.username || url.password || url.search || url.hash) return null;
    if ((relay ? url.protocol === 'wss:' : url.protocol === 'https:') || (local && (relay ? url.protocol === 'ws:' : url.protocol === 'http:'))) return raw.replace(/\/$/, '');
  } catch {}
  return null;
}
export const connectionSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export class CompanionTransport {
  private route: Route | null = null;
  reset(): void { this.route = null; }
  get type(): ConnectionType | undefined { return this.route?.type; }
  async select(desktop: DesktopInstance, secret: string, bootstrap = false): Promise<any> {
    this.route = null;
    if (!companionNative()) throw new Error('Encrypted desktop access requires the updated Android app.');
    const addresses = [...new Set([desktop.ipAddress, ...(desktop.companion?.addresses || [])])];
    const local: Route[] = addresses.filter(ip => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip))
      .map(ip => ({ type: 'local', url: `http://${ip}:${desktop.port}` }));
    const direct: Route[] = addresses.filter(ip => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip))
      .map(ip => ({ type: 'direct', url: `http://${ip}:${desktop.port}` }));
    const directUrl = secureEndpoint(desktop.companion?.directUrl);
    if (directUrl) direct.push({ type: 'direct', url: directUrl });
    const relayUrl = secureEndpoint(desktop.companion?.relayUrl, true);
    const relay: Route[] = relayUrl && /^[a-f0-9]{64}$/.test(desktop.companion?.relayRoom || '') ? [{ type: 'relay', url: relayUrl }] : [];
    // Race within each tier, but finish local before trying remote access.
    for (const tier of [local, direct, relay]) {
      if (!tier.length) continue;
      try {
        const winner = await firstSuccessful(tier.map(async route => {
          const result = await this.exchange(desktop, secret, route, bootstrap ? '/discover' : '/session', { method: 'GET' }, 3500, bootstrap);
          if (!result.body?.ok || result.body.syncId !== (desktop.syncId || desktop.id)) throw new Error('Desktop identity mismatch');
          return { route, result };
        }));
        this.route = winner.route;
        return winner.result.body;
      } catch {}
    }
    throw new Error('Desktop is offline or unreachable. Keep Brown open; remote access also needs a configured direct address or running relay.');
  }
  async request(desktop: DesktopInstance, secret: string, path: string, init: RequestInit = {}, bootstrap = false): Promise<{ status: number; body: any }> {
    if (!this.route) await this.select(desktop, secret, bootstrap);
    try { return await this.exchange(desktop, secret, this.route!, path, init, 180000, bootstrap); }
    catch (error) { this.reset(); throw error; }
  }
  private async exchange(desktop: DesktopInstance, secret: string, route: Route, path: string, init: RequestInit, timeout: number, bootstrap: boolean): Promise<any> {
    const bridge = companionNative();
    const keyId = bootstrap ? desktop.companion?.keyId : await bridge.keyId(secret);
    if (!keyId) throw new Error('Missing pairing key');
    const envelope = JSON.parse(await bridge.seal(secret, keyId, JSON.stringify({ sessionId: connectionSessionId, ts: Date.now(), method: init.method || 'GET', path, body: init.body || '{}' })));
    let received: any;
    if (route.type === 'relay') {
      received = await new Promise((resolve, reject) => {
        const socket = new WebSocket(route.url);
        let settled = false;
        const timer = setTimeout(() => finish(new Error('Relay request timed out')), timeout);
        const finish = (error?: Error, value?: any) => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); error ? reject(error) : resolve(value); };
        socket.onopen = () => socket.send(JSON.stringify({ type: 'request', room: desktop.companion?.relayRoom, envelope }));
        socket.onmessage = event => { try { const message = JSON.parse(String(event.data)); if (message.type === 'response') finish(undefined, message.envelope); else finish(new Error('Desktop unavailable through relay')); } catch { finish(new Error('Invalid relay response')); } };
        socket.onerror = () => finish(new Error('Relay connection failed'));
        socket.onclose = () => finish(new Error('Relay connection interrupted'));
      });
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(`${route.url}/companion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Pairing revoked or expired' : 'Desktop unavailable');
        received = await response.json();
      } finally { clearTimeout(timer); }
    }
    return JSON.parse(await bridge.open(secret, keyId, envelope.id, JSON.stringify(received)));
  }
}
