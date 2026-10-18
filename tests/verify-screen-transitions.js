const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const path = require('path');
const slots = [];
let cursor = 0, dirty = false, pending = [], reduced = false;
const animations = [];
const timers = new Set();
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useRef: initial => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
  useState: initial => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], next => {
      const value = typeof next === 'function' ? next(slots[i]) : next;
      if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; }
    }];
  },
  useEffect: (effect, deps) => {
    const i = cursor++, old = slots[i];
    if (!old || deps.some((v, j) => v !== old.deps[j])) {
      slots[i] = { deps, cleanup: old?.cleanup };
      pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    }
  },
};
class Value {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
}
const native = {
  View: 'View',
  Animated: {
    Value, View: 'AnimatedView',
    timing: (value, options) => ({ value, options, stop() { this.stopped = true; } }),
    parallel: steps => ({
      start(done) {
        this.done = done;
        animations.push({ steps, done, animation: this, starts: steps.map(step => step.value.value) });
      },
      stop() { this.stopped = true; this.done?.({ finished: false }); },
    }),
  },
  Easing: { out: v => v, quad: 'quad', cubic: 'cubic' },
  StyleSheet: { create: v => v, absoluteFill: { position: 'absolute' } },
};
const compile = source => ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const motion = {
  exports: {}, require: () => native, console,
  setTimeout: fn => { timers.add(fn); return fn; },
  clearTimeout: fn => timers.delete(fn),
};
vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, '../src/utils/motion.ts'), 'utf8')), motion);
const env = {
  exports: {},
  require: name => name === 'react' ? React : name === 'react-native' ? native
    : name.includes('useReducedMotion') ? { useReducedMotion: () => reduced }
    : name.includes('safe-area') ? { SafeAreaView: 'SafeArea' } : motion.exports,
};
vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, '../src/components/ScreenTransition.tsx'), 'utf8')), env);
function layers(tree) { return tree.children[0]; }
function layer(tree, route) { return layers(tree).find(view => view.props.key === route); }
function assertCoverage(tree) {
  let uncovered = 1;
  for (const view of layers(tree)) {
    const style = view.props.style[1];
    if (style.display !== 'none') uncovered *= 1 - style.opacity.value;
  }
  assert.equal(uncovered, 0, 'navigation must never reveal the empty root through every layer');
}
function render(screen) {
  let tree;
  do {
    do {
      dirty = false;
      cursor = 0;
      tree = env.exports.ScreenTransition({ screen, renderScreen: route => route + '-state' });
    } while (dirty);
    assertCoverage(tree);
    const effects = pending;
    pending = [];
    effects.forEach(effect => effect());
  } while (dirty);
  assertCoverage(tree);
  return tree;
}
function advance(animation, progress) {
  animation.steps.forEach((step, i) => step.value.setValue(
    animation.starts[i] + (step.options.toValue - animation.starts[i]) * progress
  ));
}
function assertSettled(tree, route) {
  for (const view of layers(tree)) {
    const active = view.props.key === route;
    assert.equal(view.props.style[1].opacity.value, active ? 1 : 0);
    assert.equal(view.props.style[1].display, active ? 'flex' : 'none');
    assert.equal(view.props.pointerEvents, active ? 'auto' : 'none');
    assert.equal(view.props.accessibilityElementsHidden, !active);
    assert.equal(view.props.importantForAccessibility, active ? 'auto' : 'no-hide-descendants');
  }
}
assertSettled(render('chat'), 'chat');
let tree = render('settings');
assert.equal(layer(tree, 'chat').props.pointerEvents, 'none');
assert.equal(layer(tree, 'settings').props.style[1].opacity.value, 0);
const first = animations.at(-1);
assert.equal(first.steps.length, 1);
for (const progress of [0.1, 0.5, 0.9]) {
  advance(first, progress);
  tree = render('settings');
  assert.equal(layer(tree, 'chat').props.style[1].opacity.value, 1);
}
console.log('PASS: incoming fade retains an opaque outgoing screen at every sampled frame');
tree = render('modelStore');
assert.equal(first.animation.stopped, true);
assert.equal(layer(tree, 'chat').props.style[1].display, 'flex');
assert.equal(layer(tree, 'settings').props.style[1].opacity.value, 0.9);
first.done({ finished: true });
assert.equal(layer(tree, 'modelStore').props.style[1].opacity.value, 0);
advance(animations.at(-1), 0.25);
tree = render('desktopSync');
assert.equal(layer(tree, 'chat').props.style[1].opacity.value, 1);
advance(animations.at(-1), 0.5);
tree = render('settings');
assert.equal(layers(tree).at(-1).props.key, 'settings');
assert.equal(layer(tree, 'settings').props.style[1].opacity.value, 0.9);
advance(animations.at(-1), 0.5);
assertCoverage(tree);
animations.at(-1).done({ finished: true });
assertSettled(render('settings'), 'settings');
console.log('PASS: repeated interruptions and returning routes retain coverage and ignore stale completions');
tree = render('chat');
assert.equal(layers(tree).length, 4);
assert.equal(layer(tree, 'chat').children[0].children[0], 'chat-state');
for (const finish of [...timers]) finish();
assertSettled(render('chat'), 'chat');
assert.equal(timers.size, 0);
console.log('PASS: lost animation completion settles via the real timeout helper without unmounting routes');
render('models');
const interrupted = animations.at(-1);
advance(interrupted, 0.3);
reduced = true;
assertSettled(render('models'), 'models');
assert.equal(interrupted.animation.stopped, true);
const count = animations.length;
assertSettled(render('settings'), 'settings');
assert.equal(animations.length, count);
console.log('PASS: reduced motion immediately settles both interrupted and subsequent navigation');
reduced = false;
render('settings');
animations.at(-1).done({ finished: true });
render('chat');
advance(animations.at(-1), 0.4);
tree = render('settings');
assert.equal(layer(tree, 'settings').props.style[1].opacity.value, 1);
assert.equal(layer(tree, 'chat').props.style[1].display, 'none');
animations.at(-1).done({ finished: true });
assertSettled(render('settings'), 'settings');
console.log('PASS: reversing to the settled base mid-transition stays fully visible');

const settingsSource = fs.readFileSync(path.join(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf8');
const settingsAst = ts.createSourceFile('SettingsScreen.tsx', settingsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = [];
let slideEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['handleSmoothBack', 'navigateToView'].includes(node.name.getText(settingsAst))) {
    handlers.push(`const ${node.getText(settingsAst)};`);
  }
  if (ts.isCallExpression(node) && node.expression.getText(settingsAst) === 'useLayoutEffect') {
    slideEffect = node.arguments[0].getText(settingsAst);
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(settingsAst) === 'Animated.View') {
    const style = node.attributes.properties.find(prop => prop.name?.getText(settingsAst) === 'style');
    assert.ok(!style?.getText(settingsAst).includes('opacity'), 'Settings page wrappers must stay opaque');
  }
  ts.forEachChild(node, visit);
}
visit(settingsAst);
assert.equal(handlers.length, 2);
assert.ok(slideEffect);
let backs = 0, syncOpens = 0;
const slides = [];
const settings = {
  exports: {}, viewHistory: ['main'], isActive: true, reducedMotion: false,
  screenSlideAnim: new Value(0), Animated: native.Animated, Easing: native.Easing,
  onBack: () => backs++, onOpenDesktopSync: () => syncOpens++,
  setViewHistory: update => { settings.viewHistory = update(settings.viewHistory); },
  animateOnce: (animation, duration, done) => slides.push({ animation, done }),
};
vm.runInNewContext(compile(`${handlers.join('\n')}\nexports.back = handleSmoothBack; exports.go = navigateToView; exports.slide = ${slideEffect};`), settings);
for (const route of ['models', 'help', 'privacy', 'terms', 'preferences']) {
  settings.exports.go(route);
  assert.equal(settings.viewHistory.at(-1), route);
  settings.exports.go(route);
  assert.equal(settings.viewHistory.length, 2);
  settings.exports.back();
  assert.equal(settings.viewHistory.join(','), 'main');
}
settings.exports.go('account');
settings.exports.go('edit_profile');
settings.exports.back();
assert.equal(settings.viewHistory.join(','), 'main,account');
settings.exports.back();
settings.exports.back();
assert.equal(backs, 1);
settings.exports.go('data_sync');
assert.equal(syncOpens, 1);
assert.equal(settings.viewHistory.join(','), 'main');
assert.equal(slides.length, 0);
console.log('PASS: Settings forward/back, nested pages, and app exits never wait for animation callbacks');
const cleanup = settings.exports.slide();
assert.equal(settings.screenSlideAnim.value, 8);
const oldSlide = slides.at(-1);
cleanup();
assert.equal(oldSlide.animation.stopped, true);
const cleanupNext = settings.exports.slide();
oldSlide.done();
assert.equal(settings.screenSlideAnim.value, 8);
slides.at(-1).done();
assert.equal(settings.screenSlideAnim.value, 0);
cleanupNext();
settings.reducedMotion = true;
const slideCount = slides.length;
settings.exports.slide();
assert.equal(slides.length, slideCount);
assert.equal(settings.screenSlideAnim.value, 0);
settings.reducedMotion = false;
settings.isActive = false;
settings.exports.slide();
assert.equal(slides.length, slideCount);
console.log('PASS: Settings uses cancellable translation only and respects inactive/reduced-motion state');
