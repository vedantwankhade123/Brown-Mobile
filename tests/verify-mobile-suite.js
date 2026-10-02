/**
 * Ultron Mobile Phase 1 Verification Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Simple TS-to-JS loader using TypeScript compiler API if needed
const ts = require('typescript');

const moduleCache = new Map();
function requireTs(filePath) {
  const fullPath = path.resolve(__dirname, filePath);
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath).exports;
  const source = fs.readFileSync(fullPath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const m = { exports: {} };
  moduleCache.set(fullPath, m);
  const wrapper = new Function('require', 'exports', 'module', '__filename', '__dirname', result.outputText);
  wrapper((modName) => {
    if (modName.startsWith('.') || modName.startsWith('/')) {
      const resolved = path.resolve(path.dirname(fullPath), modName);
      if (fs.existsSync(resolved + '.ts')) {
        return requireTs(resolved + '.ts');
      }
      if (fs.existsSync(resolved + '.js')) {
        return require(resolved + '.js');
      }
      if (fs.existsSync(resolved)) {
        return require(resolved);
      }
    }
    if (modName === 'react-native') {
      return {
        Platform: { OS: 'android', select: (obj) => obj.android || obj.default },
      };
    }
    if (modName === '@react-native-async-storage/async-storage') {
      if (!global.__asyncStorageMap) global.__asyncStorageMap = new Map();
      return {
        getItem: async (k) => global.__asyncStorageMap.get(k) || null,
        setItem: async (k, v) => { global.__asyncStorageMap.set(k, String(v)); },
        removeItem: async (k) => { global.__asyncStorageMap.delete(k); },
      };
    }
    return require(modName);
  }, m.exports, m, fullPath, path.dirname(fullPath));
  return m.exports;
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running Ultron Mobile Phase 1 Verification Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // 1. Model Catalog Verification
  console.log('[1/6] Testing Model Catalog & Specifications:');
  const { CURATED_MODELS, getModelById, getDefaultModel } = requireTs('../src/services/modelManager/ModelCatalog.ts');
  
  test('Curated model catalog contains Llama 3.2, Qwen 2.5, Gemma 2', () => {
    assert.strictEqual(CURATED_MODELS.length, 4);
    const ids = CURATED_MODELS.map((m) => m.id);
    assert(ids.includes('llama-3.2-1b-instruct'));
    assert(ids.includes('llama-3.2-3b-instruct'));
    assert(ids.includes('qwen-2.5-1.5b-instruct'));
    assert(ids.includes('gemma-2-2b-instruct'));
  });

  test('All models specify Q4_K_M quantization & valid context size', () => {
    for (const m of CURATED_MODELS) {
      assert.strictEqual(m.quantization, 'Q4_K_M');
      assert(m.sizeBytes > 0);
      assert(m.contextLength >= 2048);
      assert(m.downloadUrl.endsWith('.gguf'));
    }
  });

  test('Default model is ultra-fast 1B budget tier', () => {
    const def = getDefaultModel();
    assert.strictEqual(def.id, 'llama-3.2-1b-instruct');
    assert.strictEqual(def.ramTier, '1GB Budget');
  });

  test('Hides 14B+ and flagship GGUFs on 4GB phones', () => {
    const {
      parseParameterBillion,
      isTooHeavyForDevice,
      filterMobileSafeModels,
      MOBILE_GGUF_LIBRARY,
      HEAVY_MODEL_PARAM_BILLION,
    } = requireTs('../src/services/modelManager/ModelCatalog.ts');
    assert.strictEqual(HEAVY_MODEL_PARAM_BILLION, 14);
    assert.strictEqual(parseParameterBillion('14B'), 14);
    const heavy = { parameters: '14B', parameterBillion: 14, recommendedRamMb: 9000, ramRequiredMb: 9000, ramTier: 'Flagship', provider: 'device' };
    assert.strictEqual(isTooHeavyForDevice(heavy, 12000), true);
    const safe4g = filterMobileSafeModels(MOBILE_GGUF_LIBRARY, 3500);
    assert(safe4g.every((m) => (m.parameterBillion || 0) < 14));
    assert(!safe4g.some((m) => /7B/i.test(m.parameters) && m.ramRequiredMb > 5000));
    assert(safe4g.some((m) => m.id === 'llama-3.2-1b-instruct'));
  });

  test('Picks a mobile GGUF from Hugging Face siblings and skips dummy 3.5 names', () => {
    const { pickMobileGgufFile, parseLinkNext, mapHfRepoToMetadata } = requireTs(
      '../src/services/modelManager/HuggingFaceRegistry.ts'
    );
    const picked = pickMobileGgufFile([
      { rfilename: 'mmproj-model.gguf', size: 100 },
      { rfilename: 'Model-Q8_0.gguf', size: 2000 },
      { rfilename: 'Model-Q4_K_M.gguf', size: 800 },
    ]);
    assert.strictEqual(picked.filename, 'Model-Q4_K_M.gguf');
    const next = parseLinkNext('</api/models?skip=10>; rel="next", </api/models?skip=0>; rel="prev"');
    assert(next.includes('skip=10'));
    const mapped = mapHfRepoToMetadata(
      { id: 'bartowski/Llama-3.2-1B-Instruct-GGUF' },
      { filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', sizeBytes: 800000000 }
    );
    assert(mapped.downloadUrl.endsWith('.gguf'));
    assert(mapped.provider === 'device');
    const heavy = mapHfRepoToMetadata(
      { id: 'someone/Huge-70B-Instruct-GGUF' },
      { filename: 'Huge-70B-Instruct-Q4_K_M.gguf', sizeBytes: 40000000000 }
    );
    assert.strictEqual(heavy, null);
  });

  test('Chat picker only lists downloaded and live models', () => {
    const { buildAvailableChatModels, getInstalledDeviceModels } = requireTs('../src/services/modelManager/ModelCatalog.ts');
    const none = buildAvailableChatModels({ downloadedIds: [], hasGeminiKey: false, ollamaTags: [], allowEmpty: true });
    assert.strictEqual(none.length, 0);
    assert.strictEqual(getInstalledDeviceModels([]).length, 0);
    assert.strictEqual(getInstalledDeviceModels(['llama-3.2-1b-instruct']).length, 1);
    assert(!getInstalledDeviceModels(['llama-3.2-1b-instruct']).some((m) => /gemini/i.test(m.name)));

    const mixed = buildAvailableChatModels({
      downloadedIds: ['llama-3.2-1b-instruct'],
      hasGeminiKey: true,
      geminiModels: [{
        id: 'gemini-live-gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        architecture: 'gemma2',
        parameters: '2.5 FLASH',
        quantization: 'Q4_K_M',
        sizeBytes: 0,
        sizeFormatted: 'Cloud',
        recommendedRamMb: 0,
        ramTier: '1GB Budget',
        description: 'Live Gemini',
        downloadUrl: '',
        filename: 'gemini-2.5-flash',
        contextLength: 1,
        tags: ['Gemini'],
        source: 'cloud',
        provider: 'gemini',
        apiModel: 'gemini-2.5-flash',
      }],
      ollamaTags: [{ name: 'llama3.2:latest', size: 2000000000 }],
      allowEmpty: true,
    });
    assert(mixed.some((m) => m.id === 'llama-3.2-1b-instruct'));
    assert(mixed.some((m) => m.provider === 'gemini'));
    assert(mixed.some((m) => m.provider === 'ollama' && m.apiModel === 'llama3.2:latest'));
    assert(!mixed.some((m) => m.id === 'llama-3.3-70b-ollama'));
    assert(!mixed.some((m) => /gemini-3\.5/i.test(m.id + m.name)));
    const emptyGemini = buildAvailableChatModels({
      downloadedIds: ['llama-3.2-1b-instruct'],
      hasGeminiKey: true,
      geminiModels: [{
        id: 'gemini-3.5-pro',
        name: 'Gemini 3.5 Pro',
        architecture: 'gemma2',
        parameters: 'Pro',
        quantization: 'Q4_K_M',
        sizeBytes: 0,
        sizeFormatted: 'Cloud',
        recommendedRamMb: 0,
        ramTier: '1GB Budget',
        description: 'Dummy',
        downloadUrl: '',
        filename: 'gemini-3.5-pro',
        contextLength: 1,
        tags: ['Gemini'],
        source: 'cloud',
        provider: 'gemini',
        apiModel: 'gemini-3.5-pro',
      }],
      allowEmpty: true,
    });
    assert(!emptyGemini.some((m) => m.provider === 'gemini'));
  });

  // 2. Local inference prompt path
  console.log('\n[2/6] Testing Local Inference Prompt Path:');
  const llamaEnginePath = path.resolve(__dirname, '../src/services/inference/LlamaEngine.ts');
  const llamaEngineSrc = fs.readFileSync(llamaEnginePath, 'utf8');

  test('Hands raw messages to llama.rn instead of a hand-written chat template', () => {
    const completionCall = llamaEngineSrc.slice(llamaEngineSrc.indexOf('.completion('));
    assert(completionCall.includes('messages,'), 'completion() must receive the message turns');
    assert(!/PromptTemplates/.test(llamaEngineSrc), 'no hand-built template module may be imported');
  });

  test('Model-specific template guessing stays removed', () => {
    const legacy = path.resolve(__dirname, '../src/services/inference/PromptTemplates.ts');
    assert(!fs.existsSync(legacy), 'PromptTemplates.ts must not come back');
    assert(!/start_header_id|start_of_turn|im_start/.test(llamaEngineSrc), 'no inline chat template tokens');
  });

  test('Keeps the system prompt when the history is trimmed to the token budget', () => {
    assert(/messages\.push\(\{ role: 'system'/.test(llamaEngineSrc), 'system prompt must be prepended');
    assert(llamaEngineSrc.includes('promptTokenBudget'), 'history must be sized against the prompt budget');
  });

  // 3. Database & ChatRepository
  console.log('\n[3/6] Testing Local Database & Chat Repository:');
  const { ChatRepository } = requireTs('../src/services/storage/ChatRepository.ts');
  const chatRepo = new ChatRepository();

  await testAsync('Creates conversation session and records initial message', async () => {
    const session = await chatRepo.createSession('Test Session', 'llama-3.2-1b-instruct');
    assert(session.id.startsWith('session_'));
    assert.strictEqual(session.title, 'Test Session');

    const msg = await chatRepo.addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Testing local storage',
      timestamp: Date.now(),
    });
    assert(msg.id.startsWith('msg_'));
    assert.strictEqual(msg.content, 'Testing local storage');

    const retrieved = await chatRepo.getMessagesForSession(session.id);
    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].content, 'Testing local storage');
  });

  await testAsync('Retrieves all sessions and deletes session cleanly', async () => {
    const session = await chatRepo.createSession('Delete Me', 'llama-3.2-1b-instruct');
    let all = await chatRepo.getAllSessions();
    const countBefore = all.length;

    await chatRepo.deleteSession(session.id);
    all = await chatRepo.getAllSessions();
    assert.strictEqual(all.length, countBefore - 1);
  });

  await testAsync('Merges synced chats without duplicating UUID messages', async () => {
    const imported = await chatRepo.importBundle({
      sessions: [{
        id: 'session_sync_uuid',
        title: 'Desktop thread',
        modelId: 'desktop',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [
          { id: 'msg_a', role: 'user', content: 'hello from pc', timestamp: 1000 },
          { id: 'msg_b', role: 'assistant', content: 'hi', timestamp: 2000 },
        ],
      }],
    });
    assert.strictEqual(imported.sessions, 1);
    const again = await chatRepo.importBundle({
      sessions: [{
        id: 'session_sync_uuid',
        title: 'Desktop thread',
        createdAt: 1000,
        updatedAt: 3000,
        messages: [
          { id: 'msg_a', role: 'user', content: 'hello from pc', timestamp: 1000 },
          { id: 'msg_c', role: 'user', content: 'follow up', timestamp: 3000 },
        ],
      }],
    });
    assert.strictEqual(again.sessions, 0);
    const msgs = await chatRepo.getMessagesForSession('session_sync_uuid');
    assert.strictEqual(msgs.length, 3);
  });

  // 4. Inference Engine & Token Stream
  console.log('\n[4/6] Testing Mock/Simulator Llama Inference Engine:');
  const { MockLlamaEngine } = requireTs('../src/services/inference/MockLlamaEngine.ts');
  const mockEngine = new MockLlamaEngine();

  await testAsync('Loads model and generates streaming response with valid stats', async () => {
    const model = getDefaultModel();
    const loaded = await mockEngine.loadModel(model);
    assert.strictEqual(loaded, true);
    assert.strictEqual(mockEngine.isLoaded(), true);

    let tokensReceived = 0;
    let fullOutput = '';
    let statsOutput = null;

    await mockEngine.generateStream(
      'Who are you?',
      [{ role: 'user', content: 'Who are you?' }],
      {
        temperature: 0.7,
        topP: 0.9,
        contextSize: 2048,
        threads: 4,
        systemPrompt: 'System',
        useHardwareAcceleration: true,
      },
      (token) => {
        tokensReceived++;
        fullOutput += token;
      },
      (fullText, stats) => {
        statsOutput = stats;
      }
    );

    assert(tokensReceived > 0);
    assert(fullOutput.includes('Ultron Mobile'));
    assert(statsOutput !== null);
    assert(statsOutput.tokensGenerated === tokensReceived);
    assert(statsOutput.tokensPerSecond > 0);
  });

  // 5. Desktop Sync Handshake
  console.log('\n[5/6] Testing Desktop Wi-Fi Pairing Service:');
  const { DesktopSyncService } = requireTs('../src/services/sync/DesktopSync.ts');
  const { SecureStore } = requireTs('../src/services/storage/SecureStore.ts');
  const sync = DesktopSyncService.getInstance();

  // In-process desktop stand-in: speaks the same HTTP contract as
  // src/main/desktop-sync-server.js (/discover, /pair/request, /pair/verify, /session).
  function startStubDesktop(preferredPort) {
    const http = require('http');
    const crypto = require('crypto');
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
    const state = { syncId: crypto.randomBytes(6).toString('hex'), pending: null, token: null, attempts: 0 };
    const discover = (port) => ({ ok: true, syncId: state.syncId, name: 'Stub Desktop', version: '1.0.2', port, addresses: ['127.0.0.1'] });
    const server = http.createServer((req, res) => {
      const port = server.address().port;
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = (() => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; } })();
        const send = (status, payload) => {
          res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
          res.end(JSON.stringify(payload));
        };
        const route = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
        if (req.method === 'GET' && (route === '/discover' || route === '/health')) return send(200, discover(port));
        if (req.method === 'GET' && route === '/session') return send(200, { ok: state.token === (req.headers.authorization || '').replace('Bearer ', '') });
        if (req.method === 'POST' && route === '/pair/request') {
          state.pending = { requestId: crypto.randomBytes(8).toString('hex'), code: makeCode(), expiresAt: Date.now() + 120000, attempts: 0 };
          return send(200, { ok: true, requestId: state.pending.requestId, expiresIn: 120, syncId: state.syncId });
        }
        if (req.method === 'POST' && route === '/pair/verify') {
          if (!state.pending) return send(400, { ok: false, error: 'No active pairing request' });
          if (state.pending.requestId !== String(body.requestId || '')) return send(400, { ok: false, error: 'No active pairing request' });
          if (Date.now() > state.pending.expiresAt) { state.pending = null; return send(400, { ok: false, error: 'Pairing code expired' }); }
          if (String(body.code || '').trim().toUpperCase() !== state.pending.code) {
            state.pending.attempts += 1;
            if (state.pending.attempts >= 5) { state.pending = null; return send(429, { ok: false, error: 'Too many failed attempts — generate a new code on the PC' }); }
            return send(401, { ok: false, error: 'Invalid pairing code' });
          }
          state.token = crypto.randomBytes(24).toString('hex');
          state.pending = null;
          return send(200, {
            ok: true,
            token: state.token,
            desktop: { ...discover(port), geminiApiKey: 'stub-inherited-key' },
            profile: { displayName: '', email: '', systemPrompt: '', geminiApiKey: '' },
          });
        }
        return send(404, { ok: false, error: 'Not found' });
      });
    });
    return new Promise((resolve, reject) => {
      const fail = (err) => reject(err);
      server.once('error', fail);
      server.once('listening', () => {
        server.removeListener('error', fail);
        resolve({ server, state, port: server.address().port });
      });
      server.listen(preferredPort, '127.0.0.1');
    });
  }

  // Prefer the real sync port so discovery finds the stub too; fall back to a free port
  // when a live Brown Desktop already owns 49200 on this machine.
  let stub = null;
  try {
    stub = await startStubDesktop(49200);
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
    stub = await startStubDesktop(0);
  }
  const stubOnSyncPort = stub.port === 49200;

  let target = null;
  await testAsync('Discovers the desktop sync node over the local network', async () => {
    const devices = await sync.scanLocalNetwork();
    if (!stubOnSyncPort) {
      target = { id: stub.state.syncId, syncId: stub.state.syncId, name: 'Stub Desktop', ipAddress: '127.0.0.1', port: stub.port, version: '1.0.2', isPaired: false, lastSeen: Date.now() };
      return;
    }
    const match = devices.find((d) => d.syncId === stub.state.syncId);
    assert(match, `Stub desktop was not discovered (saw ${devices.length} device(s))`);
    assert.strictEqual(match.port, 49200);
    assert.strictEqual(match.ipAddress, '127.0.0.1');
    target = match;
  });

  await testAsync('Rejects a wrong pairing code without connecting', async () => {
    const session = await sync.requestPairing(target);
    assert(session.requestId);
    assert.strictEqual(session.expiresIn, 120);
    const wrong = stub.state.pending.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    await assert.rejects(() => sync.pairWithDesktop(target, wrong), /Invalid pairing code/);
    assert.strictEqual(sync.getStatus().isConnected, false);
  });

  await testAsync('Rejects an expired pairing code', async () => {
    await sync.requestPairing(target);
    stub.state.pending.expiresAt = Date.now() - 1;
    await assert.rejects(() => sync.pairWithDesktop(target, 'AAAAAA'), /expired/i);
    assert.strictEqual(sync.getStatus().isConnected, false);
  });

  await testAsync('Completes PIN pairing and stores the session token', async () => {
    const session = await sync.requestPairing(target);
    const paired = await sync.pairWithDesktop(target, stub.state.pending.code);
    assert.strictEqual(paired, true);
    const status = sync.getStatus();
    assert.strictEqual(status.isConnected, true);
    assert.strictEqual(status.activeDesktop.id, target.id);
    assert.strictEqual(await SecureStore.getItem('ultron_desktop_sync_token'), stub.state.token);
    assert.strictEqual(await SecureStore.getItem('ultron_desktop_last_ip'), '127.0.0.1');

    const history = await sync.getPairedHistory();
    assert(history.some((h) => h.id === target.id));

    await sync.disconnect();
    assert.strictEqual(sync.getStatus().isConnected, false);
  });

  await new Promise((resolve) => {
    if (stub.server.closeAllConnections) stub.server.closeAllConnections();
    stub.server.close(resolve);
  });

  // 6. Cloud Multi-Providers Verification (Desktop Parity)
  console.log('\n[6/6] Testing Cloud Multi-Providers & Desktop Parity:');
  const {
    CLOUD_PROVIDERS,
    CLOUD_PROVIDER_IDS,
    detectProviderForModel,
    cloudModelToMetadata,
    saveProviderApiKey,
    getProviderApiKey,
    deleteProviderApiKey,
    saveCustomEndpointUrl,
    getCustomEndpointUrl,
    clearCustomEndpointUrl,
  } = requireTs('../src/services/inference/CloudProviders.ts');

  test('Cloud providers catalog includes OpenAI, Claude, DeepSeek, Groq, and Custom', () => {
    assert(CLOUD_PROVIDER_IDS.includes('openai'));
    assert(CLOUD_PROVIDER_IDS.includes('anthropic'));
    assert(CLOUD_PROVIDER_IDS.includes('deepseek'));
    assert(CLOUD_PROVIDER_IDS.includes('groq'));
    assert(CLOUD_PROVIDER_IDS.includes('custom'));

    assert.strictEqual(CLOUD_PROVIDERS.openai.name, 'OpenAI');
    assert.strictEqual(CLOUD_PROVIDERS.anthropic.name, 'Anthropic Claude');
    assert.strictEqual(CLOUD_PROVIDERS.deepseek.name, 'DeepSeek API');
    assert.strictEqual(CLOUD_PROVIDERS.groq.name, 'Groq Cloud');
    assert.strictEqual(CLOUD_PROVIDERS.custom.name, 'Custom Models (LM Studio / vLLM / OpenRouter)');

    // Ensure models are defined for each provider
    assert(CLOUD_PROVIDERS.openai.models.some((m) => m.id === 'gpt-5' || m.id === 'gpt-4o'));
    assert(CLOUD_PROVIDERS.anthropic.models.some((m) => m.id.includes('claude-3-7') || m.id.includes('claude-3-5')));
    assert(CLOUD_PROVIDERS.deepseek.models.some((m) => m.id === 'deepseek-reasoner' || m.id === 'deepseek-chat'));
    assert(CLOUD_PROVIDERS.groq.models.some((m) => m.id.includes('llama-3.3-70b')));
  });

  test('detectProviderForModel accurately routes model IDs to their providers', () => {
    assert.strictEqual(detectProviderForModel('gpt-5'), 'openai');
    assert.strictEqual(detectProviderForModel('gpt-4o-mini'), 'openai');
    assert.strictEqual(detectProviderForModel('o3-mini'), 'openai');
    assert.strictEqual(detectProviderForModel('claude-3-7-sonnet-20250219'), 'anthropic');
    assert.strictEqual(detectProviderForModel('claude-3-5-haiku-20241022'), 'anthropic');
    assert.strictEqual(detectProviderForModel('deepseek-reasoner'), 'deepseek');
    assert.strictEqual(detectProviderForModel('deepseek-chat'), 'deepseek');
    assert.strictEqual(detectProviderForModel('llama-3.3-70b-versatile'), 'groq');
    assert.strictEqual(detectProviderForModel('deepseek-r1-distill-llama-70b'), 'groq');
    assert.strictEqual(detectProviderForModel('gemini-2.5-flash'), 'gemini');
    assert.strictEqual(detectProviderForModel('custom-model'), 'custom');
    assert.strictEqual(detectProviderForModel('http://localhost:1234/v1'), 'custom');
    assert.strictEqual(detectProviderForModel('llama3.2:1b'), 'ollama');
  });

  test('cloudModelToMetadata maps cloud model definition to valid ModelMetadata', () => {
    const meta = cloudModelToMetadata('openai', {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Multimodal omni model',
      speed: 'Fast',
    });
    assert.strictEqual(meta.id, 'openai-cloud-gpt-4o');
    assert.strictEqual(meta.name, 'GPT-4o');
    assert.strictEqual(meta.provider, 'openai');
    assert.strictEqual(meta.source, 'cloud');
    assert.strictEqual(meta.apiModel, 'gpt-4o');
    assert.strictEqual(meta.sizeFormatted, 'Cloud');
    assert.strictEqual(meta.capabilities.chat, true);
  });

  await testAsync('Saves, retrieves, and deletes provider credentials in SecureStore', async () => {
    await saveProviderApiKey('openai', 'sk-proj-test12345');
    const key = await getProviderApiKey('openai');
    assert.strictEqual(key, 'sk-proj-test12345');
    await deleteProviderApiKey('openai');
    const cleared = await getProviderApiKey('openai');
    assert.strictEqual(cleared, '');

    await saveCustomEndpointUrl('http://192.168.1.50:1234/v1');
    const url = await getCustomEndpointUrl();
    assert.strictEqual(url, 'http://192.168.1.50:1234/v1');
    await clearCustomEndpointUrl();
    const clearedUrl = await getCustomEndpointUrl();
    assert.strictEqual(clearedUrl, '');
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
