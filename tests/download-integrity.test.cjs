const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
async function main() {
  const { StorageBudgetService } = load('modelManager/StorageBudget.ts', {
    './DeviceProfiler': { DeviceProfiler: { detect: async () => ({}) } },
    'expo-file-system': { getFreeDiskStorageAsync: async () => 0, getTotalDiskCapacityAsync: async () => 100 },
  });
  assert.equal((await StorageBudgetService.getDeviceStorageStats()).freeStorageBytes, 0, 'a full disk must not become 42 GB free');
  for (const valid of [true, false]) {
    const store = new Map();
    const model = { id: 'test', filename: 'test.gguf', sizeBytes: 100000000, downloadUrl: 'https://example.com/model.gguf' };
    const { ModelDownloader } = load('modelManager/Downloader.ts', {
      '@react-native-async-storage/async-storage': { getItem: async k => store.get(k) || null, setItem: async (k, v) => store.set(k, v), removeItem: async k => store.delete(k) },
      '../storage/AccountLifecycle': { isAccountResetting: () => false },
      'react-native': { AppState: { currentState: 'active' } },
      './StorageBudget': { StorageBudgetService: { getDeviceStorageStats: async () => ({ freeStorageBytes: 1e10 }) } },
      '../storage/StoragePaths': { StoragePaths: { ensureLayout: async () => {}, ensureDir: async () => {}, getModelsDir: async () => 'file:///models/' } },
      './ModelCatalog': { CURATED_MODELS: [model], MOBILE_GGUF_LIBRARY: [model], getModelById: () => model },
      '../NotificationService': { alertDownloadComplete() {}, alertModelFailed() {} },
      './BackgroundDownload': { backgroundDownloadsAvailable: () => false },
      'expo-keep-awake': {},
      'expo-file-system': {
        EncodingType: { Base64: 'base64' },
        getInfoAsync: async () => ({ exists: true, size: 2 * 1024 * 1024 }),
        readAsStringAsync: async () => valid ? 'R0dVRg==' : 'PGh0bWw+',
        createDownloadResumable: () => ({ downloadAsync: async () => ({ status: 200, uri: 'file:///models/test.gguf', headers: {} }), cancelAsync: async () => {} }),
      },
    });
    const downloader = ModelDownloader.getInstance();
    await downloader.startDownload(model);
    const state = downloader.getState(model.id);
    assert.equal(state.status, valid ? 'downloaded' : 'error');
    if (valid) assert.equal(state.totalBytes, 2 * 1024 * 1024, 'estimated catalog sizes cannot reject a valid complete file');
    else assert.match(state.error, /not a GGUF/);
  }
  console.log('PASS: full disk reporting, estimated model sizes and fallback GGUF validation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
