# Ultron Mobile (BETA v1)

**Ultron Mobile** is an autonomous, privacy-first, on-device AI conversational companion for **iOS (16+)** and **Android (11+)**. It runs quantized Small Language Models (SLMs) completely offline without cloud telemetry or data leakage.

---

## 📱 Features

- **100% Offline On-Device Inference**: Runs quantized `.gguf` neural models (`Llama 3.2 1B/3B`, `Gemma 2 2B`, `Qwen 2.5 1.5B`) directly on phone hardware.
- **Hardware Acceleration**: Bridges to Apple Neural Engine / Metal via `llama.rn` on iOS, and Vulkan / OpenCL / NPU on Android.
- **Zero-Telemetry Air Gap**: Zero analytics, zero logging servers, 100% private.
- **Visual Model Store & GGUF Downloader**: One-tap model manager with storage meters and RAM tier recommendations.
- **Encrypted Local Storage**: Conversation history stored in local SQLite encrypted via iOS Keychain / Android Keystore.
- **Voice Mode**: Whisper speech recognition and neural text-to-speech audio playback.
- **Desktop Ultron Sync**: Optional local Wi-Fi pairing to discover and sync conversation threads with your Desktop Ultron instance.

---

## 🏗️ Architecture

```
mobile/
├── App.tsx                     # Main navigation & root application shell
├── index.js                    # Mobile entrypoint
├── app.json                    # Expo & native bundle manifest
├── tsconfig.json               # Strict TypeScript configuration
├── package.json                # React Native & Native module dependencies
└── src/
    ├── components/             # Reusable UI components
    │   ├── AudioWaveform.tsx   # Real-time voice visualizer
    │   ├── ChatBubble.tsx      # Markdown message bubble with tok/s telemetry
    │   ├── DrawerSidebar.tsx   # Conversation thread switcher & new chat
    │   ├── Header.tsx          # Model pill, offline badge, menu trigger
    │   ├── MessageInput.tsx    # Streaming-aware text & voice input
    │   └── ModelCard.tsx       # Model specs, RAM tier, and download meter
    ├── screens/                # Top-level screen views
    │   ├── ChatScreen.tsx      # Core conversational streaming screen
    │   ├── ModelStoreScreen.tsx# Visual GGUF model manager
    │   ├── SettingsScreen.tsx  # Air-gap diagnostics, system prompt & parameters
    │   └── DesktopSyncScreen.tsx# Local Wi-Fi pairing & PIN sync
    ├── services/               # Core business & AI logic
    │   ├── inference/          # LlamaEngine, PromptTemplates (Llama3, Gemma2, Qwen25)
    │   ├── modelManager/       # Curated GGUF catalog, chunk downloader & storage budget
    │   ├── storage/            # Local SQLite database, migrations & SecureStore
    │   ├── sync/               # Local LAN discovery & Desktop Ultron pairing
    │   └── voice/              # Whisper STT & neural TTS
    ├── theme/                  # Cyberpunk dark design tokens (obsidian + cyan)
    └── types/                  # TypeScript contracts (chat, model, sync)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn

### Run TypeScript Verification & Unit Tests
```bash
# Typecheck
npx tsc --project mobile/tsconfig.json --noEmit

# Run full test suite
node mobile/tests/verify-mobile-suite.js
```

### Start Development Server
```bash
cd mobile
npm start
```

---

## 📄 License & Intellectual Property

Ultron Mobile is **Proprietary & Confidential Software**. Copyright (c) 2026 Vedant Wankhade. All Rights Reserved. See [LICENSE](LICENSE) for details.

