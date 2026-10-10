'use strict';
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const saved = { id: 'desktop-one', syncId: 'desktop-one', name: 'My PC', ipAddress: '192.168.43.2', port: 49200, companion: { v: 2 } };
const storage = new Map([['ultron_desktop_sync_token', 'a'.repeat(48)], ['ultron_desktop_sync_host', JSON.stringify(saved)]]);
const events = {}, state = { type: 'local', selections: 0, wait: null, paused: false };
class Transport {
  type = 'local';
  reset() {}
  async select() { state.selections++; if (state.wait) await state.wait; this.type = state.type; return { ok: true, syncId: saved.id, companion: saved.companion, disconnected: state.paused, error: state.paused ? "Disconnected for this session" : undefined }; }
  async request(_desktop, _secret, route) { if (route === '/sync/disconnect') state.paused = true; return { status: 200, body: { ok: true, success: true } }; }
}
const moduleObject = { exports: {} };
const presentationModule = { exports: {} };
const presentationCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/sync/connectionPresentation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(presentationCode, { module: presentationModule, exports: presentationModule.exports });
const presentation = presentationModule.exports.connectionPresentation;
assert.equal(presentation({isConnected:false}).heading, 'Connect your desktop');
assert.equal(presentation({isConnected:true,activeDesktop:saved}).heading, 'Desktop connected');
assert.equal(presentation({isConnected:false,activeDesktop:saved}).label, 'Paired · Offline');
assert.equal(presentation({isConnected:false,activeDesktop:saved,needsReauth:true}).heading, 'Reconnect your desktop');
assert.match(presentation({isConnected:false,activeDesktop:saved,autoConnectEnabled:false}).description, /Tap refresh/);
const source = fs.readFileSync(path.join(__dirname, '../src/services/sync/DesktopSync.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
vm.runInNewContext(code, {
  module: moduleObject, exports: moduleObject.exports, console, setTimeout, clearTimeout,
  setInterval: () => 1, clearInterval() {}, AbortController, fetch: async () => { throw Error('Unexpected legacy HTTP'); },
  require(name) {
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: { addEventListener: (_, callback) => { events.foreground = callback; } } };
    if (name.endsWith('CompanionTransport')) return { CompanionTransport: Transport, companionNative: () => ({ addListener: (_, callback) => { events.network = callback; } }) };
    if (name.endsWith('AccountLifecycle')) return { isAccountResetting: () => false };
    if (name.endsWith('SecureStore')) return { SecureStore: {
      getItem: async key => storage.get(key), getNonSecretItem: async key => storage.get(key),
      setItem: async (key, value) => storage.set(key, value), setNonSecretItem: async (key, value) => storage.set(key, value), deleteItem: async key => storage.delete(key)
    } };
    throw Error(name);
  }
});
(async () => {
  const service = moduleObject.exports.DesktopSyncService.getInstance();
  await new Promise(setImmediate);
  assert.equal(service.getStatus().isConnected, true, 'saved pairing restored');
  const before = state.selections;
  await Promise.all([service.tryAutoConnect(), service.tryAutoConnect(), service.tryAutoConnect()]);
  assert.equal(state.selections, before + 1, 'simultaneous reconnects share one operation');
  state.type = 'relay'; events.network(); events.network();
  await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(service.getStatus().connectionType, 'relay', 'network change switches route');
  assert.equal(storage.get('ultron_desktop_sync_token'), 'a'.repeat(48), 'pairing retained across network change');
  await service.disconnectSession();
  assert.equal(service.getStatus().isConnected, false);
  assert.equal(storage.has('ultron_desktop_sync_token'), true, 'session disconnect retains token');
  await service.tryAutoConnect();
  assert.equal(service.getStatus().isConnected, false, 'health reconnect respects session block');
  state.paused = false;
  await service.tryAutoConnect();
  assert.equal(service.getStatus().isConnected, true, 'desktop restart reconnects saved pairing');
  let finish;
  state.wait = new Promise(resolve => { finish = resolve; });
  const reconnect = service.tryAutoConnect();
  await new Promise(setImmediate);
  const disconnect = service.disconnect();
  finish(); await reconnect; await disconnect;
  assert.equal(service.getStatus().isConnected, false, 'late reconnect cannot resurrect disconnect');
  assert.equal(storage.has('ultron_desktop_sync_token'), false);
  service.stopForAccountDeletion();
  console.log('PASS: persistent pairing, coalesced reconnect, network switching, disconnect race');
})().catch(error => { console.error(error); process.exitCode = 1; });
