# Brown AI Mobile — Sovereign On-Device AI Companion (Android)

[![Website](https://img.shields.io/badge/Website-usebrown.online-7928CA?logo=vercel&logoColor=white)](https://usebrown.online/)
[![Release](https://img.shields.io/badge/Release-v1.0.3-0078D4?logo=github)](https://github.com/vedantwankhade123/Brown-Mobile/releases)
[![Platform](https://img.shields.io/badge/Platform-Android%2010%2B-3DDC84?logo=android&logoColor=white)](https://github.com/vedantwankhade123/Brown-Mobile/releases)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

<p align="center">
  <a href="https://usebrown.online/">
    <img src="Assets/Brown-white.png" alt="Brown AI Logo" width="150" />
  </a>
</p>

<p align="center">
  <strong><a href="https://usebrown.online/">usebrown.online</a></strong> — Official website with documentation and direct downloads.
</p>

**Brown AI Mobile** is an autonomous, privacy-first, on-device AI conversational assistant engineered exclusively for **Android** (Android 10+). It runs quantized Small Language Models (SLMs) completely offline on your smartphone's silicon, delivering high-speed conversational reasoning, dynamic thinking statuses, encrypted local memories, and seamless local Wi-Fi pairing with the Brown Windows Desktop application.

> **Note on Platform Support**: Brown AI Mobile is built **strictly for Android devices**. iOS or other mobile operating systems are not supported.

---

## 📱 Core Features

- **⚡ 100% Offline On-Device Inference**: Direct local execution of quantized `.gguf` neural models (`Llama 3.2 1B/3B`, `Gemma 2 2B`, `Qwen 2.5 1.5B/3B`) without internet access.
- **🔄 Dynamic Thinking & Reasoning States**: Contextual, live status progression indicators ("Thinking...", "Searching knowledge...", "Analyzing prompt...") so you always know what the model is processing.
- **🛡️ Air-Gapped Zero-Telemetry**: Your prompts, conversation histories, and voice notes never leave your device.
- **📦 In-App GGUF Model Manager**: One-tap model browser with RAM tier recommendations, device storage metering, and background chunked downloading.
- **🔐 Encrypted SQLite & SecureStore**: Conversation threads and sensitive API keys are encrypted on-device via Android Keystore and AES-256 local vaults.
- **🎙️ Sovereign Voice Mode**: Offline voice recording, Whisper speech recognition, and neural TTS synthesis.
- **🖥️ Desktop Wi-Fi Sync**: Zero-config local network pairing using secure PIN codes to synchronize chats and memory with your Brown Windows Desktop workstation.
- **☁️ Hybrid Cloud Parity (Optional)**: Optional connectors for OpenAI, Claude, DeepSeek, Groq, and custom endpoints when external models are needed.

---

## 💾 Download APK

![Brown AI mobile app on Android](Assets/Mobile_Download_Mockup.png)

Download the official Android release directly from **[Brown-Mobile Releases](https://github.com/vedantwankhade123/Brown-Mobile/releases)**. The link below is a stable `latest` alias, so it always resolves to the newest build:

| Platform | Package | ABI | Description |
| :--- | :--- | :--- | :--- |
| **Android 10+** | [`Brown-AI-Mobile.apk`](https://github.com/vedantwankhade123/Brown-Mobile/releases/latest/download/Brown-AI-Mobile.apk) | arm64-v8a | Direct installation package, production-signed. |

> **First install**: the APK is not published on Google Play, so Android warns that the app comes from an unknown source. Allow this one installer in **Settings → Apps → Special app access → Install unknown apps**.

---

## 🔄 Release Pipeline

The release APK is built on this machine, installed on a phone and tested before it is published —
there is no CI.

- **`npm run release:apk -- --version 1.0.3`** — [`scripts/release-apk.js`](scripts/release-apk.js)
  bumps `versionName`/`versionCode` in `android/app/build.gradle` and `app.json`, runs `tsc --noEmit`
  and the test suite, runs `gradlew assembleRelease` for `arm64-v8a`, checks the APK's signing block
  and stages `dist/Brown-AI-Mobile-vX.Y.Z.apk` plus the stable `dist/Brown-AI-Mobile.apk`.
- **Test it**: install the staged APK over the previous one and use it. This is the gate CI used to
  provide, so do not skip it.
- **Commit the bumps**, then **`npm run publish:apk`** — tags `vX.Y.Z`, pushes the tag, and creates
  or updates the GitHub Release with both asset names.
- **`versionCode` must increase on every upload**, otherwise Android refuses the update. The script
  refuses to publish if it would not, and refuses to publish a **debug-signed** APK: keep
  `android/keystore.properties` + `android/app/my-release-key.keystore` in place (both gitignored).
- **Release notes**: put a `.release-notes-vX.Y.Z.md` (or `RELEASE_NOTES.md`) in the repo; without it
  the script drafts them from `git log` for you to edit.

`Brown-AI-Mobile.apk` is a live link on usebrown.online, so the alias must always be uploaded.

---

## 🏗️ Project Architecture

```
mobile/
├── App.tsx                     # Main navigation shell & app lifecycle
├── index.js                    # React Native app entrypoint
├── app.json                    # Expo application manifest
├── tsconfig.json               # Strict TypeScript configuration
├── package.json                # Project dependencies and build scripts
└── src/
    ├── components/             # Reusable UI components
    │   ├── AudioWaveform.tsx   # Real-time voice visualizer
    │   ├── ChatBubble.tsx      # Markdown bubble with tok/s telemetry
    │   ├── DrawerSidebar.tsx   # Conversation session switcher & history
    │   ├── Header.tsx          # Top bar, active model pill, offline badge
    │   ├── MessageInput.tsx    # Streaming-aware text & speech input
    │   ├── ModelCard.tsx       # Model specifications, RAM tiers & download meter
    │   ├── ThinkingIndicator.tsx# Dynamic thinking & execution status pill
    │   └── UpdatePromptModal.tsx# In-app new release update notification modal
    ├── screens/                # Core application screens
    │   ├── ChatScreen.tsx      # Conversational streaming & dynamic reasoning
    │   ├── ModelStoreScreen.tsx# Visual GGUF model manager
    │   ├── SettingsScreen.tsx  # Diagnostics, system prompt, temperature & cloud keys
    │   └── DesktopSyncScreen.tsx# Local Wi-Fi pairing & PIN sync
    ├── services/               # Engine & background services
    │   ├── inference/          # LlamaEngine, CloudProviders & prompt formatters
    │   ├── modelManager/       # Curated GGUF catalog & chunk downloader
    │   ├── storage/            # Local SQLite database & SecureStore key vault
    │   ├── sync/               # Local LAN discovery & Desktop sync client
    │   ├── updater/            # GitHub release update detector
    │   └── voice/              # Whisper STT & neural voice playback
    ├── theme/                  # Theme tokens (Obsidian, Cyan & high contrast)
    └── types/                  # Strict TypeScript contracts (chat, models, sync)
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18 or v20 LTS
- **npm** or **yarn**
- **Android Studio & Android SDK (API 30+)** (for local Android emulator and native builds)

### Installation & Development
```bash
# Navigate to mobile directory
cd mobile

# Install dependencies
npm install

# Run TypeScript typecheck
npm run typecheck

# Run automated mobile test suite
node tests/verify-mobile-suite.js

# Start Pixel_9 (or another emulator) in Android Studio, then build and open Brown
npm start
```

Brown requires its native Android app: Expo Go cannot load the local speech,
recorder, account, Llama and ONNX modules. `npm start` (also `npm run android`
and `npm run start:offline`) builds and installs a debug app for the connected
emulator's primary architecture, starts Metro with Expo network checks disabled, and
opens Brown directly. Keep the terminal running for Fast Refresh. The first
native build still needs internet for any uncached Gradle dependencies.
The launcher also uses the bundled official SDK 51 configuration schema in
`scripts/expo-offline` so manifest icons and splash images resolve locally;
SDK 51 otherwise still requests that schema even with `EXPO_OFFLINE=1`.

With multiple emulators/devices, select the target explicitly:
`npm run android -- --device emulator-5554`. The launcher automatically selects
the sole running emulator and does not select a USB phone by default.
Selecting an emulator by its adb ID also excludes its translated ARM ABI from
the build, avoiding unnecessary compilation of the phone inference variants.

For an already installed debug build, `npm run start:metro` starts only the
offline local server; open Brown from the emulator's app launcher. Do not use
Expo Go or an `exp://127.0.0.1:8081` link. A release APK has no live reload
connection. The `No apps connected` warning means no debug app has connected
to Metro yet; reload becomes available once Brown has opened successfully.

The launcher reads the SDK from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or
`android/local.properties`. Set `JAVA_HOME` to JDK 17 for this project's Gradle
version. Native debug builds select the device ABI automatically; ARM64 release
APKs are intended for phones and may crash under emulator ARM translation.

---

## 🧪 Testing & Validation

```bash
# Run unit and integration verification suite (Catalog, Templates, SQLite, Sync, Providers)
node tests/verify-mobile-suite.js

# Verify strict TypeScript compliance
npm run typecheck
```

---

## 👨‍💻 Developer & Ownership

- **Lead Architect & Developer**: **Vedant Wankhade** (Full Stack Developer)
- **Portfolio**: [https://vedantwankhade.netlify.app/](https://vedantwankhade.netlify.app/)
- **LinkedIn**: [https://www.linkedin.com/in/vedant-wankhade123](https://www.linkedin.com/in/vedant-wankhade123)
- **GitHub Profile**: [https://github.com/vedantwankhade123](https://github.com/vedantwankhade123)
- **Email**: `vedantwankhade47@gmail.com`

---

## 📄 License & Intellectual Property

Brown AI Mobile is **Proprietary & Confidential Software**. All Rights Reserved.

- Copyright (c) 2026 Vedant Wankhade.
- Website: [https://usebrown.online](https://usebrown.online)
- Official Support & Inquiries: `contact@usebrown.online`

## Latest source improvements (5 October 2026)

Onboarding no longer asks for email or date of birth. Rich answers share desktop cognitive skill guidance, with native chart/diagram rendering and improved table handling. Automated tests and TypeScript checks pass. These source improvements do not imply a newly published APK; use the published release version shown on GitHub for binary downloads.
