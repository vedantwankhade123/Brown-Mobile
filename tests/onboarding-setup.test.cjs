const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/onboarding/OnboardingSetup.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
function setup() {
  const data = new Map(), calls = [], installed = new Set();
  const state = { engine: false, failWrite: '', failDownload: false, resetting: false, hubOnline: true };
  const storage = {
    getItem: async key => data.get(key) || null,
    setItem: async (key, value) => { if (state.failWrite === key) throw Error('Storage full'); data.set(key, value); calls.push(['save', key]); },
    removeItem: async key => { data.delete(key); },
  };
  const kokoro = {
    KOKORO_VOICES: ['af_heart', 'am_michael', 'bm_george', 'bm_lewis'].map(voiceId => ({ voiceId })),
    getKokoroInstallStatus: async () => ({ engineInstalled: state.engine }),
    isKokoroVoiceInstalled: (_, voiceId) => installed.has(voiceId),
    downloadKokoroEngine: async () => { calls.push(['engine']); if (state.failDownload) return { success: false, error: 'Offline' }; state.engine = true; return { success: true }; },
    downloadKokoroVoice: async voiceId => { calls.push(['voice', voiceId]); installed.add(voiceId); return { success: true }; },
    setActiveKokoroVoice: async voiceId => calls.push(['activate', voiceId]),
  };
  const env = { exports: {}, setTimeout, clearTimeout, AbortController, fetch: async () => { calls.push(['hub']); return { ok: state.hubOnline }; }, require: name => name.includes('async-storage') ? storage : name.includes('ConsentService')
    ? { ConsentService: { recordConsent: async () => ({ id: 'consent', agreedAt: 1 }) } }
    : name.includes('AccountLifecycle') ? { isAccountResetting: () => state.resetting } : kokoro };
  vm.runInNewContext(compiled, env);
  return { api: env.exports, data, calls, state, installed };
}
(async () => {
  const s = setup(), enabled = { enabled: true, voiceId: 'bm_george' };
  await assert.rejects(s.api.completeMobileOnboarding('  ', enabled), /enter your name/);
  assert.equal(s.calls.length, 0);
  s.data.set('@ultron_user_profile', JSON.stringify({ fullName: 'Old name', location: 'Pune' }));
  await s.api.completeMobileOnboarding('  Test   User  ', enabled);
  assert.equal(s.calls.filter(call => call[0] === 'engine').length, 0);
  assert.equal(JSON.parse(s.data.get('@ultron_user_profile')).fullName, 'Test User');
  assert.equal(JSON.parse(s.data.get('@ultron_user_profile')).location, 'Pune');
  assert.equal(s.calls.at(-1)[1], '@ultron_onboarding_completed');
  const task = s.api.resumeOnboardingVoiceSetup();
  assert.equal(s.api.resumeOnboardingVoiceSetup(), task);
  await task;
  assert.deepEqual(s.calls.filter(call => call[0] !== 'save'), [['engine'], ['voice', 'bm_george'], ['activate', 'bm_george']]);
  assert.equal(s.data.has(s.api.PENDING_VOICE_KEY), false);

  const skipped = setup();
  await skipped.api.completeMobileOnboarding('Test', { ...enabled, enabled: false });
  await skipped.api.resumeOnboardingVoiceSetup();
  assert.equal(skipped.calls.some(call => ['engine', 'voice', 'activate'].includes(call[0])), false);

  const reuse = setup(); reuse.state.engine = true; reuse.installed.add('bm_george');
  await reuse.api.completeMobileOnboarding('Test', enabled); await reuse.api.resumeOnboardingVoiceSetup();
  assert.deepEqual(reuse.calls.filter(call => call[0] !== 'save'), [['activate', 'bm_george']]);

  const retry = setup(); retry.state.failDownload = true;
  await retry.api.completeMobileOnboarding('Test', enabled);
  await assert.rejects(retry.api.resumeOnboardingVoiceSetup(), /Offline/);
  assert.equal(retry.data.get('@ultron_onboarding_completed'), 'true');
  assert.equal(retry.data.has(retry.api.PENDING_VOICE_KEY), true);
  assert.equal(retry.calls.some(call => call[0] === 'activate'), false);
  retry.state.failDownload = false; await retry.api.resumeOnboardingVoiceSetup();
  assert.equal(retry.data.has(retry.api.PENDING_VOICE_KEY), false);

  const queued = setup(); queued.state.hubOnline = false;
  const snapshots = [];
  const unsubscribe = queued.api.subscribeSetupDownloads(items => snapshots.push(items));
  await queued.api.completeMobileOnboarding('Test', enabled, true);
  assert.equal(queued.api.getSetupDownloads().length, 3);
  assert.ok(queued.api.getSetupDownloads().every(item => item.status === 'Queued'));
  await queued.api.resumeOnboardingVoiceSetup();
  assert.equal(queued.api.getSetupDownloads().find(item => item.id === 'hub').status, 'Paused');
  assert.equal(queued.api.getSetupDownloads().find(item => item.id === 'voice').status, 'Completed');
  assert.equal(queued.data.get(queued.api.PENDING_HUB_KEY), 'true');
  queued.state.hubOnline = true; await queued.api.resumeOnboardingVoiceSetup();
  assert.equal(queued.data.has(queued.api.PENDING_HUB_KEY), false);
  assert.equal(queued.api.getSetupDownloads().find(item => item.id === 'hub').status, 'Completed');
  assert.ok(snapshots.length > 3); unsubscribe();

  const failed = setup(); failed.state.failWrite = '@ultron_user_profile';
  await assert.rejects(failed.api.completeMobileOnboarding('Test', enabled), /Storage full/);
  assert.equal(failed.data.has('@ultron_onboarding_completed'), false);
  console.log('PASS: onboarding validates names, preserves profile fields, saves before downloads, coalesces voice setup, skips/reuses assets, retains failures for retry, and keeps failed setup incomplete');
})().catch(error => { console.error(error); process.exitCode = 1; });
