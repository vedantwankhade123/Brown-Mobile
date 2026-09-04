# Brown AI Mobile — Sovereign On-Device AI Companion

[![Website](https://img.shields.io/badge/Website-usebrown.online-7928CA?logo=vercel&logoColor=white)](https://usebrown.online/)
[![Release](https://img.shields.io/badge/Release-v1.0.0-0078D4?logo=github)](https://github.com/vedantwankhade123/Brown-Releases/releases)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-0078D4?logo=android)](https://github.com/vedantwankhade123/Brown-Releases/releases)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

<p align="center">
  <a href="https://usebrown.online/">
    <img src="assets/brown-logo.png" alt="Brown AI Logo" width="150" />
  </a>
</p>

<p align="center">
  <strong><a href="https://usebrown.online/">usebrown.online</a></strong> — Official website with documentation and direct downloads.
</p>

**Brown AI Mobile** is an autonomous, privacy-first, on-device AI conversational assistant engineered for **Android** and **iOS**. It runs quantized Small Language Models (SLMs) completely offline on your smartphone's silicon, delivering high-speed conversational reasoning, dynamic thinking statuses, encrypted local memories, and seamless local Wi-Fi pairing with the Brown Windows Desktop application.

---

## 📱 Core Features

- **⚡ 100% Offline On-Device Inference**: Direct local execution of quantized `.gguf` neural models (`Llama 3.2 1B/3B`, `Gemma 2 2B`, `Qwen 2.5 1.5B/3B`) without internet access.
- **🔄 Dynamic Thinking & Reasoning States**: Contextual, live status progression indicators ("Thinking...", "Searching knowledge...", "Analyzing prompt...") so you always know what the model is processing.
- **🛡️ Air-Gapped Zero-Telemetry**: Your prompts, conversation histories, and voice notes never leave your device.
- **📦 In-App GGUF Model Manager**: One-tap model browser with RAM tier recommendations, device storage metering, and background chunked downloading.
- **🔐 Encrypted SQLite & SecureStore**: Conversation threads and sensitive API keys are encrypted on-device via Android Keystore and iOS Keychain.
- **🎙️ Sovereign Voice Mode**: Offline voice recording, Whisper speech recognition, and neural TTS synthesis.
- **🖥️ Desktop Wi-Fi Sync**: Zero-config local network pairing using secure PIN codes to synchronize chats and memory with your Brown Desktop workstation.
- **☁️ Hybrid Cloud Parity (Optional)**: Optional connectors for OpenAI, Claude, DeepSeek, Groq, and custom endpoints when external models are needed.

---

## 💾 Download APK

Download the official Android release directly from **[Brown-Releases](https://github.com/vedantwankhade123/Brown-Releases/releases)**:

| Platform | Package Name | Version | Description |
| :--- | :--- | :--- | :--- |
| **Android** | [`Brown AI Mobile v1.0.0.apk`](https://github.com/vedantwankhade123/Brown-Releases/releases/download/v1.0.16/Brown%20AI%20Mobile%20v1.0.0.apk) | v1.0.0 | Direct installation package for Android 10+ devices. |

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
- **Android Studio** (for local Android builds) or **Xcode** (macOS only, for iOS)

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

# Start Expo development server
npm start
```

---

## 🧪 Testing & Validation

```bash
# Run unit and integration verification suite (Catalog, Templates, SQLite, Sync, Providers)
node tests/verify-mobile-suite.js

# Verify strict TypeScript compliance
npm run typecheck
```

---

## 📄 License & Intellectual Property

Brown AI Mobile is **Proprietary & Confidential Software**. All Rights Reserved.

- Copyright (c) 2026 Vedant Wankhade.
- Website: [https://usebrown.online](https://usebrown.online)
- Inquiries: `contact@usebrown.online`
