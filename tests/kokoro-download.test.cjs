const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function setup(mode = 'ok') {
  const files = new Map();
  const attempts = [];
  const urls = []; let cancels = 0, settleStalled, fakeTime = 0;
  let service;
  const assets = Object.fromEntries(['model', 'tokenizer'].map(id => [id, { fileName: id, url: id, minBytes: 10 }]));
  assets.voices = Object.fromEntries(['af_heart', 'am_michael', 'bm_george', 'bm_lewis'].map(id => [id, { fileName: id, url: id, minBytes: 10 }]));
  if (mode.startsWith('direct-')) for (const asset of [...Object.values(assets).filter(asset => asset.url), ...Object.values(assets.voices)]) asset.url = `https://huggingface.co/test/resolve/main/${asset.fileName}?download=true`;
  const mocks = {
    '@react-native-async-storage/async-storage': { getItem: async () => null },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active' } },
    '../storage/StoragePaths': { StoragePaths: { getModelsDir: async () => 'file:///models/', ensureDir: async () => {} } },
    './KokoroOnnxEngine': { KOKORO_HF_ASSETS: assets, resetKokoroOnnxSession: () => {} },
    'expo-keep-awake': {},
    '../modelManager/BackgroundDownload': {
      backgroundDownloadsAvailable: () => mode.startsWith('background-'),
      cancelBackgroundDownloadPrefix: async () => {},
      cancelBackgroundDownload: async () => {},
      enqueueBackgroundDownload: async () => {},
      receiveBackgroundDownload: async (key, dest, _minimum, _cancelled, progress) => {
        attempts.push(dest);
        if (mode === 'background-blocked') throw Error('Download stalled.');
        if (attempts.length === 1) throw Error('Download stalled for two minutes.');
        progress({ totalBytesWritten: 20, totalBytesExpectedToWrite: 0 });
        files.set(dest, 20);
        return { uri: dest, status: 200, headers: {} };
      },
      backgroundDownloadKeys: async () => [],
    },
    'expo-file-system': {
      getInfoAsync: async uri => ({ exists: files.has(uri), size: files.get(uri) || 0 }),
      readAsStringAsync: async () => '[]',
      writeAsStringAsync: async (uri, data) => files.set(uri, data.length),
      deleteAsync: async uri => files.delete(uri),
      moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
      createDownloadResumable: (url, dest, options, progress) => ({
        downloadAsync: async () => {
          attempts.push(dest); urls.push(url);
          if (mode === 'direct-stall' && attempts.length === 1) return new Promise(resolve => { settleStalled = resolve; });
          files.set(dest, 20);
          progress({ totalBytesWritten: 20, totalBytesExpectedToWrite: 20 });
          if (mode === 'cancel') service.cancelKokoroDownload();
          if (mode === 'cancel-other') await service.cancelKokoroDownload('am_michael');
          return { status: mode === 'http-error' ? 404 : mode === 'direct-http-retry' && attempts.length === 1 ? 403 : 200, headers: { 'Content-Length': '20' } };
        },
        cancelAsync: async () => { cancels++; settleStalled?.(undefined); },
        pauseAsync: async () => {},
      }),
    },
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/voice/KokoroTtsService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const simulated = mode.startsWith('direct-');
  class TestDate extends Date { static now() { return simulated ? fakeTime : Date.now(); } }
  new Function('require', 'module', 'exports', 'Date', 'setInterval', 'setTimeout', source)(name => {
    if (!(name in mocks)) throw new Error(`Unexpected import ${name}`);
    return mocks[name];
  }, module, module.exports, TestDate, simulated ? (fn => setInterval(() => { fakeTime += 31001; fn(); }, 5)) : setInterval, simulated ? ((fn, ms) => setTimeout(fn, Math.min(ms, 10))) : setTimeout);
  service = module.exports;
  return { service, files, attempts, urls, get cancels() { return cancels; } };
}

(async () => {
  const { service, attempts } = setup();
  const progress = [];
  assert.equal((await service.downloadKokoroOnboardingDefaults(p => progress.push(p))).success, true);
  assert.equal(attempts.length, 2);
  assert(attempts.every(uri => uri.endsWith('.part')));
  assert.equal((await service.getKokoroInstallStatus()).engineInstalled, true);
  assert.equal(progress.at(-1).percent, 100);
  assert.equal((await service.getKokoroInstallStatus()).heartInstalled, false, 'Compatibility engine install must not enqueue voices');
  await service.downloadKokoroOnboardingDefaults();
  assert.equal(attempts.length, 2, 'Completed files must be reused');
  for (const mode of ['direct-stall', 'direct-http-retry']) {
    const recovered = setup(mode), updates = [];
    assert.equal((await recovered.service.downloadKokoroEngine(p => updates.push(p))).success, true, mode);
    assert.equal(recovered.attempts.length, 3, 'Failed first engine transfer retries before tokenizer');
    assert(updates.some(p => p.status.includes('Retrying')), 'Recovery is visible');
    assert(recovered.urls.every(url => url.includes('brown_retry=')), 'Every direct request uses a fresh CDN redirect');
    assert.notEqual(recovered.urls[0], recovered.urls[1], 'A retry cannot reuse a stale signed redirect');
    if (mode === 'direct-stall') assert.equal(recovered.cancels, 1, 'Stalled writer stops before retry');
    assert.equal(recovered.service.isKokoroDownloadInProgress(), false);
    assert.equal((await recovered.service.getKokoroInstallStatus()).engineInstalled, true);
  }
  const voiceStall = setup('direct-stall');
  voiceStall.files.set('file:///models/tts-cache/kokoro-engine/model', 20);
  voiceStall.files.set('file:///models/tts-cache/kokoro-engine/tokenizer', 20);
  assert.equal((await voiceStall.service.downloadKokoroVoice('bm_george')).success, true, 'Individual voice recovers from direct-transfer stall');
  assert.equal(voiceStall.cancels, 1);
  assert.equal((await voiceStall.service.getKokoroInstallStatus()).georgeInstalled, true);
  assert.equal((await voiceStall.service.getKokoroInstallStatus()).heartInstalled, false);
  const staged = setup();
  const scopedCancel = setup('cancel-other');
  assert.equal((await scopedCancel.service.downloadKokoroEngine()).success, true, 'An unrelated row cannot cancel the active engine task');
  const recovered = setup('background-retry');
  const recoveryProgress = [];
  assert.equal((await recovered.service.downloadKokoroEngine(p => recoveryProgress.push(p))).success, true);
  assert.equal(recovered.attempts.length, 3, 'Stalled engine retries, then tokenizer finishes');
  assert(recoveryProgress.some(p => p.percent > 5 && p.phase === 'download'), 'Unknown content length still advances progress');
  assert.equal((await recovered.service.getKokoroInstallStatus()).engineInstalled, true);
  assert.equal((await recovered.service.getKokoroInstallStatus()).heartInstalled, false);
  const blocked = setup('background-blocked');
  const fallbackProgress = [];
  assert.equal((await blocked.service.downloadKokoroEngine(p => fallbackProgress.push(p))).success, true);
  assert(fallbackProgress.some(p => p.status.includes('Switching to direct download')), 'Repeated system stalls fall back to a different transfer path');
  assert.equal((await blocked.service.getKokoroInstallStatus()).engineInstalled, true);
  assert.equal((await blocked.service.getKokoroInstallStatus()).heartInstalled, false, 'Fallback must not download voices');
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
  assert.equal(legacy.attempts.length, 2, 'An incomplete legacy file must be downloaded again');
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
