import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { PencilIcon, CodeIcon, SparklesIcon, DocumentIcon, ArrowUpRightIcon } from '../components/Icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import { Header } from '../components/Header';
import { DrawerSidebar } from '../components/DrawerSidebar';
import { LlamaEngine } from '../services/inference/LlamaEngine';
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService } from '../services/storage/ConsentService';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { fetchAvailableChatModels } from '../services/modelManager/AvailableChatModels';
import { getInstalledDeviceModels } from '../services/modelManager/ModelCatalog';
import { getCachedGeminiModels } from '../services/inference/GeminiClient';
import { getConfiguredCloudModels } from '../services/inference/CloudProviders';
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
import { SoundService } from '../services/sound/SoundService';
import { ChatMessage, ChatSession } from '../types/chat';
import { ModelMetadata } from '../types/model';
import { colors } from '../theme/colors';
import { getContextualThinkingLabel, ANSWERING_PROMOTE_MS, GENERATING_PROMOTE_MS } from '../utils/thinkingLabel';
import { generateSessionTitle, isDefaultSessionTitle } from '../utils/sessionTitle';
import { copyTextToClipboard } from '../utils/clipboard';

interface ChatScreenProps {
  onOpenModelStore: () => void;
  onOpenSettings: () => void;
  onOpenDesktopSync: (options?: { scan?: boolean }) => void;
}

type QuickAction = {
  id: string;
  label: string;
  desc: string;
  draft: string;
  Icon: React.FC<{ size?: number; color?: string }>;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'write', label: 'Write or edit', desc: 'Draft, rewrite or polish any text', draft: 'Help me write and improve this text:', Icon: PencilIcon },
  { id: 'code', label: 'Fix some code', desc: 'Explain, debug and improve', draft: 'Explain what this code does and fix any problems:', Icon: CodeIcon },
  { id: 'summarize', label: 'Summarize', desc: 'Condense long content', draft: 'Summarize the key points of this text:', Icon: DocumentIcon },
  { id: 'brainstorm', label: 'Brainstorm', desc: 'Generate fresh ideas and angles', draft: 'Help me brainstorm ideas about:', Icon: SparklesIcon },
];

/** One quick-start list row — rises into place on mount and dips under the finger */
const QuickActionCard: React.FC<{
  action: QuickAction;
  delay: number;
  onPress: () => void;
}> = ({ action, delay, onPress }) => {
  const enter = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  const pressIn = () =>
    Animated.timing(press, { toValue: 0.97, duration: 110, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.timing(press, { toValue: 1, duration: 170, useNativeDriver: true }).start();

  const { label, desc, Icon } = action;

  return (
    <Animated.View
      style={[
        styles.quickCardShell,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            { scale: press },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.quickCard}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
        accessibilityLabel={label}
      >
        <View style={styles.quickCardTile}>
          <Icon size={16} color="#ffffff" />
        </View>
        <View style={styles.quickCardTextCol}>
          <Text style={styles.quickCardTitle} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.quickCardDesc} numberOfLines={1}>
            {desc}
          </Text>
        </View>
        <View style={styles.quickCardArrow}>
          <ArrowUpRightIcon size={14} color="#111111" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const ChatScreen: React.FC<ChatScreenProps> = ({
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
  const [isScrolled, setIsScrolled] = useState(false);
  const [greetingName, setGreetingName] = useState<string | null>(null);
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [kokoroDownloading, setKokoroDownloading] = useState(false);

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

  const scheduleScrollToEnd = useCallback((animated = true) => {
    if (scrollToEndTimer.current) clearTimeout(scrollToEndTimer.current);
    scrollToEndTimer.current = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, animated ? 80 : 0);
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const onChatScroll = useCallback((e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y || 0;
    setIsScrolled(y > 8);
  }, []);

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

  const checkUpdatesOnLaunch = async () => {
    try {
      if (!(await shouldAutoCheckNow())) return;
      const info = await checkForAppUpdate();
      if (!info.available) return;
      if (await wasVersionDismissed(info.latestVersion)) return;
      setPendingUpdate(info);
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
    let nextModel: ModelMetadata | null = installed[0] || null;
    if (!nextModel) {
      try {
        const gemini = await getCachedGeminiModels();
        nextModel = gemini[0] || null;
      } catch {}
    }
    if (!nextModel) {
      try {
        const cloud = await getConfiguredCloudModels();
        nextModel = cloud[0] || null;
      } catch {}
    }
    if (nextModel) {
      setActiveModel(nextModel);
      await engine.loadModel(nextModel, {
        contextSize: nextModel.contextLength || 2048,
        threads: 4,
        useHardwareAcceleration: true,
      });
    }

    const allSessions = await chatRepo.getAllSessions();
    setSessions(allSessions);

    if (allSessions.length > 0) {
      loadSession(allSessions[0].id);
    } else {
      createNewChat();
    }
  };

  const createNewChat = async () => {
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

  const handleQuickAction = async (draft: string) => {
    setIsSidebarOpen(false);
    if (messages.length > 0) {
      await createNewChat();
    }
    setDraftText(draft);
  };

  const handleSelectModel = async (model: ModelMetadata) => {
    setActiveModel(model);
    try {
      const ok = await engine.loadModel(model, {
        contextSize: model.contextLength || 2048,
        threads: 4,
        useHardwareAcceleration: true,
      });
      if (
        !ok &&
        (model.provider === 'device' ||
          model.source === 'offline' ||
          (!model.provider && model.source !== 'cloud' && model.source !== 'online'))
      ) {
        Alert.alert(
          'Model Load Failed',
          engine.getLastNativeError?.() ||
            'On-device GGUF could not be loaded. Rebuild with llama.rn, or use a Cloud model.'
        );
      }
    } catch (err) {
      console.warn('[ChatScreen] Error switching model:', err);
    }
  };

  const loadSession = async (sessionId: string) => {
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
          systemPrompt:
            'You are Brown Mobile, a brilliant, highly capable AI assistant like ChatGPT. ' +
            'Provide direct, beautifully formatted responses using Markdown. ' +
            'Use structured Markdown tables for comparing items, organized bullet points and numbered steps for explanations, ' +
            'and syntax-highlighted code blocks with language tags when showing code. ' +
            'Never mention internal engines, models, or processing — speak directly, concisely, and helpfully to the user.',
          useHardwareAcceleration: true,
        },
        (token) => {
          if (!receivedFirstToken) {
            receivedFirstToken = true;
            clearTimeout(promoteTimer);
            clearTimeout(secondPromoteTimer);
          }
          streamedContent += token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: streamedContent, statusLabel: undefined }
                : m
            )
          );
        },
        async (fullText, stats) => {
          clearTimeout(promoteTimer);
          clearTimeout(secondPromoteTimer);
          setIsGenerating(false);
          SoundService.playCompletion();
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
    engine.stopGeneration();
    setIsGenerating(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              statusLabel: undefined,
              content: m.content?.trim()
                ? m.content
                : 'Generation stopped.',
            }
          : m
      )
    );
  };

  const [voiceInsertText, setVoiceInsertText] = useState<string | null>(null);

  const handleVoiceToggle = async () => {
    if (isListening) {
      // Default mic tap while listening = commit (same as pause)
      await handleVoiceCommit();
      return;
    }
    setIsListening(true);
    try {
      await SpeechToTextService.startListening({
        onPartialResult: () => {
          // Keep partials internal — do not put text in the input until commit
        },
        onFinalResult: (finalText) => {
          // Finalization is triggered only by stopListening(); insert for review
          if (finalText?.trim()) {
            setVoiceInsertText(finalText.trim());
          }
        },
        onError: () => setIsListening(false),
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
      setIsListening(false);
    }
  };

  const handleVoiceCancel = async () => {
    await SpeechToTextService.cancelListening();
    setIsListening(false);
  };

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
    await copyTextToClipboard(text);
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />

      {/* Background: desktop session-column gradient (dark → navy blue) */}
      <LinearGradient
        pointerEvents="none"
        colors={['#111111', '#111111', '#10131c', '#101e40']}
        locations={[0, 0.2, 0.54, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(41,82,148,0)', 'rgba(41,82,148,0.28)']}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.7, y: 1.15 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.chatBody}>
        {/* Chat messages, or an empty canvas on a fresh chat */}
        {messages.length === 0 ? (
          <View style={styles.emptyCanvas}>
            <View style={styles.logoWrap}>
              <Image
                source={require('../../Assets/brown-white-wordmark.png')}
                style={styles.canvasLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.greetingBlock}>
              <Text style={styles.greetingMuted}>
                {greetingName ? `Hi ${greetingName},` : 'Hi there,'}
              </Text>
              <Text style={styles.greetingBold}>How can I help you today?</Text>
            </View>
            <View style={styles.quickList}>
              {QUICK_ACTIONS.map((action, i) => (
                <QuickActionCard
                  key={action.id}
                  action={action}
                  delay={220 + i * 80}
                  onPress={() => setDraftText(action.draft)}
                />
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
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
            keyboardDismissMode="none"
          />
        )}

        {/* Top fade — chat softens under floating header (ChatGPT-style) */}
        {messages.length > 0 && (
          <LinearGradient
            pointerEvents="none"
            colors={['#111111', 'rgba(17,17,17,0.92)', 'rgba(17,17,17,0.55)', 'rgba(17,17,17,0)']}
            locations={[0, 0.35, 0.7, 1]}
            style={styles.topFade}
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
            isScrolled={isScrolled}
            updateAvailable={Boolean(pendingUpdate?.available)}
            updateVersion={pendingUpdate?.latestVersion || null}
            onOpenUpdate={() => setShowUpdateModal(true)}
            models={models}
            activeModel={activeModel}
            onSelectModel={handleSelectModel}
            onOpenModelStore={onOpenModelStore}
            onMenuOpen={refreshModels}
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
        draftText={draftText}
        onDraftConsumed={() => setDraftText(null)}
        activeModel={activeModel}
        isGenerating={isGenerating}
        isListening={isListening}
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
        onQuickAction={handleQuickAction}
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
    backgroundColor: '#111111',
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
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
    zIndex: 20,
  },
  emptyCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  canvasLogo: {
    width: 78,
    height: 74,
  },
  greetingBlock: {
    alignItems: 'center',
    marginBottom: 26,
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
  quickList: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 12,
  },
  quickCardShell: {
    width: '100%',
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minHeight: 66,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#212121',
  },
  quickCardTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  quickCardTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  quickCardTitle: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  quickCardDesc: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12.5,
    lineHeight: 16,
  },
  quickCardArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listContent: {
    paddingTop: 64,
    paddingBottom: 90,
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
  },
});
