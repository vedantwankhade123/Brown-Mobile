const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function verifyApkRelease(file) {
  const target = path.resolve(file);
  const local = path.join(__dirname, '../android/local.properties');
  const configured = fs.existsSync(local) ? fs.readFileSync(local, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\(.)/g, '$1') : null;
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, configured].find(root => root && fs.existsSync(path.join(root, 'build-tools')));
  if (!sdk) throw new Error('Android SDK build-tools not found. Set ANDROID_HOME.');
  const versions = fs.readdirSync(path.join(sdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const signer = versions.map(version => path.join(sdk, 'build-tools', version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')).find(file => fs.existsSync(file));
  if (!signer) throw new Error('Install Android SDK build-tools with apksigner.');
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  const output = process.platform === 'win32'
    ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& ${quote(signer)} verify --verbose --print-certs ${quote(target)}; exit $LASTEXITCODE`], { encoding: 'utf8', windowsHide: true })
    : execFileSync(signer, ['verify', '--verbose', '--print-certs', target], { encoding: 'utf8' });
  if (/CN=Android Debug/i.test(output)) throw new Error('Debug-signed APK: refusing release.');
  const certSha256 = output.match(/Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)/i)?.[1];
  if (!certSha256) throw new Error('APK signing certificate fingerprint not found.');
  // Fingerprint of the production key used by public v1.0.6. A different key
  // cannot upgrade existing installations, even if Android accepts its signature.
  const expected = (process.env.ANDROID_RELEASE_CERT_SHA256 || '746b84b34953ea44b46083f151e25a0e1366a92bc2ee81b4159bf3563acc91a6').replace(/:/g, '').toLowerCase();
  if (expected && certSha256.toLowerCase() !== expected) throw new Error('APK certificate differs from ANDROID_RELEASE_CERT_SHA256. Existing users cannot update with a different key.');
  const aapt = path.join(path.dirname(signer), process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const badging = execFileSync(aapt, ['dump', 'badging', target], { encoding: 'utf8', windowsHide: true });
  const metadata = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  if (!metadata || metadata[1] !== 'com.brown.mobile') throw new Error('Unexpected Android application ID.');
  const versionName = metadata[3], versionCode = Number(metadata[2]);
  const pkgVersion = require('../package.json').version;
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8')).expo;
  if (versionName !== pkgVersion || versionName !== config.version || versionCode !== config.android.versionCode) throw new Error('APK version differs from package.json/app.json. Rebuild before releasing.');
  if (!/^native-code:.*'arm64-v8a'/m.test(badging)) throw new Error('APK is missing the supported ARM64 architecture.');
  return { file: target, size: fs.statSync(target).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), certSha256, applicationId: metadata[1], versionName, versionCode, signature: 'Verified release APK' };
}
module.exports = { verifyApkRelease };
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/verify-apk-release.cjs <app.apk>');
    console.log(JSON.stringify(verifyApkRelease(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
