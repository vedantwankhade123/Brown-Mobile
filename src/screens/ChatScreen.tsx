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
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import { Header } from '../components/Header';
import { DrawerSidebar } from '../components/DrawerSidebar';
import { LlamaEngine } from '../services/inference/LlamaEngine';
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService } from '../services/storage/ConsentService';
import { ModelDownloader } from '../services/modelManager/Downloader';
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
import { typography, spacing, borderRadius } from '../theme/typography';
import { getContextualThinkingLabel, ANSWERING_PROMOTE_MS, GENERATING_PROMOTE_MS } from '../utils/thinkingLabel';
import { generateSessionTitle, isDefaultSessionTitle } from '../utils/sessionTitle';
import { copyTextToClipboard } from '../utils/clipboard';

interface ChatScreenProps {
  onOpenModelStore: () => void;
  onOpenSettings: () => void;
  onOpenDesktopSync: (options?: { scan?: boolean }) => void;
}

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
  const [userName, setUserName] = useState<string>('');
  const [modelSheetVisible, setModelSheetVisible] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [kokoroDownloading, setKokoroDownloading] = useState(false);

  const isSpeaking = Boolean(speakingMessageId) && !ttsPaused;

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const scrollToEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engine = LlamaEngine.getInstance();
  const chatRepo = useRef(new ChatRepository()).current;
  const downloader = ModelDownloader.getInstance();

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
    loadUserProfile();
    checkUpdatesOnLaunch();
    return () => {
      if (scrollToEndTimer.current) clearTimeout(scrollToEndTimer.current);
    };
  }, []);

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

  const loadUserProfile = async () => {
    try {
      const consent = await ConsentService.getLatestConsent();
      if (consent && consent.fullName && consent.fullName.trim().length > 0) {
        const first = consent.fullName.trim().split(' ')[0];
        setUserName(first);
      }
    } catch {}
  };

  const getGreetingText = () => {
    const hour = new Date().getHours();
    let salutation = 'Good day';
    if (hour < 12) {
      salutation = 'Good morning';
    } else if (hour < 17) {
      salutation = 'Good afternoon';
    } else {
      salutation = 'Good evening';
    }
    return userName ? `${salutation}, ${userName}` : salutation;
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
    const session = await chatRepo.createSession('New Chat', activeModel?.id || 'none');
    setCurrentSessionId(session.id);
    setSessions((prev) => [session, ...prev]);
    setMessages([]);
  };

  const handleSelectModel = async (model: ModelMetadata) => {
    setActiveModel(model);
    try {
      await engine.loadModel(model, {
        contextSize: model.contextLength || 2048,
        threads: 4,
        useHardwareAcceleration: true,
      });
    } catch (err) {
      console.warn('[ChatScreen] Error switching model:', err);
    }
  };

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
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
    const currentSession = sessions.find((s) => s.id === currentSessionId);
    if (currentSession && isDefaultSessionTitle(currentSession.title)) {
      const autoTitle = generateSessionTitle(text);
      if (autoTitle && !isDefaultSessionTitle(autoTitle)) {
        await chatRepo.upsertSession({
          ...currentSession,
          title: autoTitle,
          updatedAt: Date.now(),
        });
        setSessions(await chatRepo.getAllSessions());
      }
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
          systemPrompt: 'You are Brown Mobile, a helpful AI assistant. Answer clearly and directly like ChatGPT. Do not mention engines, models, or processing — just help the user.',
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ ${friendlyMsg}`, isStreaming: false, statusLabel: undefined }
            : m
        )
      );
      Alert.alert('Inference Notice', friendlyMsg);
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
    } catch {
      setIsListening(false);
    }
  };

  const handleVoiceCommit = async () => {
    if (!isListening) return;
    const text = await SpeechToTextService.stopListening();
    setIsListening(false);
    if (text?.trim()) {
      setVoiceInsertText(text.trim());
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
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.chatBody}>
        {/* Chat Messages or Centered New Chat Greeting Canvas */}
        {messages.length === 0 ? (
          <View style={styles.emptyWelcomeContainer}>
            <Image
              source={require('../../Assets/brown-white-wordmark.png')}
              style={styles.emptyWelcomeLogo}
              resizeMode="contain"
            />
            <Text style={styles.emptyWelcomeTitle}>{getGreetingText()}</Text>
            <Text style={styles.emptyWelcomeSubtitle}>How can Brown assist you today?</Text>
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
            windowSize={7}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            initialNumToRender={10}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
          />
        )}

        {/* Top fade — chat softens under floating header (ChatGPT-style) */}
        {messages.length > 0 && (
          <LinearGradient
            pointerEvents="none"
            colors={['#000000', 'rgba(0,0,0,0.92)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
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
        onOpenModelStore={onOpenModelStore}
        onSelectModel={handleSelectModel}
        activeModel={activeModel}
        isGenerating={isGenerating}
        isListening={isListening}
        isSpeaking={isSpeaking}
        modelSheetVisible={modelSheetVisible}
        onModelSheetVisibleChange={setModelSheetVisible}
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
    backgroundColor: colors.background,
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
  emptyWelcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 56,
  },
  emptyWelcomeLogo: {
    width: 115,
    height: 33,
    marginBottom: 8,
    resizeMode: 'contain',
  },
  emptyWelcomeTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyWelcomeSubtitle: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 64,
    paddingBottom: 90,
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
  },
  waveformLabel: {
    color: colors.accentWhite,
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
});
