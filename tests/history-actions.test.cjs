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
const native = { Animated: { Value, View: 'AnimatedView' },
  StyleSheet: { create: v => v, absoluteFillObject: {} }, Dimensions: { get: () => ({ width: 411 }) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
};
const env = { exports: {}, require: name => {
  if (name === 'react') return React;
  if (name === 'react-native') return new Proxy(native, { get: (v, key) => v[key] || key });
  if (name.includes('safe-area')) return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
  if (name.includes('useReducedMotion')) return { useReducedMotion: () => false };
  if (name.includes('colors')) return { colors: {} };
  return new Proxy({}, { get: (_, key) => key });
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/DrawerSidebar.tsx'), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, env);
const store = [], deleted = [], renamed = [];
const props = { isOpen: true, sessions: [{ id: 'fixture', title: 'Test chat', updatedAt: 1 }], activeSessionId: null,
  onDeleteSession: id => deleted.push(id), onRenameSession: async (id, title) => renamed.push([id, title]),
  onClose() {}, onSelectSession() {}, onNewChat() {}, onOpenSync() {} };
function render(fn = env.exports.DrawerSidebar, input = props, state = store) { slots = state; cursor = 0; return fn(input); }
function nodes(root) { if (!root) return []; if (Array.isArray(root)) return root.flatMap(nodes);
  return typeof root === 'object' ? [root, ...nodes(root.children)] : []; }
function text(root) { if (typeof root === 'string') return root; if (Array.isArray(root)) return root.map(text).join(''); return root && typeof root === 'object' ? text(root.children) : ''; }
const row = nodes(render()).find(n => typeof n.type === 'function' && n.props.onRename);
const actions = nodes(render(row.type, row.props, [])).filter(n => n.props.accessibilityRole === 'button');
assert.equal(actions.length, 2);
assert.match(actions[0].props.accessibilityLabel, /^Rename chat:/);
assert.match(actions[1].props.accessibilityLabel, /^Delete chat:/);
actions[1].props.onPress();
assert.equal(deleted.length, 0);
const dialog = () => nodes(render()).find(n => n.type === 'AnimatedModal' && n.props.visible);
assert.match(text(dialog()), /Delete chat\?/);
nodes(dialog()).find(n => n.props.onPress && text(n) === 'Cancel').props.onPress();
assert.equal(deleted.length, 0);
actions[1].props.onPress();
nodes(dialog()).find(n => n.props.onPress && text(n) === 'Delete').props.onPress();
assert.deepEqual(deleted, ['fixture']);
actions[0].props.onPress();
assert.match(text(dialog()), /Rename chat/);
const input = nodes(dialog()).find(n => n.type === 'TextInput');
assert.equal(input.props.value, 'Test Chat');
input.props.onChangeText('Updated name');
nodes(dialog()).find(n => n.props.onPress && text(n) === 'Save').props.onPress().then(() => {
  assert.deepEqual(renamed, [['fixture', 'Updated name']]);
  console.log('PASS: direct rename/delete controls, cancel preserves chat, deletion requires confirmation, rename saves edited title');
}).catch(error => { console.error(error); process.exitCode = 1; });
