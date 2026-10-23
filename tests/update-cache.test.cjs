const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/updater/GitHubUpdateService.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const records = new Map(), files = new Map();
let downloads = 0, attempts = 0, blocked = true, readBlocked = false;
let responseSize = 100, responseStatus = 200;
const fileSystem = {
 documentDirectory: 'file:///documents/', makeDirectoryAsync: async () => {},
 downloadAsync: async (url, uri) => { downloads++; files.set(uri, { exists: true, size: responseSize, md5: 'digest' }); return { status: responseStatus, uri }; },
 getInfoAsync: async uri => { if (readBlocked) throw Error('temporarily locked'); return files.get(uri) || { exists: false }; },
 moveAsync: async ({from,to}) => { files.set(to, files.get(from)); files.delete(from); },
 deleteAsync: async uri => { files.delete(uri); }, getContentUriAsync: async uri => uri,
};
function load() {
 const env = { exports: {}, Date, require: name => {
 if (name === 'react-native') return { Platform: { OS: 'android' } };
 if (name.includes('async-storage')) return { getItem: async k => records.get(k) || null, setItem: async (k,v) => records.set(k,v) };
 if (name === 'expo-constants') return { expoConfig: { version: '1.0.0' } };
 if (name === 'expo-file-system') return fileSystem;
 if (name === 'expo-intent-launcher') return { startActivityAsync: async () => { attempts++; if (blocked) throw Error('blocked'); } };
 return { UPDATE_CONFIG: { STORAGE_KEYS: {} } };
 } };
 vm.runInNewContext(source, env); return env.exports;
}
(async () => {
 let api = load();
 const update = { latestVersion: '2.0.0', apkDownloadUrl: 'https://example.test/app.apk', apkSizeBytes: 100 };
 await Promise.all([api.downloadApkUpdate(update), api.downloadApkUpdate(update)]);
 assert.equal(downloads, 1);
 await assert.rejects(api.installDownloadedApkUpdate(update.apkDownloadUrl), /update is saved/);
 api = load(); // A new process has no in-memory update state.
 await api.downloadApkUpdate(update);
 assert.equal(downloads, 1);
 blocked = false; await api.installDownloadedApkUpdate(update.apkDownloadUrl);
 assert.equal(downloads, 1); assert.equal(attempts, 2);
 assert.equal((await api.checkForAppUpdate()).latestVersion, '2.0.0'); // No fetch needed.
 const saved = await api.getDownloadedApkUpdate(); files.get(saved.uri).md5 = 'corrupt';
 assert.equal(await api.getDownloadedApkUpdate(), null);
 await api.downloadApkUpdate(update); assert.equal(downloads, 2);
 assert.equal(await api.getDownloadedApkUpdate('https://example.test/other.apk'), null);
 readBlocked = true;
 await assert.rejects(api.downloadApkUpdate(update), /temporarily locked/);
 assert.equal(downloads, 2);
 readBlocked = false;
 await api.downloadApkUpdate(update); assert.equal(downloads, 2);
 const next = { ...update, latestVersion: '3.0.0' };
 await api.downloadApkUpdate(next); assert.equal(downloads, 3);
 assert.equal((await api.getDownloadedApkUpdate()).update.latestVersion, '3.0.0');
 const newer = { ...update, latestVersion: '4.0.0', apkDownloadUrl: 'https://example.test/new.apk' };
 responseSize = 20;
 await assert.rejects(api.downloadApkUpdate(newer), /incomplete/);
 assert.equal([...files.keys()].some(uri => uri.endsWith('.part')), false);
 assert.equal((await api.getDownloadedApkUpdate()).update.latestVersion, '3.0.0');
 responseStatus = 404;
 await assert.rejects(api.downloadApkUpdate(newer), /HTTP 404/);
 assert.equal([...files.keys()].some(uri => uri.endsWith('.part')), false);
 responseSize = 100; responseStatus = 200;
 await api.downloadApkUpdate(newer);
 assert.equal((await api.getDownloadedApkUpdate()).update.latestVersion, '4.0.0');
 console.log('PASS: mobile download persists across blocked installs and service restart, concurrent downloads coalesce, corrupt/mismatched files rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
