'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function harness() {
  let handlers, permission = async () => ({ granted: true });
  const state = { starts: 0, cancels: 0, removes: 0, timers: new Map() };
  const mocks = {
    'brown-recorder': { isRecorderAvailable: () => false, stopRecording: () => null },
    'brown-speech': {
      isSpeechSupported: () => true,
      startSpeech: () => { state.starts++; return true; },
      stopSpeech: () => {}, cancelSpeech: () => { state.cancels++; },
      subscribeSpeech: value => { handlers = value; return { remove: () => { state.removes++; } }; }
    },
    '../sync/DesktopSync': { DesktopSyncService: { getInstance: () => ({ getStatus: () => ({ isConnected: false }) }) } },
    'expo-file-system': {},
    'expo-av': { Audio: { requestPermissionsAsync: () => permission(), setAudioModeAsync: async () => {} } }
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/voice/SpeechToText.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', source)(name => mocks[name], module, module.exports,
    fn => { const id = state.timers.size + 1; state.timers.set(id, fn); return id; }, id => state.timers.delete(id));
  return { service: module.exports.SpeechToTextService, state, handlers: () => handlers, permission: fn => { permission = fn; } };
}
(async () => {
  const pending = harness();
  let allow;
  pending.permission(() => new Promise(resolve => { allow = resolve; }));
  const start = pending.service.startListening({});
  await new Promise(setImmediate);
  const duplicate = pending.service.startListening({});
  await pending.service.cancelListening();
  allow({ granted: true });
  await Promise.all([start, duplicate]);
  assert.equal(pending.state.starts, 0, 'late permission cannot start a cancelled microphone');

  const run = harness(), finals = [];
  await run.service.startListening({ onFinalResult: text => finals.push(text) });
  const events = run.handlers();
  events.onPartial('Do not lose the end of this sentence');
  const stop = run.service.stopListening();
  run.state.timers.values().next().value();
  assert.equal(await stop, 'Do not lose the end of this sentence');
  assert.equal(run.state.cancels, 1, 'timeout releases the real microphone');
  assert.equal(run.state.removes, 1);
  events.onFinal('late result');
  assert.deepEqual(finals, [], 'late results cannot insert text after timeout');
  await run.service.startListening({ onFinalResult: text => finals.push(text) });
  events.onFinal('stale previous session');
  assert.deepEqual(finals, [], 'previous session cannot affect a newly opened microphone');
  run.handlers().onFinal('Current sentence');
  assert.deepEqual(finals, ['Current sentence']);
  assert.equal(run.service.getIsListening(), false);
  assert.equal(run.state.removes, 2, 'natural final releases listeners too');
  console.log('PASS: microphone permission races, duplicate taps, stop timeout, partial preservation and stale-session rejection');
})().catch(err => { console.error(err); process.exitCode = 1; });
