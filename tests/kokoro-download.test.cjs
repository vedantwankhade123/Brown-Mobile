const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function setup(mode = 'ok') {
  const files = new Map();
  const attempts = [];
  let service;
  const assets = Object.fromEntries(['model', 'tokenizer'].map(id => [id, { fileName: id, url: id, minBytes: 10 }]));
  assets.voices = Object.fromEntries(['af_heart', 'am_michael', 'bm_george', 'bm_lewis'].map(id => [id, { fileName: id, url: id, minBytes: 10 }]));
  const mocks = {
    '@react-native-async-storage/async-storage': { getItem: async () => null },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active' } },
    '../storage/StoragePaths': { StoragePaths: { getModelsDir: async () => 'file:///models/', ensureDir: async () => {} } },
    './KokoroOnnxEngine': { KOKORO_HF_ASSETS: assets, resetKokoroOnnxSession: () => {} },
    'expo-keep-awake': {},
    'expo-file-system': {
      getInfoAsync: async uri => ({ exists: files.has(uri), size: files.get(uri) || 0 }),
      readAsStringAsync: async () => '[]',
      writeAsStringAsync: async (uri, data) => files.set(uri, data.length),
      deleteAsync: async uri => files.delete(uri),
      moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
      createDownloadResumable: (url, dest, options, progress) => ({
        downloadAsync: async () => {
          attempts.push(dest);
          files.set(dest, 20);
          progress({ totalBytesWritten: 20, totalBytesExpectedToWrite: 20 });
          if (mode === 'cancel') service.cancelKokoroDownload();
          return { status: mode === 'http-error' ? 404 : 200, headers: { 'Content-Length': '20' } };
        },
        pauseAsync: async () => {},
      }),
    },
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/voice/KokoroTtsService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (!(name in mocks)) throw new Error(`Unexpected import ${name}`);
    return mocks[name];
  }, module, module.exports);
  service = module.exports;
  return { service, files, attempts };
}

(async () => {
  const { service, attempts } = setup();
  const progress = [];
  assert.equal((await service.downloadKokoroOnboardingDefaults(p => progress.push(p))).success, true);
  assert.equal(attempts.length, 6);
  assert(attempts.every(uri => uri.endsWith('.part')));
  assert.equal((await service.getKokoroInstallStatus()).fullyInstalled, true);
  assert.equal(progress.at(-1).percent, 100);
  await service.downloadKokoroOnboardingDefaults();
  assert.equal(attempts.length, 6, 'Completed files must be reused');
  const staged = setup();
  assert.equal((await staged.service.downloadKokoroVoice('af_heart')).success, false);
  assert.equal(staged.attempts.length, 0, 'A voice cannot download before the engine');
  assert.equal((await staged.service.downloadKokoroEngine()).success, true);
  let status = await staged.service.getKokoroInstallStatus();
  assert.equal(status.engineInstalled, true);
  assert.equal(status.heartInstalled, false);
  assert.equal(status.fullyInstalled, false);
  assert.equal(staged.attempts.length, 2, 'Engine download includes only the engine and tokenizer');
  assert.equal((await staged.service.downloadKokoroVoice('am_michael')).success, true);
  status = await staged.service.getKokoroInstallStatus();
  assert.equal(status.michaelInstalled, true);
  assert.equal(status.heartInstalled, false);
  assert.equal(staged.service.isKokoroVoiceInstalled(status, 'am_michael'), true);
  assert.equal(staged.service.isKokoroVoiceInstalled(status, 'af_heart'), false);
  assert.equal(staged.attempts.length, 3, 'Only the requested voice is downloaded');
  const ttsSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/voice/TextToSpeech.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const ttsModule = { exports: {} };
  new Function('require', 'module', 'exports', ttsSource)(name => {
    if (name === './KokoroTtsService') return staged.service;
    if (name === './KokoroOnnxEngine') return {};
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    throw new Error(`Unexpected import ${name}`);
  }, ttsModule, ttsModule.exports);
  await ttsModule.exports.TextToSpeechService.ensureKokoroReady('am_michael');
  await assert.rejects(() => ttsModule.exports.TextToSpeechService.ensureKokoroReady('af_heart'), /not installed/);
  await staged.service.downloadKokoroVoice('am_michael');
  assert.equal(staged.attempts.length, 3, 'Installed individual voices are reused');
  const legacy = setup();
  legacy.files.set('file:///models/tts-cache/kokoro-engine/model', 9);
  assert.equal((await legacy.service.getKokoroInstallStatus()).fullyInstalled, false);
  assert.equal((await legacy.service.downloadKokoroOnboardingDefaults()).success, true);
  assert.equal(legacy.attempts.length, 6, 'An incomplete legacy file must be downloaded again');
  for (const mode of ['http-error', 'cancel']) {
    const run = setup(mode);
    const result = await run.service.downloadKokoroOnboardingDefaults();
    assert.equal(result.success, false);
    assert.equal(!!result.cancelled, mode === 'cancel');
    assert.equal((await run.service.getKokoroInstallStatus()).fullyInstalled, false);
    assert.equal(run.service.isKokoroDownloadInProgress(), false);
    assert.equal(run.files.size, 0, 'Failed/cancelled files must never be promoted');
  }
  console.log('PASS: Kokoro staged engine/voice downloads, independent voice status, completed-file reuse, progress, failure and cancellation cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
