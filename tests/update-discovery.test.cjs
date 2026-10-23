const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const version = require('../package.json').version;
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/updater/GitHubUpdateService.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const config = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/updater/updateConfig.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const configEnv = { exports: {} };
vm.runInNewContext(config, configEnv);
function load(installed, payload, status = 200) {
  const env = { exports: {}, Date, fetch: async url => {
    assert.equal(url, 'https://api.github.com/repos/vedantwankhade123/Brown-Mobile/releases/latest');
    return { ok: status === 200, status, json: async () => payload, text: async () => 'unavailable' };
  }, require: name => {
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name.includes('async-storage')) return { getItem: async () => null, setItem: async () => {} };
    if (name === 'expo-application') return { nativeApplicationVersion: installed };
    if (name === 'expo-constants') return { expoConfig: { version: '0.0.1' } };
    if (name === 'expo-file-system') return {};
    if (name === './updateConfig') return configEnv.exports;
    throw Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(code, env);
  return env.exports;
}
(async () => {
  const release = { tag_name: `v${version}`, assets: [
    { name: 'Brown-AI-Setup.exe', browser_download_url: 'https://example.test/desktop.exe', content_type: 'application/x-msdownload' },
    { name: `Brown-AI-Mobile-v${version}.apk`, browser_download_url: `https://example.test/v${version}.apk`, size: 1234 },
    { name: 'Brown-AI-Mobile.apk', browser_download_url: 'https://example.test/stable.apk', size: 1234 },
  ] };
  const update = await load('1.0.6', release).checkForAppUpdate();
  assert.equal(update.available, true);
  assert.equal(update.currentVersion, '1.0.6');
  assert.equal(update.latestVersion, version);
  assert.equal(update.apkSizeBytes, 1234);
  assert.ok(update.apkDownloadUrl.endsWith('.apk'));
  assert.equal((await load(version, release).checkForAppUpdate()).available, false);
  assert.equal((await load('99.0.0', release).checkForAppUpdate()).available, false);
  assert.equal((await load('1.0.6', { ...release, assets: [] }).checkForAppUpdate()).available, false);
  assert.equal((await load('1.0.6', { ...release, assets: [release.assets[0]] }).checkForAppUpdate()).apkDownloadUrl, null);
  const alias = await load('1.0.6', { ...release, assets: [release.assets[2]] }).checkForAppUpdate();
  assert.equal(alias.latestVersion, version);
  assert.equal(alias.available, true);
  await assert.rejects(load('1.0.6', release, 403).checkForAppUpdate(), /403/);
  console.log(`PASS: v1.0.6 discovers v${version}, native version wins, current/newer installs stay current, APK aliases work, absent assets and failed feed cannot offer an update`);
})().catch(error => { console.error(error); process.exitCode = 1; });
