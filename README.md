# Brown AI Mobile

[![Release](https://img.shields.io/badge/Release-v1.0.7-0078D4?logo=github)](https://github.com/vedantwankhade123/Brown-Mobile/releases/latest)
[![Android](https://img.shields.io/badge/Android-10%2B-3DDC84?logo=android&logoColor=white)](https://usebrown.online/download)
[![Website](https://img.shields.io/badge/Website-usebrown.online-7928CA)](https://usebrown.online/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)

<p align="center">
  <img src="Assets/Brown-white.png" alt="Brown AI" width="150" />
</p>

Brown is an Android AI assistant that runs downloaded GGUF language models on your device. Chat locally, manage models and downloads, use supported voice features, and connect to Brown Desktop. Optional cloud providers and model downloads require an internet connection.

**Current release: v1.0.7 · Android build 19 · ARM64 (`arm64-v8a`)**

[Download the APK](https://github.com/vedantwankhade123/Brown-Mobile/releases/latest/download/Brown-AI-Mobile.apk) · [Release notes](https://github.com/vedantwankhade123/Brown-Mobile/releases/tag/v1.0.7) · [Documentation](https://usebrown.online/docs) · [Windows app](https://github.com/vedantwankhade123/Brown)

## Install or update

Use an Android 10+ phone or tablet with an ARM64 processor. Available RAM and storage determine which models can run well; start with a small model and follow the in-app recommendations. This repository ships Android builds; no iOS release is provided.

1. Download **Brown-AI-Mobile.apk** from the official release or [website](https://usebrown.online/download).
2. Open the APK and allow installation from the source you used if Android asks.
3. Open Brown, finish setup, and download a compatible model in Models.
4. For later releases, open **Settings → Software Updates → Check for updates**. Download the update, then approve Android's installation prompt. If asked, allow Brown to install unknown apps.

Install updates over the existing app to retain its data. Do not uninstall first. A blocked or cancelled installation can be retried using the saved APK without downloading it again. Existing installs must use the same application ID and signing certificate as the update.

| Release asset | Purpose |
| --- | --- |
| `Brown-AI-Mobile.apk` | Stable download name used by the website |
| `Brown-AI-Mobile-v1.0.7.apk` | Version-specific copy of the same signed APK |
| `SHA256SUMS.txt` | SHA-256 checksums for both APK copies |
| `release-manifest.json` | Package version, build number, size, checksum and signing fingerprint |

The app checks this repository's latest public GitHub Release. Android updates use its APK assets and release metadata; `latest.yml` belongs to the Windows updater and is not needed here.

## What's new in v1.0.7

- Model-download recovery with clearer Android waiting states, bounded direct-transfer fallback, background transfer support, safe retry, and completed-file validation.
- Refined model cards, download progress, model activation, and chat presentation.
- History search, long-press chat options, improved rename/delete dialogs, and a relocated Downloads control.
- Refined Connect layout and pairing controls.
- Android versionCode increased from 18 to 19, retaining the existing production signing certificate.

## Features

- **Local AI chat:** GGUF inference through `llama.rn`, streaming responses, conversation history, and rich answer rendering.
- **Model management:** download compatible models, track progress, recover interrupted transfers, and switch between installed models.
- **History and memory:** search conversations, rename or delete chats, and manage saved preferences.
- **Voice:** supported local speech and voice components, with downloads and availability shown in the app.
- **Desktop companion:** discover and pair with [Brown Desktop](https://github.com/vedantwankhade123/Brown), reconnect, and share supported conversation data.
- **Optional cloud models:** configure supported providers with your own credentials.

### Data and connectivity

Downloaded local models can answer without an internet connection. Model downloads, GitHub update checks, optional cloud providers, and companion connections communicate with their respective services. Chats and settings use local SQLite and app storage; credentials use platform secure storage where implemented. Review the [privacy policy](https://usebrown.online/privacy) before using optional online features.

## Develop locally

Requirements: Node.js and npm compatible with Expo SDK 51, **JDK 17**, an Android SDK with build-tools, and an Android emulator or USB-debugging device. Native dependencies include Llama and ONNX; **Expo Go cannot run this app**.

```powershell
npm ci
npm run typecheck
npm test
npm run test:ui
npm start
```

`npm start` builds and installs the debug app, starts Metro with Expo network checks disabled, and opens Brown. The first native build still needs any uncached Gradle dependencies. The launcher selects a single running emulator automatically; choose a phone or another target explicitly when needed:

```powershell
npm run android -- --device emulator-5554
npm run start:metro
```

The launcher reads `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `android/local.properties`. Set `JAVA_HOME` to JDK 17. Debug emulator builds select its native ABI; release APKs target ARM64 phones. A release APK contains its JavaScript bundle and does not need Metro.

## Build and publish a release

Release signing requires the existing production keystore and `android/keystore.properties`. These files are private and must never be committed. The verifier checks the production certificate fingerprint, package ID, version, build number, and ARM64 support.

```powershell
# Prepare the next release: synchronize versions, increment versionCode,
# run type checking/tests, build, verify signing, and stage dist/ assets.
npm run release:apk -- --version 1.0.8

# Also run UI and updater regression checks.
npm run test:ui

# Rebuild an already prepared version without incrementing its build number.
npm run release:apk -- --keep-version
```

Before publishing, install the staged APK over the previous release on a real phone. Check launch, retained data, local chat, model/download behavior, and the update screen. Commit the intended source, native modules, version files, tests and `.release-notes-vX.Y.Z.md` together, then push the branch.

```powershell
npm run publish:apk
```

The publisher checks matching APK copies and metadata, creates/verifies the version tag, uploads assets to a draft release, validates their uploaded digests, and marks the release as latest only after those checks pass. It refuses to replace an existing public release. Keep both APK names attached; the stable name is used by live website downloads. After publishing, verify the public download and an in-app upgrade from the previous version.

## Project layout

```text
App.tsx                 App navigation and lifecycle
android/                Native Android application and signing configuration
modules/                Local account, download, recorder and speech modules
src/components/         Chat, history, model, download and update UI
src/screens/            Chat, Models, Settings and Connect screens
src/services/inference/ Local inference and optional cloud providers
src/services/modelManager/ Model catalog, storage and download handling
src/services/storage/   Database, settings and account lifecycle
src/services/sync/      Desktop discovery, pairing and synchronization
src/services/updater/   GitHub update discovery, download cache and installer handoff
src/services/voice/     Voice components
scripts/                Development launcher, release and APK verification tools
tests/                  Behavior, UI, download and updater regressions
```

## Validation for v1.0.7

TypeScript, mobile behavior tests, UI tests, update discovery/cache regressions, and the signed ARM64 build passed. The staged APK was installed over v1.0.6 on a Samsung Galaxy A35 with the profile and downloaded model retained. The local model completed a chat response; Settings and Software Updates reported v1.0.7. These checks cover the tested device and flows, not every Android device or model.

## Support and ownership

[Website](https://usebrown.online/) · [Documentation](https://usebrown.online/docs) · [Issues](https://github.com/vedantwankhade123/Brown-Mobile/issues) · [Contact](https://usebrown.online/contact)

Created by **Vedant Wankhade**. Copyright © 2026. Proprietary software; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
