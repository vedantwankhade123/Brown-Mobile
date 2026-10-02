const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const path = require('path');
const slots = []; let cursor = 0, dirty = false, pending = [];
const animations = [];
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useRef: (initial) => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
  useState: (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; },
  useEffect: (effect, deps) => { const i = cursor++; const old = slots[i];
    if (!old || deps.some((v, j) => v !== old.deps[j])) { slots[i] = { deps, cleanup: old?.cleanup }; pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); } },
};
class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate(config) { return { value: this, config }; } }
const native = { View: 'View', Animated: { Value, View: 'AnimatedView',
 timing: (value, options) => ({ value, options }),
 parallel: steps => ({ start(done) { animations.push({ steps, done, animation: this }); }, stop() { this.stopped = true; } }),
}, Easing: { out: v => v, quad: 'quad' }, StyleSheet: { create: v => v, absoluteFill: { position: 'absolute' } } };
const env = { exports: {}, require: name => name === 'react' ? React : name === 'react-native' ? native : name.includes('safe-area') ? { SafeAreaView: 'SafeArea' } : { animateOnce: (animation, duration, done) => animations.push({ animation, done }) } };
const source = fs.readFileSync(path.join(__dirname, '../src/components/ScreenTransition.tsx'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, env);
function render(screen) { let tree; do { dirty = false; cursor = 0; tree = env.exports.ScreenTransition({ screen, renderScreen: route => route + '-state' }); } while (dirty); const effects = pending; pending = []; effects.forEach(effect => effect()); return tree; }
function layers(tree) { return tree.children[0]; }
render('chat');
let tree = render('settings');
let views = layers(tree);
assert.equal(views[0].props.key, 'chat');
assert.equal(views[0].props.style[1].opacity.value, 1);
assert.equal(views[0].props.pointerEvents, 'none');
assert.equal(views[1].props.style[1].opacity.value, 0);
console.log('PASS: outgoing screen stays mounted as the destination starts to appear');
const stale = animations[0];
tree = render('modelStore');
assert.equal(stale.animation.stopped, true);
stale.done({ finished: true });
assert.equal(layers(tree)[2].props.style[1].opacity.value, 0);
console.log('PASS: rapid navigation stops stale animations and ignores their late callbacks');
animations[1].done({ finished: true });
tree = render('modelStore');
views = layers(tree);
assert.equal(views[2].props.style[1].opacity.value, 1);
assert.equal(views[2].props.pointerEvents, 'auto');
assert.equal(views[1].props.style[1].opacity.value, 0);
assert.equal(views[0].props.importantForAccessibility, 'no-hide-descendants');
render('chat');
assert.equal(layers(render('chat')).length, 3);
console.log('PASS: destination is interactive and returning screens retain their mounted state');
