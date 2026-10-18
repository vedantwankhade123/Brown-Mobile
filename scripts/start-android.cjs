#!/usr/bin/env node
// Build Brown's native modules instead of opening the incompatible Expo Go app.
const { spawnSync, spawn } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const env = { ...process.env, EXPO_OFFLINE: '1', REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1' };
// SDK 51 otherwise still requests the asset schema online in offline mode.
// Its local schema hook resolves icons/splash assets without a network request.
env.EXPO_UNIVERSE_DIR = path.join(__dirname, 'expo-offline');
// Restore USB/emulator forwarding after adb or the emulator has restarted.
const sdkProperties = path.join(root, 'android', 'local.properties');
const configuredSdk = existsSync(sdkProperties) ? readFileSync(sdkProperties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\(.)/g, '$1') : undefined;
const forwardingSdk = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, configuredSdk, env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk')]
  .find(candidate => candidate && existsSync(path.join(candidate, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')));
if (forwardingSdk) {
  const adbPath = path.join(forwardingSdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const listed = spawnSync(adbPath, ['devices'], { env, encoding: 'utf8' });
  const portArg = process.argv.indexOf('--port');
  const port = portArg >= 0 ? process.argv[portArg + 1] : '8081';
  if (/^\d+$/.test(port || '')) for (const line of (listed.stdout || '').split(/\r?\n/)) {
    const device = line.match(/^(\S+)\s+device$/);
    if (device) spawnSync(adbPath, ['-s', device[1], 'reverse', `tcp:${port}`, `tcp:${port}`], { env, stdio: 'ignore' });
  }
}
if (process.argv[2] === '--metro') {
  const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--localhost', ...process.argv.slice(3)], { cwd: root, env, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const localProperties = path.join(root, 'android', 'local.properties');
  const sdkProperty = existsSync(localProperties)
    ? readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\(.)/g, '$1')
    : undefined;
  const sdk = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, sdkProperty,
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk')]
    .find(candidate => candidate && existsSync(path.join(candidate, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')));
  if (!sdk) {
    console.error('Android SDK not found. Set ANDROID_HOME or android/local.properties to your Android Studio SDK directory.');
    process.exit(1);
  }
  env.ANDROID_HOME = sdk;
  env.ANDROID_SDK_ROOT = sdk;
  if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH || env.Path || ''}`;
  const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const args = process.argv.slice(2);
  if (!args.includes('--port')) args.push('--port', '8081');
  const deviceIndex = args.findIndex(arg => arg === '--device' || arg === '-d');
  if (deviceIndex < 0) {
    const result = spawnSync(adb, ['devices'], { env, encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(result.error?.message || result.stderr || 'Unable to connect to Android Debug Bridge.');
      process.exit(1);
    }
    const emulators = result.stdout.split(/\r?\n/).filter(line => /^emulator-\d+\s+device\b/.test(line));
    if (emulators.length !== 1) {
      console.error('Start one emulator in Android Studio, or select one with npm run android -- --device <device ID>.');
      process.exit(1);
    }
    args.push('--device', emulators[0].split(/\s/)[0]);
  }
  // Expo SDK 51 expects the AVD name rather than adb's emulator serial.
  const selectedIndex = args.findIndex(arg => arg === '--device' || arg === '-d');
  if (/^emulator-\d+$/.test(args[selectedIndex + 1] || '')) {
    const serial = args[selectedIndex + 1];
    const abiResult = spawnSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi'], { env, encoding: 'utf8' });
    const abi = abiResult.stdout?.trim();
    if (abiResult.status !== 0 || !['x86_64', 'arm64-v8a'].includes(abi)) {
      console.error('Unable to determine a supported primary emulator architecture.');
      process.exit(1);
    }
    // SDK 51 includes ARM translation ABIs when auto-detecting emulator targets.
    // Suppress its -P override and use a Gradle system property (above gradle.properties).
    env.GRADLE_OPTS = `${env.GRADLE_OPTS || ''} -Dorg.gradle.project.reactNativeArchitectures=${abi}`;
    if (!args.includes('--all-arch')) args.push('--all-arch');
    console.log(`Building for the emulator's primary architecture: ${abi}`);
    const result = spawnSync(adb, ['-s', args[selectedIndex + 1], 'emu', 'avd', 'name'], { env, encoding: 'utf8' });
    const name = result.stdout?.split(/\r?\n/).map(line => line.trim()).find(line => line && line !== 'OK');
    if (result.status !== 0 || !name) {
      console.error('Unable to read the selected emulator name. Make sure it has finished booting.');
      process.exit(1);
    }
    args[selectedIndex + 1] = name;
  }
  console.log('Starting Brown native Android debug build with offline Expo and a local Metro connection.');
  console.log('The first native build may download missing Gradle dependencies. Keep this terminal open for reloads.');
  const cli = require.resolve('expo/bin/cli');
  const child = spawn(process.execPath, [cli, 'run:android', ...args], { cwd: root, env, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
