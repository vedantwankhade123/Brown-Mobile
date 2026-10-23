const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let slots, cursor;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    const store = slots; return [store[i], next => { store[i] = typeof next === 'function' ? next(store[i]) : next; }]; },
  useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
  useEffect() {},
};
class Value { setValue() {} interpolate() { return 1; } }
const gestures = [];
const animation = { start: done => done?.(), stop() {} };
const native = { Animated: { Value, View: 'AnimatedView', timing: () => animation, spring: () => animation, parallel: () => animation },
  StyleSheet: { create: v => v, absoluteFillObject: {} }, Dimensions: { get: () => ({ width: 411 }) },
  PanResponder: { create: handlers => { gestures.push(handlers); return { panHandlers: {} }; } },
};
const env = { exports: {}, require: name => {
  if (name === 'react') return React;
  if (name === 'react-native') return new Proxy(native, { get: (v, key) => v[key] || key });
  if (name.includes('safe-area')) return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
  if (name.includes('useReducedMotion')) return { useReducedMotion: () => false };
  if (name.includes('backStack')) return { useBackLayer() {} };
  if (name.includes('colors')) return { colors: {} };
  return new Proxy({}, { get: (_, key) => key });
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/DrawerSidebar.tsx'), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, env);
const store = [], deleted = [], renamed = [], selected = [], opened = [];
const props = { isOpen: true, sessions: [{ id: 'fixture', title: 'Test chat', updatedAt: 1 }], activeSessionId: null,
  onDeleteSession: id => deleted.push(id), onRenameSession: async (id, title) => renamed.push([id, title]),
  onClose() {}, onSelectSession: id => selected.push(id), onNewChat() {}, onOpenSync() {}, onOpenDownloads: () => opened.push('downloads') };
function render(fn = env.exports.DrawerSidebar, input = props, state = store) { slots = state; cursor = 0; return fn(input); }
function nodes(root) { if (!root) return []; if (Array.isArray(root)) return root.flatMap(nodes);
  return typeof root === 'object' ? [root, ...nodes(root.children)] : []; }
function text(root) { if (typeof root === 'string') return root; if (Array.isArray(root)) return root.map(text).join(''); return root && typeof root === 'object' ? text(root.children) : ''; }
const getRow = () => nodes(render()).find(n => typeof n.type === 'function' && n.props.onShowActions);
const rowState = [];
const rowTree = () => { const row = getRow(); return render(row.type, row.props, rowState); };
const actionButtons = () => nodes(rowTree()).filter(n => n.props.accessibilityRole === 'button');
const dialog = () => nodes(render()).find(n => n.type === 'AnimatedModal' && n.props.visible);
assert.equal(actionButtons().length, 0, 'row has no inline action buttons');
nodes(rowTree()).find(n => n.props.onLongPress).props.onLongPress();
assert.equal(selected.length, 0, 'long-press reveals controls without opening the chat');
assert.match(text(dialog()), /Chat options/);
let actions = nodes(dialog()).filter(n => n.props.accessibilityRole === 'button');
assert.equal(actions.length, 2);
assert.match(actions[0].props.accessibilityLabel, /^Rename chat:/);
assert.match(actions[1].props.accessibilityLabel, /^Delete chat:/);
nodes(dialog()).find(n => n.props.accessibilityLabel === 'Close chat options' && n.type === 'BrownButton').props.onPress();
assert.equal(dialog(), undefined, 'cross dismisses the options modal');
assert.equal(actionButtons().length, 0, 'row remains free of inline controls');
nodes(rowTree()).find(n => n.props.onLongPress).props.onLongPress();
actions = nodes(dialog()).filter(n => n.props.accessibilityRole === 'button');
actions[1].props.onPress();
assert.equal(deleted.length, 0);
assert.match(text(dialog()), /Delete chat\?/);
nodes(dialog()).find(n => n.props.onPress && text(n) === 'Cancel').props.onPress();
assert.equal(deleted.length, 0);
// The swipe path uses the same confirmation, independently of long-press actions.
const swipe = gestures[gestures.length - 1];
assert.equal(swipe.onMoveShouldSetPanResponder(null, { dx: -80, dy: 3 }), true);
assert.equal(swipe.onMoveShouldSetPanResponder(null, { dx: 3, dy: 80 }), false, 'vertical scrolling is not captured');
swipe.onPanResponderRelease(null, { dx: -80, dy: 3 });
const destructive = nodes(dialog()).find(n => n.props.onPress && text(n) === 'Delete chat');
assert.equal(destructive.props.brownSurface, undefined, 'delete keeps its solid red surface instead of the shared gray gradient');
assert.equal(destructive.props.style.backgroundColor, '#dc2626');
destructive.props.onPress();
assert.deepEqual(deleted, ['fixture']);
nodes(rowTree()).find(n => n.props.onLongPress).props.onLongPress();
actions = nodes(dialog()).filter(n => n.props.accessibilityRole === 'button');
actions[0].props.onPress();
assert.match(text(dialog()), /Rename chat/);
const input = nodes(dialog()).find(n => n.type === 'TextInput');
assert.equal(input.props.value, 'Test Chat');
input.props.onChangeText('Updated name');
nodes(dialog()).find(n => n.props.onPress && text(n) === 'Save').props.onPress().then(() => {
  assert.deepEqual(renamed, [['fixture', 'Updated name']]);
  const header = nodes(render()).find(n => n.type === 'AnimatedSearchSwap').props.collapsed;
  const downloads = nodes(header).filter(n => n.props.accessibilityLabel === 'Downloads');
  assert.equal(downloads.length, 1, 'Downloads appears only once');
  assert.equal(downloads[0].type, 'GlassControl', 'Downloads uses the header control');
  downloads[0].props.onPress();
  assert.deepEqual(opened, ['downloads']);
  const title = nodes(header).find(n => n.type === 'HeaderTitle');
  assert.equal(title.props.title, 'History', 'History uses the shared gradient header title');
  console.log('PASS: long-press options modal, dismiss/cancel preservation, swipe confirmation, solid red deletion, rename saving and Downloads header control');
}).catch(error => { console.error(error); process.exitCode = 1; });
