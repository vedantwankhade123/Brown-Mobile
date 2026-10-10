'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)(name => {
    if (!(name in mocks)) throw Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
const tick = () => new Promise(setImmediate);

async function testSystemObservation() {
  const files = new Map([['file:///native/model', 100]]);
  let queries = 0, removals = 0;
  const native = {
    start: async () => {}, keys: async () => ['gguf:one', 'kokoro:two'],
    cancel: async () => { removals++; },
    status: async () => ++queries === 1 ? { status: 'waiting', bytes: 20, total: 100 } : { status: 'complete', bytes: 100, total: 100, uri: 'file:///native/model' }
  };
  const fileSystem = {
    getInfoAsync: async uri => ({ exists: files.has(uri), size: files.get(uri) }),
    deleteAsync: async uri => files.delete(uri),
    copyAsync: async ({ from, to }) => files.set(to, files.get(from)),
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); }
  };
  const service = load('modelManager/BackgroundDownload.ts', {
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'background' } },
    'expo-modules-core': { requireOptionalNativeModule: () => native },
    'expo-file-system': fileSystem
  }, { setTimeout: fn => setImmediate(fn) });
  await service.enqueueBackgroundDownload('gguf:one', 'https://example.com/model', 'Model');
  const seen = [];
  const result = await service.receiveBackgroundDownload('gguf:one', 'file:///models/one', 50, () => false, p => seen.push(p));
  assert.equal(result.status, 200);
  assert.equal(files.get(result.uri), 100);
  assert.equal(seen.length, 2, 'system waiting state remains recoverable while screen is off');
  assert.equal(removals, 1, 'staging download removed after successful publication');
  assert.equal(files.has('file:///models/one.background-part'), false);
  let cancelled = false;
  fileSystem.copyAsync = async ({ to }) => { files.set(to, 100); cancelled = true; };
  await assert.rejects(service.receiveBackgroundDownload('gguf:one', 'file:///models/cancelled', 50, () => cancelled, () => {}), /cancelled/);
  assert.equal(files.has('file:///models/cancelled'), false, 'cancel during copy cannot publish a model');
  assert.equal(files.has('file:///models/cancelled.background-part'), false);
  native.status = async () => ({ status: 'complete', bytes: 10, total: 100, uri: 'file:///native/model' });
  files.set('file:///native/model', 10);
  await assert.rejects(service.receiveBackgroundDownload('gguf:one', 'file:///models/short', 50, () => false, () => {}), /incomplete/);
  assert.equal(files.has('file:///models/short'), false);
  files.set('file:///native/model', 100);
  native.status = async () => ({ status: 'complete', bytes: 100, total: 100, uri: 'file:///native/model' });
  fileSystem.EncodingType = { Base64: 'base64' };
  fileSystem.readAsStringAsync = async () => 'PGh0bWw+';
  await assert.rejects(service.receiveBackgroundDownload('gguf:one', 'file:///models/invalid.gguf', 50, () => false, () => {}), /not a GGUF/);
  assert.equal(files.has('file:///models/invalid.gguf'), false);
}

async function testCancellationRace(stagedBytes = 0) {
  const files = new Map(), storage = new Map();
  let downloads = 0, stopped = false, finishTransfer, progress;
  const model = { id: 'one', name: 'One', filename: 'one.gguf', sizeBytes: 1024 * 1024, downloadUrl: 'https://example.com/one.gguf' };
  const fileSystem = {
    createDownloadResumable() { throw Error('Android must not use a foreground JS transfer'); },
    getInfoAsync: async uri => ({ exists: files.has(uri), size: files.get(uri) || 0 }),
    deleteAsync: async uri => { assert.ok(stopped, 'stop socket before deleting partial'); files.delete(uri); }
  };
  const { ModelDownloader } = load('modelManager/Downloader.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) || null,
      setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key)
    },
    '../storage/AccountLifecycle': { isAccountResetting: () => false },
    'react-native': { AppState: { currentState: 'active' } },
    './StorageBudget': { StorageBudgetService: { getDeviceStorageStats: async () => ({ freeStorageBytes: stagedBytes ? 51.5 * 1024 ** 2 : 1024 ** 3 }) } },
    '../storage/StoragePaths': { StoragePaths: { ensureLayout: async () => {}, ensureDir: async () => {}, getModelsDir: async () => 'file:///models/' } },
    './ModelCatalog': { CURATED_MODELS: [model], MOBILE_GGUF_LIBRARY: [model], getModelById: () => model },
    '../NotificationService': { alertDownloadComplete() { throw Error('cancelled transfer completed'); }, alertModelFailed() {} },
    'expo-keep-awake': {}, 'expo-file-system': fileSystem,
    './BackgroundDownload': {
      backgroundDownloadsAvailable: () => true, backgroundDownloadBytes: async () => stagedBytes, hasBackgroundDownload: async () => false,
      enqueueBackgroundDownload: async () => { downloads++; files.set('file:///models/one.gguf', 20); },
      receiveBackgroundDownload: async (key, dest, min, cancelled, callback) => {
        progress = callback;
        await new Promise(resolve => { finishTransfer = resolve; });
        // Simulate an in-flight writer settling after the user cancels.
        files.set(dest, 100);
        progress({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
        if (cancelled()) throw Error('cancelled');
      },
      cancelBackgroundDownload: async () => { stopped = true; finishTransfer?.(); },
      cancelBackgroundDownloadPrefix: async () => {}
    }
  });
  const downloader = ModelDownloader.getInstance();
  await downloader.whenReady();
  const first = downloader.startDownload(model);
  const second = downloader.startDownload(model);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(downloads, 1, 'double taps do not create duplicate transfers');
  await downloader.cancelDownload(model.id);
  await Promise.all([first, second]);
  assert.equal(files.size, 0, 'wait for writer, then delete all partial files');
  assert.equal(downloader.getState(model.id).status, 'idle');
  progress({ totalBytesWritten: 500, totalBytesExpectedToWrite: 1000 });
  assert.equal(downloader.getState(model.id).status, 'idle', 'late native progress cannot resurrect a cancelled row');
  assert.deepEqual(JSON.parse(storage.get('@ultron_downloaded_models_v2')), []);
  assert.deepEqual(JSON.parse(storage.get('@brown_paused_download_models')), []);
}

(async () => {
  await testSystemObservation();
  await testCancellationRace();
  await testCancellationRace(1024 * 1024);
  console.log('PASS: system downloads while backgrounded, waiting recovery, file validation, atomic publication, duplicate taps and cancellation races');
})().catch(err => { console.error(err); process.exitCode = 1; });
