/**
 * Ultron Mobile Phase 1 Verification Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Simple TS-to-JS loader using TypeScript compiler API if needed
const ts = require('typescript');

function requireTs(filePath) {
  const fullPath = path.resolve(__dirname, filePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const m = { exports: {} };
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
  console.log('[1/5] Testing Model Catalog & Specifications:');
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

  // 2. Prompt Template Formatting
  console.log('\n[2/5] Testing Prompt Template Engine:');
  const { formatPromptForModel } = requireTs('../src/services/inference/PromptTemplates.ts');

  test('Formats Llama 3.2 chat template with headers and eot tokens', () => {
    const messages = [
      { role: 'user', content: 'Hello Ultron' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'Write code' },
    ];
    const prompt = formatPromptForModel('llama3', messages, 'Custom Sys');
    assert(prompt.includes('<|begin_of_text|>'));
    assert(prompt.includes('<|start_header_id|>system<|end_header_id|>\n\nCustom Sys<|eot_id|>'));
    assert(prompt.includes('<|start_header_id|>user<|end_header_id|>\n\nHello Ultron<|eot_id|>'));
    assert(prompt.includes('<|start_header_id|>assistant<|end_header_id|>\n\nHi there!<|eot_id|>'));
    assert(prompt.endsWith('<|start_header_id|>assistant<|end_header_id|>\n\n'));
  });

  test('Formats Gemma 2 chat template with start_of_turn and end_of_turn', () => {
    const messages = [
      { role: 'user', content: 'Explain offline AI' },
    ];
    const prompt = formatPromptForModel('gemma2', messages, 'System instruction');
    assert(prompt.includes('<start_of_turn>user\nSystem instruction\n\nExplain offline AI<end_of_turn>'));
    assert(prompt.endsWith('<start_of_turn>model\n'));
  });

  test('Formats Qwen 2.5 chat template with ChatML tags', () => {
    const messages = [
      { role: 'user', content: 'Help with math' },
    ];
    const prompt = formatPromptForModel('qwen25', messages, 'Math Tutor');
    assert(prompt.includes('<|im_start|>system\nMath Tutor<|im_end|>'));
    assert(prompt.includes('<|im_start|>user\nHelp with math<|im_end|>'));
    assert(prompt.endsWith('<|im_start|>assistant\n'));
  });

  // 3. Database & ChatRepository
  console.log('\n[3/5] Testing Local Database & Chat Repository:');
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
  console.log('\n[4/5] Testing Mock/Simulator Llama Inference Engine:');
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
  console.log('\n[5/5] Testing Desktop Wi-Fi Pairing Service:');
  const { DesktopSyncService } = requireTs('../src/services/sync/DesktopSync.ts');
  const sync = DesktopSyncService.getInstance();

  await testAsync('Discovers local desktop node and completes PIN pairing', async () => {
    const devices = await sync.scanLocalNetwork();
    assert(devices.length > 0);
    const target = devices[0];
    assert.strictEqual(target.port, 49200);

    const paired = await sync.pairWithDesktop(target, '8421');
    assert.strictEqual(paired, true);

    const status = sync.getStatus();
    assert.strictEqual(status.isConnected, true);
    assert.strictEqual(status.activeDesktop.id, target.id);

    await sync.disconnect();
    assert.strictEqual(sync.getStatus().isConnected, false);
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
