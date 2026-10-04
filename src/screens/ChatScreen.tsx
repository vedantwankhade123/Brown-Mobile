import { AppBackground } from '../components/AppBackground';
import { AssistantMemory } from '../services/storage/AssistantMemory';
import { buildAssistantInstructions } from '../services/inference/ChatCapabilities';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { BrownLogo } from '../components/BrownLogo';
import { RightArrowIcon } from '../components/Icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import { Header } from '../components/Header';
import { hasHeaderOverlap } from '../utils/headerOverlap';
import { DrawerSidebar } from '../components/DrawerSidebar';
import { LlamaEngine } from '../services/inference/LlamaEngine';
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService } from '../services/storage/ConsentService';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { fetchAvailableChatModels } from '../services/modelManager/AvailableChatModels';
import { getInstalledDeviceModels } from '../services/modelManager/ModelCatalog';
import {
  loadSelectedModel,
  matchSelectedModel,
  saveSelectedModel,
} from '../services/modelManager/ModelSelection';
import { SpeechToTextService } from '../services/voice/SpeechToText';
import { TextToSpeechService, KokoroNotInstalledError } from '../services/voice/TextToSpeech';
import {
  downloadKokoroOnboardingDefaults,
  getKokoroInstallStatus,
  KokoroDownloadProgress,
} from '../services/voice/KokoroTtsService';
import {
  AppUpdateInfo,
  checkForAppUpdate,
  dismissUpdateVersion,
  shouldAutoCheckNow,
  wasVersionDismissed,
} from '../services/updater/GitHubUpdateService';
import { UpdatePromptModal } from '../components/UpdatePromptModal';
import { notifyUpdateAvailable, alertReplyReady } from '../services/NotificationService';
import { ChatMessage, ChatSession } from '../types/chat';
import { ModelMetadata } from '../types/model';
import { colors } from '../theme/colors';
import { getContextualThinkingLabel, ANSWERING_PROMOTE_MS, GENERATING_PROMOTE_MS } from '../utils/thinkingLabel';
import { generateSessionTitle, isDefaultSessionTitle } from '../utils/sessionTitle';
import { copyTextToClipboard } from '../utils/clipboard';
import { useBackLayer } from '../utils/backStack';

interface ChatScreenProps {
  /** Bumped whenever the app returns to chat, so the model list re-reads storage. */
  revision?: number;
  /** Model the user just activated elsewhere (Model Store / Settings). */
  requestedModel?: ModelMetadata | null;
  onOpenModelStore: () => void;
  onOpenSettings: () => void;
  onOpenDesktopSync: (options?: { scan?: boolean }) => void;
}

type QuickAction = {
  id: string;
  label: string;
  desc: string;
  draft: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'write', label: 'Write or edit', desc: 'Draft, rewrite or polish any text', draft: 'Help me write and improve this text:' },
  { id: 'code', label: 'Fix some code', desc: 'Explain, debug and improve', draft: 'Explain what this code does and fix any problems:' },
  { id: 'summarize', label: 'Summarize', desc: 'Condense long content', draft: 'Summarize the key points of this text:' },
  { id: 'brainstorm', label: 'Brainstorm', desc: 'Generate fresh ideas and angles', draft: 'Help me brainstorm ideas about:' },
];

/** One quick-start list row — rises into place on mount */
const QuickActionCard: React.FC<{
  action: QuickAction;
  delay: number;
  isFirst: boolean;
  onPress: () => void;
}> = ({ action, delay, isFirst, onPress }) => {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 360,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const { label, desc } = action;

  return (
    <Animated.View
      style={[
        styles.quickCardShell,
        !isFirst && styles.quickCardDivider,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.quickCard}
        onPress={onPress}
        activeOpacity={0.55}
        accessibilityLabel={label}
      >
        <Text style={styles.quickCardTitle} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.quickCardDesc} numberOfLines={1}>
          {desc}
        </Text>
        <RightArrowIcon size={17} color="#ffffff" />
      </TouchableOpacity>
    </Animated.View>
  );
};

export const ChatScreen: React.FC<ChatScreenProps> = ({
  revision,
  requestedModel,
  onOpenModelStore,
  onOpenSettings,
  onOpenDesktopSync,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<ModelMetadata | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  useEffect(() => {
    if (isSidebarOpen) chatRepo.getAllSessions().then(setSessions).catch(() => {});
  }, [isSidebarOpen]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const chatOffset = useRef(0);
  const [greetingName, setGreetingName] = useState<string | null>(null);
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [kokoroDownloading, setKokoroDownloading] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const kbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(show, () => setKeyboardUp(true));
    const onHide = Keyboard.addListener(hide, () => setKeyboardUp(false));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    Animated.timing(kbAnim, {
      toValue: keyboardUp ? 1 : 0,
      duration: keyboardUp ? 240 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [keyboardUp]);

  // Fluid scale & position transitions for Logo & Greeting
  const brandScale = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.85],
  });
  const brandTranslateY = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });
  const logoMargin = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 12],
  });
  const greetingMargin = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [26, 8],
  });

  // Smooth collapse, fade & slide transitions for Quick Actions
  const cardsHeight = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });
  const cardsOpacity = kbAnim.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });
  const cardsTranslateY = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  });
  const cardsScale = kbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.95],
  });

  const dismissComposer = useCallback(() => {
    Keyboard.dismiss();
    setKeyboardUp(false);
  }, []);

  const isSpeaking = Boolean(speakingMessageId) && !ttsPaused;

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const scrollToEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engine = LlamaEngine.getInstance();
  const chatRepo = useRef(new ChatRepository()).current;
  const downloader = ModelDownloader.getInstance();
  // The active chat object + whether it has been written to disk yet.
  // Empty chats are kept in memory only and persisted on the first message,
  // so a fresh "New chat" the user never types into never shows up in History.
  const currentSessionRef = useRef<ChatSession | null>(null);
  const sessionSavedRef = useRef<boolean>(false);
  const activeReplyRef = useRef<ChatMessage | null>(null);
  const streamUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelStreamUpdate = () => { if (streamUpdateTimer.current) clearTimeout(streamUpdateTimer.current); streamUpdateTimer.current = null; };
  useEffect(() => () => { cancelStreamUpdate(); }, []);
  const requestedModelRef = useRef<ModelMetadata | null>(requestedModel ?? null);

  /** Single place that swaps the active model: persists the pick and loads the engine. */
  const activateModel = useCallback(
    async (model: ModelMetadata | null, opts?: { silent?: boolean }) => {
      if (!model) {
        setActiveModel(null);
        return;
      }
      setActiveModel(model);
      saveSelectedModel(model).catch(() => {});
      try {
        const ok = await engine.loadModel(model, {
          contextSize: model.contextLength || 2048,
          threads: 4,
          useHardwareAcceleration: true,
        });
        const isDeviceModel =
          model.provider === 'device' ||
          model.source === 'offline' ||
          (!model.provider && model.source !== 'cloud' && model.source !== 'online');
        if (!ok && isDeviceModel && !opts?.silent) {
          Alert.alert(
            'Model Load Failed',
            engine.getLastNativeError?.() ||
              'On-device GGUF could not be loaded. Rebuild with llama.rn, or use a Cloud model.'
          );
        }
      } catch (err) {
        console.warn('[ChatScreen] Error switching model:', err);
      }
    },
    [engine]
  );

  const scheduleScrollToEnd = useCallback((animated = true) => {
    if (scrollToEndTimer.current) clearTimeout(scrollToEndTimer.current);
    scrollToEndTimer.current = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, animated ? 80 : 0);
  }, []);

  // The composer reserves the keyboard height, which shrinks the thread viewport — without this
  // the newest reply ends up clipped behind the keyboard the moment the user taps to type.
  useEffect(() => {
    if (keyboardUp && messages.length > 0) scheduleScrollToEnd(false);
  }, [keyboardUp, messages.length, scheduleScrollToEnd]);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const onChatScroll = useCallback((e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y || 0;
    chatOffset.current = y;
    setIsScrolled(hasHeaderOverlap(y, styles.listContent.paddingTop, headerHeight, messages.length > 0));
  }, [headerHeight, messages.length]);

  const onHeaderHeightChange = useCallback((height: number) => {
    setHeaderHeight(height);
    setIsScrolled(hasHeaderOverlap(chatOffset.current, styles.listContent.paddingTop, height, messages.length > 0));
  }, [messages.length]);

  useEffect(() => { chatOffset.current = 0; setIsScrolled(false); }, [currentSessionId, messages.length === 0]);

  const listContentStyle = useMemo(() => styles.listContent, []);

  useEffect(() => {
    initApp();
    checkUpdatesOnLaunch();
    return () => {
      if (scrollToEndTimer.current) clearTimeout(scrollToEndTimer.current);
    };
  }, []);

  // Greeting first-name for the empty canvas
  useEffect(() => {
    ConsentService.getLatestConsent()
      .then((consent) => {
        const full = (consent?.fullName || '').trim();
        if (full) setGreetingName(full.split(/\s+/)[0]);
      })
      .catch(() => {});
  }, []);

  // Header model menu list — refreshed on launch, model switch and menu open
  const refreshModels = useCallback(async () => {
    try {
      setModels(await fetchAvailableChatModels(activeModel));
    } catch {}
  }, [activeModel]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  // Coming back from Model Store / Settings: re-read storage so new downloads show up.
  useEffect(() => {
    if (revision === undefined) return;
    refreshModels();
  }, [revision, refreshModels]);

  // A model activated on another screen takes over as soon as chat is mounted again.
  useEffect(() => {
    if (!requestedModel) return;
    requestedModelRef.current = requestedModel;
    activateModel(requestedModel, { silent: true });
  }, [requestedModel, activateModel]);

  const checkUpdatesOnLaunch = async () => {
    try {
      if (!(await shouldAutoCheckNow())) return;
      const info = await checkForAppUpdate();
      if (!info.available) return;
      if (await wasVersionDismissed(info.latestVersion)) return;
      setPendingUpdate(info);
      notifyUpdateAvailable(info);
    } catch {
      // Silent on launch — Settings has manual check
    }
  };

  const promptKokoroDownload = (messageId: string, text: string) => {
    Alert.alert(
      'Kokoro TTS Required',
      'Download the Kokoro TTS engine and the Heart (female) & Michael (male) voice models to use Speak / Listen. Same voices as Brown Desktop (~120 MB).',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => startKokoroDownload(messageId, text),
        },
      ]
    );
  };

  const startKokoroDownload = async (messageId: string, text: string) => {
    if (kokoroDownloading) return;
    setKokoroDownloading(true);
    Alert.alert('Downloading Kokoro TTS', 'Downloading neural engine and voice models…');
    try {
      const result = await downloadKokoroOnboardingDefaults((p: KokoroDownloadProgress) => {
        if (p.percent >= 100 || p.phase === 'complete') return;
      });
      if (!result.success) {
        Alert.alert('Download Failed', result.error || 'Could not download Kokoro TTS.');
        return;
      }
      const status = await getKokoroInstallStatus();
      if (!status.fullyInstalled) {
        Alert.alert('Download Incomplete', 'Kokoro assets are still missing. Please retry from Settings → Voice & Speech.');
        return;
      }
      Alert.alert('Kokoro Ready', 'Heart & Michael voices are installed. Playing your message…');
      setSpeakingMessageId(messageId);
      setTtsPaused(false);
      await TextToSpeechService.speak(text, () => {
        setSpeakingMessageId(null);
        setTtsPaused(false);
      });
    } catch (e: any) {
      Alert.alert('Download Failed', e?.message || 'Could not download Kokoro TTS.');
    } finally {
      setKokoroDownloading(false);
    }
  };

  const initApp = async () => {
    await downloader.whenReady();

    const installed = getInstalledDeviceModels(downloader.getDownloadedIds());
    let available: ModelMetadata[] = [];
    try {
      available = await fetchAvailableChatModels(null);
    } catch {}

    // Priority: what the user just picked > what they picked last time > anything usable.
    const stored = await loadSelectedModel();
    const wanted = requestedModelRef.current;
    const nextModel =
      matchSelectedModel(wanted, available) ||
      matchSelectedModel(wanted, installed) ||
      matchSelectedModel(stored, available) ||
      matchSelectedModel(stored, installed) ||
      available[0] ||
      installed[0] ||
      null;

    if (nextModel) await activateModel(nextModel, { silent: true });

    setSessions(await chatRepo.getAllSessions());
    createNewChat();
  };

  const createNewChat = async () => {
    if (activeReplyRef.current) handleStopGeneration();
    const now = Date.now();
    const session: ChatSession = {
      id: 'session_' + Math.random().toString(36).substring(2, 11),
      title: 'New Chat',
      modelId: activeModel?.id || 'none',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      lastMessagePreview: '',
    };
    currentSessionRef.current = session;
    sessionSavedRef.current = false;
    setCurrentSessionId(session.id);
    setMessages([]);
  };

  const handleSelectModel = async (model: ModelMetadata) => {
    await activateModel(model);
  };

  const loadSession = async (sessionId: string) => {
    if (activeReplyRef.current) handleStopGeneration();
    setCurrentSessionId(sessionId);
    const session =
      sessions.find((s) => s.id === sessionId) || (await chatRepo.getSessionById(sessionId));
    currentSessionRef.current = session || null;
    sessionSavedRef.current = true;
    const msgs = await chatRepo.getMessagesForSession(sessionId);
    setMessages(msgs);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await chatRepo.deleteSession(sessionId);
    const updated = await chatRepo.getAllSessions();
    setSessions(updated);

    if (currentSessionId === sessionId) {
      if (updated.length > 0) {
        loadSession(updated[0].id);
      } else {
        createNewChat();
      }
    }
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    await chatRepo.upsertSession({ ...session, title, updatedAt: Date.now() });
    setSessions(await chatRepo.getAllSessions());
  };

  const handleSendMessage = async (text: string) => {
    if (!currentSessionId || isGenerating) return;
    if (!activeModel) {
      Alert.alert('No model selected', 'Download a GGUF from Model Store, or add a Gemini API key in Settings.');
      return;
    }

    // Persist the chat to history only now that it actually has content,
    // so a fresh empty "New chat" never leaves a stub in History.
    if (!sessionSavedRef.current && currentSessionRef.current) {
      await chatRepo.upsertSession(currentSessionRef.current);
      sessionSavedRef.current = true;
    }

    // Add User message
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      sessionId: currentSessionId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await chatRepo.addMessage(userMsg);

    // Auto-title the chat from the first meaningful user prompt
    const currentSession = currentSessionRef.current;
    if (currentSession && isDefaultSessionTitle(currentSession.title)) {
      const autoTitle = generateSessionTitle(text);
      if (autoTitle && !isDefaultSessionTitle(autoTitle)) {
        const titled = { ...currentSession, title: autoTitle, updatedAt: Date.now() };
        await chatRepo.upsertSession(titled);
        currentSessionRef.current = titled;
      }
    }
    setSessions(await chatRepo.getAllSessions());

    const memoryReply = await AssistantMemory.directive(text).catch(() => 'Could not update saved memory. Please try again.');
    if (memoryReply) {
      const reply: ChatMessage = { id: 'memory_' + Date.now(), sessionId: currentSessionId, role: 'assistant', content: memoryReply, timestamp: Date.now() };
      setMessages([...newHistory, reply]);
      await chatRepo.addMessage(reply);
      setSessions(await chatRepo.getAllSessions());
      return;
    }

    // Prepare assistant streaming placeholder — dynamic contextual status (Thinking/Searching/Analyzing → Answering)
    const assistantMsgId = 'msg_ast_' + Date.now();
    const initialStatus = getContextualThinkingLabel(text);
    const streamingPlaceholder: ChatMessage = {
      id: assistantMsgId,
      sessionId: currentSessionId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      statusLabel: initialStatus,
      modelId: activeModel.id,
    };

    activeReplyRef.current = streamingPlaceholder;
    setMessages([...newHistory, streamingPlaceholder]);
    setIsGenerating(true);

    setTimeout(() => {
      scheduleScrollToEnd(true);
    }, 60);

    // Promote to Formulating response / Answering if still waiting for the first token
    const promoteTimer = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId && m.isStreaming && !String(m.content || '').trim()
            ? { ...m, statusLabel: 'Formulating response' }
            : m
        )
      );
    }, ANSWERING_PROMOTE_MS);

    // Secondary progress indication if model load or context warm-up is taking longer
    const secondPromoteTimer = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId && m.isStreaming && !String(m.content || '').trim()
            ? { ...m, statusLabel: 'Generating answer' }
            : m
        )
      );
    }, GENERATING_PROMOTE_MS);

    try {
      let streamedContent = '';
      let receivedFirstToken = false;

      await engine.generateStream(
        text,
        newHistory,
        {
          temperature: 0.7,
          topP: 0.9,
          contextSize: 2048,
          threads: 4,
          systemPrompt: buildAssistantInstructions(text, await AssistantMemory.preferences(), (await AsyncStorage.getItem('@ultron_system_prompt')) || ''),
          useHardwareAcceleration: true,
        },
        (token) => {
          if (!receivedFirstToken) {
            receivedFirstToken = true;
            clearTimeout(promoteTimer);
            clearTimeout(secondPromoteTimer);
          }
          streamedContent += token;
          activeReplyRef.current = { ...streamingPlaceholder, content: streamedContent };
          // Native tokens may arrive faster than a phone can redraw Markdown.
          if (!streamUpdateTimer.current) streamUpdateTimer.current = setTimeout(() => {
            streamUpdateTimer.current = null;
            const reply = activeReplyRef.current;
            if (reply?.id === assistantMsgId) setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: reply.content, statusLabel: undefined } : m));
          }, 50);
        },
        async (fullText, stats) => {
          cancelStreamUpdate();
          activeReplyRef.current = null;
          clearTimeout(promoteTimer);
          clearTimeout(secondPromoteTimer);
          setIsGenerating(false);
          alertReplyReady(text);
          const finalMsg: ChatMessage = {
            id: assistantMsgId,
            sessionId: currentSessionId,
            role: 'assistant',
            content: fullText,
            timestamp: Date.now(),
            tokensPerSecond: stats.tokensPerSecond,
            totalTokens: stats.tokensGenerated,
            modelId: activeModel.id,
            isStreaming: false,
          };

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? finalMsg : m))
          );
          await chatRepo.addMessage(finalMsg);

          // Refresh sessions list to update preview
          const updatedSessions = await chatRepo.getAllSessions();
          setSessions(updatedSessions);
        }
      );
    } catch (err: any) {
      cancelStreamUpdate();
      activeReplyRef.current = null;
      clearTimeout(promoteTimer);
      clearTimeout(secondPromoteTimer);
      setIsGenerating(false);
      const friendlyMsg = err?.message || 'Failed to complete generation';
      const isLoadFailure =
        /could not be loaded|not found on device|llama\.rn|native module|rebuild/i.test(
          friendlyMsg
        );
      // Don't leave engine errors as fake assistant chat content
      setMessages((prev) =>
        isLoadFailure
          ? prev.filter((m) => m.id !== assistantMsgId)
          : prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: `Couldn’t finish that reply. ${friendlyMsg}`,
                    isStreaming: false,
                    statusLabel: undefined,
                  }
                : m
            )
      );
      if (isLoadFailure) {
        Alert.alert(
          'On-Device Model Notice',
          `${friendlyMsg}\n\nWould you like to select a Cloud AI model (Gemini, Groq, OpenAI) or switch models?`,
          [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'Manage Models',
              onPress: () => onOpenModelStore(),
            },
          ]
        );
      } else {
        Alert.alert('Inference Notice', friendlyMsg);
      }
    }
  };

  const handleStopGeneration = () => {
    cancelStreamUpdate();
    engine.stopGeneration();
    const stoppedReply = activeReplyRef.current;
    activeReplyRef.current = null;
    if (stoppedReply?.content.trim()) {
      chatRepo.addMessage({ ...stoppedReply, isStreaming: false, statusLabel: undefined })
        .then(() => chatRepo.getAllSessions()).then(setSessions)
        .catch((error) => console.warn('[Chat] Could not save stopped reply', error));
    }
    setIsGenerating(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              statusLabel: undefined,
              content: (stoppedReply?.id === m.id ? stoppedReply.content : m.content)?.trim() || 'Generation stopped.',
            }
          : m
      )
    );
  };

  const [voiceInsertText, setVoiceInsertText] = useState<string | null>(null);
  const [voicePartial, setVoicePartial] = useState('');
  const voicePartialAtRef = useRef(0);

  const showVoicePartial = (text: string) => {
    // Partials arrive many times a second; painting each one re-renders the whole screen.
    const now = Date.now();
    if (now - voicePartialAtRef.current < 220) return;
    voicePartialAtRef.current = now;
    setVoicePartial(text);
  };

  const handleVoiceToggle = async () => {
    if (isListening) {
      // Default mic tap while listening = commit (same as pause)
      await handleVoiceCommit();
      return;
    }
    setIsListening(true);
    setVoicePartial('');
    voicePartialAtRef.current = 0;
    try {
      await SpeechToTextService.startListening({
        onPartialResult: showVoicePartial,
        onFinalResult: (finalText) => {
          // Only reached when the recognizer ended the session by itself (60s cap, or a
          // failed tail). A stop initiated here comes back through handleVoiceCommit.
          setVoicePartial('');
          setIsListening(false);
          if (finalText?.trim()) {
            setVoiceInsertText(finalText.trim());
          }
        },
        onError: (err: any) => {
          setVoicePartial('');
          setIsListening(false);
          Alert.alert('Voice Input', err?.message || 'Could not transcribe the recording.');
        },
      });
    } catch (err: any) {
      setIsListening(false);
      Alert.alert('Voice Input', err?.message || 'Could not start voice input.');
    }
  };

  const handleVoiceCommit = async () => {
    if (!isListening) return;
    try {
      const text = await SpeechToTextService.stopListening();
      if (text?.trim()) {
        setVoiceInsertText(text.trim());
      }
    } catch (err: any) {
      Alert.alert('Voice Input', err?.message || 'Could not transcribe the recording.');
    } finally {
      setVoicePartial('');
      setIsListening(false);
    }
  };

  const handleVoiceCancel = async () => {
    await SpeechToTextService.cancelListening();
    setVoicePartial('');
    setIsListening(false);
  };

  // Android back: peel off the topmost transient layer before the app is allowed to exit.
  // Registered last = checked first.
  useBackLayer(isSidebarOpen, () => {
    setIsSidebarOpen(false);
    return true;
  });
  useBackLayer(Boolean(speakingMessageId), () => {
    TextToSpeechService.stop();
    setSpeakingMessageId(null);
    setTtsPaused(false);
    return true;
  });
  useBackLayer(isGenerating, () => {
    handleStopGeneration();
    return true;
  });
  useBackLayer(isListening, () => {
    handleVoiceCancel();
    return true;
  });

  const handleSpeakText = useCallback(async (messageId: string, text: string) => {
    const isThisMessage = speakingMessageId === messageId;

    // While speaking: pause button must STOP audio immediately (Android expo-speech
    // pause is unreliable; treat pause as hard stop).
    if (isThisMessage && !ttsPaused) {
      TextToSpeechService.stop();
      setSpeakingMessageId(null);
      setTtsPaused(false);
      return;
    }

    if (isThisMessage && ttsPaused) {
      TextToSpeechService.stop();
      setSpeakingMessageId(null);
      setTtsPaused(false);
      return;
    }

    TextToSpeechService.stop();
    setSpeakingMessageId(messageId);
    setTtsPaused(false);
    try {
      await TextToSpeechService.speak(text, () => {
        setSpeakingMessageId(null);
        setTtsPaused(false);
      });
    } catch (err) {
      setSpeakingMessageId(null);
      setTtsPaused(false);
      if (err instanceof KokoroNotInstalledError) {
        promptKokoroDownload(messageId, text);
      } else {
        Alert.alert('Speech Error', (err as any)?.message || 'Unable to speak this message.');
      }
    }
  }, [speakingMessageId, ttsPaused]);

  const handleCopy = useCallback(async (text: string) => {
    const copied = await copyTextToClipboard(text);
    if (!copied) Alert.alert('Could not copy', 'Please try copying again.');
    return copied;
  }, []);

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => (
      <ChatBubble
        message={item}
        onCopy={handleCopy}
        onSpeak={handleSpeakText}
        isSpeaking={speakingMessageId === item.id && isSpeaking}
        isPaused={speakingMessageId === item.id && ttsPaused}
      />
    ),
    [handleCopy, handleSpeakText, speakingMessageId, isSpeaking, ttsPaused]
  );

  return (
    <SafeAreaView edges={Platform.OS === 'android' ? [] : ['bottom']} style={styles.container}>

      <AppBackground />

      <View style={styles.chatBody}>
        {/* Chat messages, or an empty canvas on a fresh chat */}
        {messages.length === 0 ? (
          <ScrollView
            contentContainerStyle={[styles.emptyCanvas, { paddingTop: headerHeight + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Blank-space tap closes the composer; later siblings stay on top and tappable */}
            <Pressable style={StyleSheet.absoluteFill} onPress={dismissComposer} />

            {/* Brand Logo & Greeting with fluid scale & positioning transition */}
            <Animated.View
              style={[
                styles.brandBlock,
                {
                  transform: [
                    { translateY: brandTranslateY },
                    { scale: brandScale },
                  ],
                },
              ]}
            >
              <Animated.View style={[styles.logoWrap, { marginBottom: logoMargin }]}>
                <BrownLogo size={74} />
              </Animated.View>
              <Animated.View style={[styles.greetingBlock, { marginBottom: greetingMargin }]}>
                <Text style={styles.greetingMuted}>
                  {greetingName ? `Hi ${greetingName},` : 'Hi there,'}
                </Text>
                <Text style={styles.greetingBold}>How can I help you today?</Text>
              </Animated.View>
            </Animated.View>

            {/* Quick-action cards with smooth collapse, fade & slide transition */}
            <Animated.View
              style={[
                styles.quickCollapse,
                {
                  maxHeight: cardsHeight,
                  opacity: cardsOpacity,
                  transform: [
                    { translateY: cardsTranslateY },
                    { scale: cardsScale },
                  ],
                },
              ]}
              pointerEvents={keyboardUp ? 'none' : 'box-none'}
            >
              <View style={styles.quickList}>
                {QUICK_ACTIONS.map((action, i) => (
                  <QuickActionCard
                    key={action.id}
                    action={action}
                    delay={160 + i * 60}
                    isFirst={i === 0}
                    onPress={() => setDraftText(action.draft)}
                  />
                ))}
              </View>
            </Animated.View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            contentContainerStyle={listContentStyle}
            onScroll={onChatScroll}
            scrollEventThrottle={32}
            onContentSizeChange={() => {
              if (isGenerating) scheduleScrollToEnd(false);
            }}
            onLayout={() => scheduleScrollToEnd(false)}
            removeClippedSubviews
            windowSize={9}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={40}
            initialNumToRender={12}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}

        {/* Floating header — chat scrolls behind the individual pills */}
        <View style={styles.headerOverlay} pointerEvents="box-none">
          <Header
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onOpenSettings={() => {
              setIsSidebarOpen(false);
              onOpenSettings();
            }}
            isScrolled={messages.length > 0 && isScrolled}
            onHeightChange={onHeaderHeightChange}
            updateAvailable={Boolean(pendingUpdate?.available)}
            updateVersion={pendingUpdate?.latestVersion || null}
            onOpenUpdate={() => setShowUpdateModal(true)}
          />
        </View>
      </View>

      {/* Input Field & Voice Controls */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        onVoicePress={handleVoiceToggle}
        onVoiceCommit={handleVoiceCommit}
        onVoiceCancel={handleVoiceCancel}
        voiceInsertText={voiceInsertText}
        onVoiceInsertConsumed={() => setVoiceInsertText(null)}
        voicePartialText={voicePartial}
        draftText={draftText}
        onDraftConsumed={() => setDraftText(null)}
        activeModel={activeModel}
        models={models}
        onSelectModel={handleSelectModel}
        onOpenModelStore={onOpenModelStore}
        onMenuOpen={refreshModels}
        isGenerating={isGenerating}
        isListening={isListening}
        onFocus={() => setKeyboardUp(true)}
      />

      {/* Sidebar Drawer */}
      <DrawerSidebar
        isOpen={isSidebarOpen}
        sessions={sessions}
        activeSessionId={currentSessionId}
        onSelectSession={loadSession}
        onNewChat={createNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onOpenSync={onOpenDesktopSync}
        onOpenSettings={() => {
          setIsSidebarOpen(false);
          onOpenSettings();
        }}
        onClose={() => setIsSidebarOpen(false)}
      />

      <UpdatePromptModal
        visible={showUpdateModal && !!pendingUpdate}
        update={pendingUpdate}
        autoStartDownload
        onDismiss={async () => {
          setShowUpdateModal(false);
          if (pendingUpdate) {
            await dismissUpdateVersion(pendingUpdate.latestVersion).catch(() => {});
          }
        }}
        onUpdated={() => {
          setShowUpdateModal(false);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'visible',
  },
  chatBody: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  emptyCanvas: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 68,
    paddingBottom: 68,
    paddingHorizontal: 24,
  },
  brandBlock: {
    alignItems: 'center',
    width: '100%',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBlock: {
    alignItems: 'center',
  },
  greetingMuted: {
    color: '#8e8e93',
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  greetingBold: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 2,
  },
  quickCollapse: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  quickList: {
    width: '100%',
    alignSelf: 'stretch',
  },
  quickCardShell: {
    width: '100%',
  },
  quickCardDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.32)',
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 2,
  },
  quickCardTitle: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 0,
  },
  quickCardDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13.5,
    lineHeight: 18,
    flex: 1,
    minWidth: 0,
  },
  listContent: {
    paddingTop: 64,
    paddingBottom: 90,
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
  },
});
