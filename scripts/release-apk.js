#!/usr/bin/env node
// Local release pipeline for the Android APK.
//
// The website links at
// https://github.com/vedantwankhade123/Brown-Mobile/releases/latest/download/Brown-AI-Mobile.apk
// and the in-app updater reads that same release, so `Brown-AI-Mobile.apk` is a contract with
// live users. This script builds on this machine, checks the signature, and publishes it.
//
//   node scripts/release-apk.js --version 1.0.3            bump, test, build, stage
//   node scripts/release-apk.js --publish                  tag HEAD, push, publish
//
// A debug-signed APK must never be published: installs would break in-place updating forever.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const APP_GRADLE = path.join(ANDROID, 'app', 'build.gradle');
const APK_OUT = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release');
const DIST = path.join(ROOT, 'dist');
const REPO = 'vedantwankhade123/Brown-Mobile';

function sh(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.pipe ? 'pipe' : 'inherit', ...opts });
}

function die(message) {
  console.error(`\n[release] ${message}\n`);
  process.exit(1);
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function argValue(name) {
  const value = arg(name, '');
  return typeof value === 'string' ? value : '';
}

const publish = !!arg('publish');
const wantedVersion = argValue('version');
const wantedBuildCode = argValue('build-code');
const arch = argValue('arch') || 'arm64-v8a';

if (process.argv.includes('--version') && !wantedVersion) die('--version needs a value, e.g. --version 1.0.3');

// ----------------------------------------------------------------------------- signing guard
// build.gradle silently falls back to signingConfigs.debug when keystore.properties is absent,
// which is exactly how every published APK up to v1.0.2 ended up debug-signed.
const propsFile = path.join(ANDROID, 'keystore.properties');
if (!fs.existsSync(propsFile)) {
  die(`android/keystore.properties is missing, so Gradle would produce a DEBUG-SIGNED APK.
       Restore it (storeFile/storePassword/keyAlias/keyPassword) before releasing.`);
}
const props = Object.fromEntries(
  fs
    .readFileSync(propsFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const storeFile = path.join(ANDROID, 'app', props.storeFile || '');
if (!props.storeFile || !fs.existsSync(storeFile)) {
  die(`keystore.properties points at "${props.storeFile}" which does not exist under android/app/.`);
}

// ----------------------------------------------------------------------------- version + code
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (publish && wantedVersion) die('--version belongs to the prepare step; --publish only verifies.');
if (wantedVersion) {
  const v = wantedVersion.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) die(`--version must be major.minor.patch, got "${wantedVersion}"`);
  pkg.version = v;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[release] package.json version -> ${v}`);
}
const version = pkg.version;
const tag = `v${version}`;

// Android refuses an update whose versionCode is not higher than the installed one.
let gradle = fs.readFileSync(APP_GRADLE, 'utf8');
const currentCode = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1]);
if (!Number.isFinite(currentCode)) die('could not read versionCode from android/app/build.gradle');

if (publish) {
  // Publish must describe the committed build, never rewrite it.
  if (wantedBuildCode) die('--build-code belongs to the prepare step; --publish only verifies.');
  const declaredName = (gradle.match(/versionName\s+"([^"]*)"/) || [])[1];
  if (declaredName !== version) {
    die(`android/app/build.gradle declares versionName "${declaredName}" but package.json says ${version}`);
  }
  const appJsonCode = Number(
    (fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8').match(/"versionCode"\s*:\s*(\d+)/) || [])[1]
  );
  if (appJsonCode !== currentCode) {
    console.log(`[release] WARNING: app.json versionCode is ${appJsonCode}, build.gradle is ${currentCode}`);
  }
  console.log(`[release] build.gradle: versionCode ${currentCode}, versionName "${version}"`);
} else {
  const buildCode = wantedBuildCode ? Number(wantedBuildCode) : currentCode + 1;
  if (!Number.isFinite(buildCode) || buildCode <= currentCode) {
    die(`--build-code must be an integer above the current ${currentCode}`);
  }
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${buildCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  fs.writeFileSync(APP_GRADLE, gradle, 'utf8');

  // app.json feeds `expo prebuild`; if it drifted, the next prebuild would quietly reset
  // build.gradle back to the old versionCode.
  const appJsonPath = path.join(ROOT, 'app.json');
  const appJson = fs.readFileSync(appJsonPath, 'utf8');
  const synced = appJson
    .replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`)
    .replace(/"versionCode"\s*:\s*\d+/, `"versionCode": ${buildCode}`);
  if (synced !== appJson) fs.writeFileSync(appJsonPath, synced, 'utf8');

  console.log(`[release] versionCode ${currentCode} -> ${buildCode}, versionName -> "${version}" (build.gradle + app.json)`);
}

// ----------------------------------------------------------------------------- test + build
if (!publish) {
  if (!arg('skip-tests')) {
    sh('npm run typecheck');
    sh('npm test');
  }
  if (!arg('skip-build')) {
    const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    sh(`cd android && ${wrapper} assembleRelease --parallel --build-cache ` +
      `-PreactNativeArchitectures=${arch} ` +
      `-Dorg.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8`);
  }

  const apk = fs.existsSync(APK_OUT) ? fs.readdirSync(APK_OUT).find((f) => f.endsWith('.apk')) : null;
  if (!apk) die(`no APK under ${path.relative(ROOT, APK_OUT)}`);

  // The v2 signing block and its X.509 subject sit just before the central directory, so the
  // tail of the file is enough to tell a release key from the debug key.
  const fd = fs.openSync(path.join(APK_OUT, apk), 'r');
  const size = fs.fstatSync(fd).size;
  const tail = Buffer.alloc(Math.min(262144, size));
  fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
  fs.closeSync(fd);
  const tailText = tail.toString('latin1');
  if (tailText.includes('Android Debug')) {
    die('this APK is DEBUG-SIGNED — refusing to publish it. Check android/keystore.properties.');
  }
  console.log(
    tailText.includes('Brown AI')
      ? '[release] signer: release certificate present in the APK (CN=Brown AI)'
      : '[release] WARNING: could not confirm the signer from the APK bytes; verify manually.'
  );

  fs.mkdirSync(DIST, { recursive: true });
  const versioned = path.join(DIST, `Brown-AI-Mobile-v${version}.apk`);
  fs.copyFileSync(path.join(APK_OUT, apk), versioned);
  fs.copyFileSync(path.join(APK_OUT, apk), path.join(DIST, 'Brown-AI-Mobile.apk'));
  console.log(`\n[release] staged ${(fs.statSync(versioned).size / 1048576).toFixed(1)} MB as:`);
  console.log(`  dist/Brown-AI-Mobile-v${version}.apk`);
  console.log('  dist/Brown-AI-Mobile.apk   <- the link the website uses');
  console.log('\n[release] commit the package.json + build.gradle bumps, install this APK and test it,');
  console.log('            then run: node scripts/release-apk.js --publish');
  process.exit(0);
}

// ----------------------------------------------------------------------------- notes
const notesPath = path.join(ROOT, '.release-notes.md');
const candidates = [`.release-notes-v${version}.md`, 'RELEASE_NOTES.md'];
const source = candidates.map((c) => path.join(ROOT, c)).find((c) => fs.existsSync(c));
if (source) {
  fs.copyFileSync(source, notesPath);
  console.log(`[release] notes from ${path.basename(source)}`);
} else if (!fs.existsSync(notesPath)) {
  const lines = sh('git log -n 12 --oneline --no-merges', { pipe: true }).split('\n').filter(Boolean);
  const body = [
    `# Brown AI Mobile v${version}`,
    '',
    '## Downloads (Android)',
    '- **Latest APK**: [`Brown-AI-Mobile.apk`](https://github.com/vedantwankhade123/Brown-Mobile/releases/latest/download/Brown-AI-Mobile.apk)',
    `- **This version**: \`Brown-AI-Mobile-v${version}.apk\``,
    '',
    '## Changes',
    ...lines.map((l) => `- ${l}`),
    '',
  ].join('\n');
  fs.writeFileSync(notesPath, body, 'utf8');
  console.log('[release] generated .release-notes.md from git history — edit it before retrying');
}

// ----------------------------------------------------------------------------- publish
for (const f of ['package.json', 'android/app/build.gradle']) {
  if (sh(`git status --porcelain -- ${f}`, { pipe: true }).trim()) {
    die(`${f} has uncommitted changes — commit the version bump before publishing`);
  }
}
const committedVersion = JSON.parse(sh('git show HEAD:package.json', { pipe: true })).version;
if (committedVersion !== version) die(`HEAD declares ${committedVersion} but package.json says ${version}`);

const staged = [
  path.join(DIST, `Brown-AI-Mobile-v${version}.apk`),
  path.join(DIST, 'Brown-AI-Mobile.apk'),
];
for (const f of staged) if (!fs.existsSync(f)) die(`missing ${path.basename(f)} — run the prepare step first`);
if (fs.statSync(staged[0]).size !== fs.statSync(staged[1]).size) die('the two APK copies differ');

sh(`gh api repos/${REPO} > NUL`);

const tags = sh('git tag -l', { pipe: true }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
if (!tags.includes(tag)) sh(`git tag -a ${tag} -m "Brown AI Mobile ${tag}"`);
sh(`git push origin ${tag}`);

// A single gh call carrying both ~156 MB assets times out on this uplink (HTTP 408) and gh then
// rolls the whole release back, so publish a draft first and upload one asset at a time.
const exists = sh(`gh release view ${tag} > NUL 2>NUL && echo yes || echo no`, { pipe: true }).trim() === 'yes';
if (!exists) {
  sh(`gh release create ${tag} --draft --title "Brown AI Mobile ${tag}" --notes-file .release-notes.md`);
}
for (const f of staged) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      sh(`gh release upload ${tag} "${f}" --clobber`);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      console.log(`[release] upload attempt ${attempt} for ${path.basename(f)} failed: ${String(error.message).split('\n')[0]}`);
    }
  }
  if (lastError) die(`${path.basename(f)} never uploaded — the release is still a draft, retry --publish`);
}
if (exists) sh(`gh release edit ${tag} --title "Brown AI Mobile ${tag}" --notes-file .release-notes.md`);

const uploaded = JSON.parse(sh(`gh release view ${tag} --json assets,isDraft`, { pipe: true })).assets;
for (const asset of uploaded) {
  const local = staged.find((f) => path.basename(f) === asset.name);
  if (local && fs.statSync(local).size !== asset.size) {
    die(`${asset.name} uploaded as ${asset.size} bytes but the local file is ${fs.statSync(local).size}`);
  }
}
sh(`gh release edit ${tag} --draft=false --latest`);

const names = JSON.parse(sh(`gh release view ${tag} --json assets`, { pipe: true })).assets.map((a) => a.name);
const latest = JSON.parse(sh(`gh api repos/${REPO}/releases/latest`, { pipe: true })).tag_name;
console.log(`\n[release] published; releases/latest is now ${latest}`);
for (const f of staged) {
  console.log(`  ${names.includes(path.basename(f)) ? 'ok  ' : 'MISS'} ${path.basename(f)}`);
}
console.log(`\n  website link: https://github.com/${REPO}/releases/latest/download/Brown-AI-Mobile.apk`);
console.log('  remember to commit the updated "mobile" submodule pointer in the desktop repo.');
