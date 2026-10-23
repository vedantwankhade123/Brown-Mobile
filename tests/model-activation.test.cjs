const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

// Exercise the real activation callback against a delayed native boundary.
const source = ts.createSourceFile('ChatScreen.tsx', fs.readFileSync(path.join(__dirname, '../src/screens/ChatScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'activateModel') callback = node.initializer.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback);
const code = ts.transpileModule(`module.exports = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const modelActivation = { current: null }, loadedModelId = { current: null };
const loads = [], finish = [], alerts = [];
let selected, loading, active;
const engine = {
  loadModel: model => { loads.push(model.id); return new Promise(resolve => finish.push(ok => { active = ok ? model : null; resolve(ok); })); },
  getActiveModel: () => active,
  getLastNativeError: () => 'Invalid GGUF',
};
const moduleValue = { exports: {} };
new Function('module', 'modelActivation', 'loadedModelId', 'setActiveModel', 'saveSelectedModel', 'setIsModelLoading', 'engine', 'Alert', code)(
  moduleValue, modelActivation, loadedModelId, model => { selected = model; }, async () => {}, value => { loading = value; }, engine, { alert: (...args) => alerts.push(args) },
);
const activate = moduleValue.exports;
const tick = () => new Promise(setImmediate);
(async () => {
  const one = { id: 'one', provider: 'device' }, two = { id: 'two', provider: 'device' };
  const first = activate(one), duplicate = activate(one);
  await tick();
  assert.deepEqual(loads, ['one']);
  assert.equal(loading, true);
  finish.shift()(true);
  await Promise.all([first, duplicate]);
  assert.equal(loading, false);
  await activate(one);
  assert.deepEqual(loads, ['one'], 'already loaded model is reused');
  const second = activate(two), third = activate(one);
  await tick();
  assert.deepEqual(loads, ['one', 'two'], 'switches wait for the prior native initialization');
  finish.shift()(false);
  await tick();
  assert.equal(selected.id, 'one', 'stale failures cannot clear the latest selection');
  assert.equal(loading, true);
  assert.equal(alerts.length, 0, 'stale failures do not interrupt the latest model');
  assert.deepEqual(loads, ['one', 'two', 'one']);
  finish.shift()(true);
  await Promise.all([second, third]);
  const failed = activate(two);
  await tick();
  finish.shift()(false);
  await failed;
  assert.equal(selected, null);
  assert.equal(loading, false);
  assert.equal(alerts.length, 1, 'explicit loading failures remain visible');
  console.log('PASS: duplicate model loads coalesce, loaded contexts are reused, switches serialize, and stale failures do not disrupt chat');
})().catch(error => { console.error(error); process.exitCode = 1; });
