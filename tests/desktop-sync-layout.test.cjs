const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const options = { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true };
const source = fs.readFileSync(path.join(__dirname, '../src/screens/DesktopSyncScreen.tsx'), 'utf8');
const presentation = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/sync/connectionPresentation.ts'), 'utf8'), { compilerOptions: options }).outputText, presentation);
let slots, cursor;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    const store = slots; return [store[i], next => { store[i] = typeof next === 'function' ? next(store[i]) : next; }]; },
  useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
  useEffect() {},
};
class Value { setValue() {} interpolate() { return 1; } }
const native = new Proxy({ Animated: { Value, View: 'AnimatedView' }, StyleSheet: { create: v => v, absoluteFill: {} },
  Dimensions: { get: () => ({ width: 411 }) }, Platform: { OS: 'android' }, Alert: { alert() {} },
}, { get: (v, key) => v[key] || key });
const requests = [];
const service = { requestPairing: async device => { requests.push(device.id); } };
const env = { exports: {}, setTimeout: () => 0, clearTimeout() {}, require: name => {
  if (name === 'react') return React;
  if (name === 'react-native') return native;
  if (name.includes('safe-area')) return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
  if (name.includes('ScreenHeader')) return { ScreenHeader: 'ScreenHeader', useStickyHeader: () => ({ scrolled: false }) };
  if (name.includes('connectionPresentation')) return presentation.exports;
  if (name.endsWith('/DesktopSync')) return { DesktopSyncService: { getInstance: () => service } };
  return new Proxy({}, { get: (_, key) => key });
} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: options }).outputText, env);
const base = { isConnected: false, syncInProgress: false, syncedThreadsCount: 0 };
function scenario(status = base, history = []) {
  const state = [status, [], history];
  return () => { slots = state; cursor = 0; return env.exports.DesktopSyncScreen({ onBack() {}, isActive: true }); };
}
function nodes(root) {
  if (!root) return []; if (Array.isArray(root)) return root.flatMap(nodes);
  if (typeof root !== 'object') return [];
  if (root.type === 'AnimatedModal' && !root.props.visible) return [root];
  return [root, ...nodes(root.children)];
}
function text(root) { if (typeof root === 'string') return root; if (Array.isArray(root)) return root.map(text).join('');
  return root && typeof root === 'object' && !(root.type === 'AnimatedModal' && !root.props.visible) ? text(root.children) : ''; }
function control(root, label) { return nodes(root).find(n => n.props.accessibilityLabel === label); }
(async () => {
  const render = scenario(); let tree = render();
  const order = text(tree);
  assert.equal(order.includes('Brown for Windows'), false);
  assert.ok(order.indexOf('Scan QR code') < order.indexOf('Unpaired'));
  assert.ok(order.indexOf('Connect to PC') < order.indexOf('Nearby on Wi-Fi'));
  control(tree, 'Scan desktop QR code').props.onPress();
  assert.equal(nodes(render()).find(n => n.type === 'QRScannerModal').props.visible, true);
  nodes(render()).find(n => n.type === 'QRScannerModal').props.onClose();
  control(render(), 'Connect to PC').props.onPress();
  tree = render();
  assert.ok(control(tree, 'Desktop Sync ID'));
  control(tree, 'Cancel connecting to PC').props.onPress();
  assert.equal(control(render(), 'Desktop Sync ID'), undefined);
  control(render(), 'Pairing help').props.onPress();
  assert.ok(text(render()).includes('enable mobile access'));
  control(render(), 'Close pairing help').props.onPress();
  assert.equal(text(render()).includes('enable mobile access'), false);

  const pc = { id: 'BROWN-WIN-1234', name: 'Test PC', ipAddress: '192.168.1.2', lastConnectedAt: 1 };
  const offline = scenario({ ...base, activeDesktop: pc }, [pc]);
  tree = offline();
  assert.ok(text(tree).indexOf('SAVED PCS') < text(tree).indexOf('WORKSTATION'));
  assert.equal(text(tree).includes('Chat sharing'), false);
  const saved = nodes(tree).find(n => n.props.onPress && text(n) === 'Connect');
  saved.props.onPress(); await new Promise(setImmediate);
  assert.deepEqual(requests, ['BROWN-WIN-1234']);
  assert.ok(text(offline()).includes('Verify & pair'));
  assert.equal(control(offline(), 'Connect to PC'), undefined);

  const connected = scenario({ ...base, isConnected: true, activeDesktop: pc });
  tree = connected();
  assert.equal(control(tree, 'Scan desktop QR code'), undefined);
  assert.ok(text(tree).indexOf('Chat sharing') < text(tree).indexOf('Desktop access'));
  assert.ok(nodes(tree).some(n => n.props.onPress && text(n) === 'Refresh'));
  console.log('PASS: sync actions come first, QR/ID/help open and close, saved PCs precede discovery, saved-PC pairing remains functional, connected sharing controls remain available');
})().catch(error => { console.error(error); process.exitCode = 1; });
