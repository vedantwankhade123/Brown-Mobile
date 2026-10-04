// Native port of the Brown website documentation (usebrown.online → Documentation).
// Keep section order and wording aligned with brown-website/src/Docs.jsx and
// DocumentationDetails.jsx so the in-app help matches the site.

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'code'; text: string };

export interface HelpSection {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

export const HELP_DOC_UPDATED = 'October 3, 2026';

export const HELP_DOC_INTRODUCTION =
  'Set up Brown on Windows, explore the Android app, and understand models, tools, and device pairing. This guide reflects desktop source version 1.0.7 and mobile source version 1.0.6; published releases may differ.';

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    blocks: [
      {
        type: 'p',
        text: 'Brown is designed to bridge the gap between natural language AI reasoning and local device control. Brown runs local models on your hardware and can connect to cloud providers when you choose. Desktop automation, document retrieval, and voice are separate parts of the workspace.',
      },
      {
        type: 'list',
        items: [
          '100% Offline & Private Inference — local model execution runs on your device. Cloud providers and online tools receive only the information included in requests to those services.',
          'Dynamic Hardware Profiler — scans CPU threads, system RAM, and GPU VRAM on boot to allocate an optimal model footprint (e.g. phi4, llama3.2, qwen2.5).',
          'Human-in-the-Loop (HITL) Security — tool execution follows the active permission policy; approval behavior depends on the tool, operation, and selected mode.',
          'Spotlight Command Overlay (Ctrl+K) — full-screen search overlay over session history and system shortcuts on desktop.',
          'Start Menu Program Parser — indexes user and system shortcuts and resolves target binaries on Windows.',
          'Session Summarizer & Splitter — generates topic headers for sidebar feeds and supports resizable chat frames.',
        ],
      },
    ],
  },
  {
    id: 'tech-stack',
    title: 'Technology Stack',
    blocks: [
      { type: 'p', text: 'Detailed architecture breakdown of frameworks, runtimes, and libraries comprising Brown.' },
      {
        type: 'list',
        items: [
          'Desktop Shell — Electron v31: Chromium rendering engine + Node.js runtime for Windows desktop binaries.',
          'Security Bridge — CommonJS preload & context bridge: strict context isolation between renderer DOM and main system processes.',
          'Frontend UI — HTML5 / CSS3 / Vanilla JS: dark theme UI, glassmorphism, responsive grid layouts, and animations.',
          'Markdown Parser — Marked.js: streaming LLM output with syntax-highlighted code blocks, tables, and LaTeX math.',
          'System Profiler — Systeminformation: native Windows hardware metrics (CPU load, RAM, GPU adapters, disk IO).',
          'Local Inference — Ollama REST API on desktop; llama.rn with quantized GGUF models on mobile.',
          'Python Sidecar — optional Python engine for specialized AI tools, RAG, and web scraping.',
          'Package & Dist — Electron Builder + NSIS installers for Windows; EAS-style APK builds for Android.',
        ],
      },
    ],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    blocks: [
      {
        type: 'p',
        text: 'Brown separates the desktop renderer, exposed preload methods, and main-process services. The bridge routes UI requests to model services and tools, with permission checks where required by the current policy.',
      },
      { type: 'h', text: 'Security & Data Flow' },
      {
        type: 'list',
        ordered: true,
        items: [
          'User Action — a command or automated task is triggered in the renderer UI.',
          'IPC Dispatch — the renderer calls exposed window.ultronAPI bridge functions defined in the preload script.',
          'Main Process Audit — the Electron main process receives the request; the tool and permission policy determine whether approval is needed.',
          'User Verification — when permitted, the operation runs through the relevant tool. Commands can affect real Windows files and applications; approval is not operating-system isolation.',
          'LLM Reasoning Loop — the prompt is forwarded to the local Ollama endpoint or the selected cloud provider, and tokens stream back to the UI in real time.',
        ],
      },
    ],
  },
  {
    id: 'ollama-models',
    title: 'Local Models',
    blocks: [
      {
        type: 'p',
        text: 'These hardware tiers and model settings are examples, not guaranteed performance or fixed limits. Memory use depends on quantization, context, runtime, and other apps. Start small and test your workload.',
      },
      {
        type: 'p',
        text: 'On Windows, Brown integrates directly with Ollama, a high-performance local LLM runner. During startup, Brown checks if Ollama is running; if missing, it offers to install it via winget.',
      },
      { type: 'h', text: 'High-end Hardware' },
      {
        type: 'list',
        items: [
          'phi4:14b (Q4_K_M, 16K–32K context) — default recommendation; superior reasoning, coding, and logical execution. Pull: ollama pull phi4',
          'qwen2.5:32b (Q4_K_M, 32K) — advanced software engineering, multi-step planning, math.',
          'llama3.3:70b (Q4_K_M, 8K–16K) — large model requiring substantial memory beyond the quantized file size.',
          'deepseek-r1:32b (Q4_K_M, 16K) — complex chain-of-thought mathematical and algorithmic problem solving.',
        ],
      },
      { type: 'h', text: 'Mid-range Hardware' },
      {
        type: 'list',
        items: [
          'phi4:14b (Q4_K_M, 8K–16K) — reasoning and general tasks; speed depends on hardware and quantization.',
          'llama3.1:8b (Q4_K_M, 8K–16K) — excellent all-rounder for general conversation and coding.',
          'qwen2.5:14b (Q4_K_M, 16K) — high coding precision and structured JSON/tool output.',
          'deepseek-r1:8b (Q4_K_M, 8K) — reasoning and analytical logic with a low memory footprint.',
          'mistral:7b (Q4_K_M, 8K) — fast, reliable instruct-following model.',
        ],
      },
      { type: 'h', text: 'Budget Hardware' },
      {
        type: 'list',
        items: [
          'llama3.2:3b (Q4_K_M, 4K–8K) — compact general chat model; allow extra memory for context and runtime.',
          'qwen2.5:3b (Q4_K_M, 4K–8K) — lightweight coding, command parsing, and fast responses.',
          'phi3.5:3.8b (Q4_K_M, 4K) — strong reasoning for ultra-lightweight hardware.',
          'deepseek-r1:1.5b (Q4_K_M, 4K) — compact reasoning model.',
        ],
      },
    ],
  },
  {
    id: 'cloud-connectors',
    title: 'Cloud Models',
    blocks: [
      {
        type: 'p',
        text: 'While Brown prioritizes offline local privacy, you can enable Hybrid Cloud Mode in Settings for complex web search, multi-modal vision tasks, or when running on ultra-low-spec hardware without Ollama.',
      },
      { type: 'h', text: 'Cloud Providers' },
      {
        type: 'list',
        items: [
          'Google Gemini API — uses the configured Gemini model and credentials; availability depends on provider access.',
          'Provider connectors — OpenAI, Anthropic, DeepSeek, Groq, and custom compatible routes. Model names and access depend on the provider and app configuration.',
          'Compatible endpoints — configure a supported API base URL for services such as OpenRouter, LM Studio, or vLLM. A compatible chat API does not guarantee every tool, vision, or streaming feature.',
        ],
      },
      { type: 'h', text: 'Cloud Credentials' },
      {
        type: 'p',
        text: 'Keep credentials private and configure only endpoints you trust. Cloud requests send prompts and included context to the chosen provider. Pairing can share profile settings, including a Gemini credential, with the paired phone. Mobile credentials use the OS secure store when available, with a memory-only fallback.',
      },
    ],
  },
  {
    id: 'installation',
    title: 'Installation',
    blocks: [
      { type: 'p', text: 'Brown is available for Windows 10 and 11, 64-bit, and as an Android companion app.' },
      {
        type: 'list',
        ordered: true,
        items: [
          'Visit usebrown.online/download for the latest installer, recommended hardware, and setup details.',
          'Open Brown-AI-Setup.exe and follow the installation wizard. Verify the download came from the official Brown website if Windows displays a security warning.',
          'Launch Brown and select a model from the Models hub. Downloading a local model requires internet and additional storage.',
          'Use a downloaded local model offline, or configure a cloud provider with your own API key.',
        ],
      },
      {
        type: 'p',
        text: 'Update checks connect to our release distribution service. Cloud models and other online features communicate with external services. Read the privacy policy for details.',
      },
    ],
  },
  {
    id: 'configuration',
    title: 'Settings',
    blocks: [
      {
        type: 'p',
        text: 'Brown provides extensive customization options via the Settings panel (Ctrl+, or the sidebar gear icon on desktop; the Settings tab on mobile).',
      },
      { type: 'h', text: 'Model Connections' },
      {
        type: 'list',
        items: [
          'Inference Mode — toggle between Local Ollama and Cloud API.',
          'Ollama Endpoint — defaults to http://127.0.0.1:11434; can point to remote Ollama servers.',
          'Selected Model — list auto-populated from currently pulled models.',
        ],
      },
      { type: 'h', text: 'Access & Security' },
      {
        type: 'list',
        items: [
          'Authorization — choose the permission policy for tools and review approval prompts.',
          'Allowed Command Whitelist — pre-approve trusted PowerShell / CMD scripts for seamless execution.',
        ],
      },
      { type: 'h', text: 'Appearance' },
      {
        type: 'list',
        items: [
          'Spotlight Hotkey — customize the global overlay shortcut (default: Ctrl+K).',
          'UI Theme Accent — toggle dark accenting, glassmorphism intensity, and font scaling.',
          'Metrics Panel Display — choose whether host CPU/RAM meters are visible in the sidebar.',
        ],
      },
    ],
  },
  {
    id: 'desktop-guide',
    title: 'Desktop Tools',
    blocks: [
      {
        type: 'p',
        text: 'Brown’s Windows application combines an Electron interface, a preload bridge, and a Node.js main process. The source includes an agent harness, browser tooling, Windows controls, model services, a local knowledge engine, and voice services.',
      },
      { type: 'h', text: 'Models and performance' },
      {
        type: 'p',
        text: 'Use the Models hub to manage Ollama models and search Hugging Face GGUF repositories. Local endpoints such as LM Studio or vLLM can be configured through compatible API connections. Performance settings include adaptive execution, GPU priority, and CPU-only operation. Model downloads, updates, and cloud connections require internet; a downloaded local model can run offline.',
      },
      { type: 'h', text: 'Files & Knowledge' },
      {
        type: 'p',
        text: 'The local RAG engine indexes supported documents and retrieves relevant content for a question. Select the files to include and inspect references when available. If you choose a cloud model, retrieved context included in the request goes to that provider.',
      },
      { type: 'h', text: 'Connected Tools' },
      {
        type: 'p',
        text: 'The agent can use file tools, Windows controls, command execution, browser tools, and configured MCP servers. Available actions depend on the active configuration and permission policy. Review file changes and commands before granting broader access; tools act on your real machine.',
      },
      { type: 'h', text: 'Voice' },
      {
        type: 'p',
        text: 'Desktop voice services include local Whisper speech recognition and Kokoro speech synthesis. Download the needed assets before using local voice offline. Cloud voice sends audio or text to its provider.',
      },
    ],
  },
  {
    id: 'mobile-guide',
    title: 'Android App',
    blocks: [
      {
        type: 'p',
        text: 'The Android app has its own chat interface, model store, settings, local storage, voice services, and Desktop Sync screen.',
      },
      { type: 'h', text: 'On-device models' },
      {
        type: 'p',
        text: 'The inference service uses llama.rn to load compatible GGUF files. The model manager includes a curated catalog, Hugging Face lookup, downloads, device profiling, and storage budgeting. Start with a small model and leave room for runtime memory and conversation context; file size is not the total RAM requirement.',
      },
      {
        type: 'p',
        text: 'The current Android inference path runs on CPU, so Android GPU or NPU acceleration is not promised by this implementation. It uses the model’s embedded chat template and budgets recent history alongside the system prompt and reply allowance. Older messages may be omitted from the active context in long conversations.',
      },
      { type: 'h', text: 'Connected Modes' },
      {
        type: 'p',
        text: 'Mobile has Gemini and connectors for OpenAI, Anthropic, DeepSeek, Groq, and custom compatible endpoints. Supply your own credentials and choose an available model. A paired desktop can handle model requests over the local network; the desktop and selected runtime must remain available.',
      },
      { type: 'h', text: 'Storage & Permissions' },
      {
        type: 'p',
        text: 'Conversations use SQLite; preferences and nonsecret records use local key-value storage. Credentials use the device secure store, with a memory-only fallback. Camera access supports QR pairing, microphone access supports speech, and file access supports chosen documents and model storage. Review app permissions in Android settings.',
      },
      { type: 'h', text: 'Voice on mobile' },
      {
        type: 'p',
        text: 'The app includes speech input, system text-to-speech, and Kokoro ONNX voice services. Offline behavior depends on the selected engine and downloaded assets. Test your selected voice route before relying on it without internet.',
      },
    ],
  },
  {
    id: 'device-sync',
    title: 'Device Pairing',
    blocks: [
      {
        type: 'list',
        ordered: true,
        items: [
          'Keep the PC and phone on the same trusted local network, with Brown running on the PC.',
          'Open the desktop Connection screen and start a pairing request.',
          'Open Desktop Sync on the phone. Scan the QR code or enter the pairing information shown by the apps.',
          'Complete code verification and check that the expected desktop is connected.',
          'Choose a conversation sync or desktop inference workflow. Unpair the device when you no longer want it to have access.',
        ],
      },
      {
        type: 'p',
        text: 'The sync service uses local HTTP on port 49200, pairing tokens, private-network address checks, and network checks on protected requests. It does not use a hosted sync relay, and its transport is not TLS-encrypted. Pair only trusted devices: the pairing response can include desktop profile settings and a configured Gemini API key.',
      },
      {
        type: 'p',
        text: 'Desktop inference stays local when the desktop uses a local model. Selecting a cloud provider on either device still sends requests outside the local network. Windows Firewall rules, guest Wi-Fi isolation, a changed desktop IP, or a sleeping PC can interrupt the connection.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    blocks: [
      { type: 'h', text: 'Local Model Issues' },
      {
        type: 'p',
        text: 'Check that the runtime is running, the endpoint is correct, and the model is installed. Use "ollama list" to inspect installed Ollama models. Try a smaller model or shorter context if memory is exhausted. A GGUF file being available does not guarantee support in your runtime version.',
      },
      { type: 'h', text: 'Cloud Request Issues' },
      {
        type: 'p',
        text: 'Check the provider, key, base URL, exact model identifier, and account access. Inspect errors for rate limits or usage restrictions. Custom endpoints must support the connector’s expected request format.',
      },
      { type: 'h', text: 'Pairing & Voice Issues' },
      {
        type: 'p',
        text: 'Check local network reachability and desktop connection settings. Start a new pairing session if the code expired. For voice, check microphone permissions, input/output devices, and required engine assets.',
      },
      { type: 'h', text: 'Build from source' },
      {
        type: 'p',
        text: 'The desktop uses Electron 31, Node.js services, and an HTML/CSS/JavaScript renderer. Mobile uses Expo, React Native, TypeScript, and native modules. Native Android development requires the project’s Android SDK and build tools.',
      },
      {
        type: 'code',
        text: '# Desktop repository\nnpm install\nnpm test\nnpm start\nnpm run build:win\n\n# From the mobile directory\nnpm install\nnpm run typecheck\nnpm test\nnpm run android',
      },
    ],
  },
];

export const HELP_CONTACT = {
  email: 'contact@usebrown.online',
  instagramUrl: 'https://www.instagram.com/usebrown.online',
  instagramHandle: '@usebrown.online',
  website: 'https://usebrown.online',
  docsUrl: 'https://usebrown.online/#docs',
};
