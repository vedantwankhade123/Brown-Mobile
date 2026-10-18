const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const slots = [], animations = [];
let cursor = 0, dirty = false, pending = [], reduced = false, dismissals = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; },
  useEffect(effect, deps) { const i = cursor++, old = slots[i];
    if (!old || deps.some((v, j) => v !== old.deps[j])) {
      slots[i] = { deps };
      pending.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); });
    }
  },
};
class Value {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
  interpolate(config) { return config; }
}
const native = { View: 'View', Modal: 'Modal', Animated: { Value, View: 'AnimatedView',
  timing: (value, options) => ({ value, options, stop() { this.stopped = true; } }),
}, Easing: { out: x => x, in: x => x, cubic: x => x, quad: x => x },
StyleSheet: { create: x => x } };
const env = { exports: {}, require: name => name === 'react' ? React : name === 'react-native' ? native :
  name.includes('useReducedMotion') ? { useReducedMotion: () => reduced } :
  { animateOnce: (animation, duration, done) => animations.push({ animation, duration, done }) } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/AnimatedModal.tsx'), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, env);
function render(visible, children = 'dialog') {
  let tree;
  do {
    dirty = false; cursor = 0;
    tree = env.exports.AnimatedModal({ visible, children, animationType: 'slide', onDismiss: () => dismissals++ });
    const effects = pending; pending = []; effects.forEach(run => run());
  } while (dirty);
  return tree;
}
assert.equal(render(false), null);
assert.equal(animations.length, 0);
render(true, 'rename form'); animations.at(-1).done();
let tree = render(false, null);
assert.equal(tree.children[0].children[0].children[0], 'rename form');
assert.equal(tree.children[0].children[0].props.pointerEvents, 'none');
const staleClose = animations.at(-1);
render(true, 'delete confirmation');
assert.equal(staleClose.animation.stopped, true);
staleClose.done();
assert.equal(dismissals, 0);
assert.ok(render(true));
animations.at(-1).done();
render(false); animations.at(-1).done();
assert.equal(render(false), null);
assert.equal(dismissals, 1);
reduced = true; render(true);
assert.equal(animations.at(-1).duration, 0);
console.log('PASS: modal exit retains content, disables touches, survives rapid reopening, and respects reduced motion');
