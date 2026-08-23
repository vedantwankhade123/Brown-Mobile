import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Image,
} from 'react-native';
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
import { SpeechToTextService } from '../services/voice/SpeechToText';
import { TextToSpeechService } from '../services/voice/TextToSpeech';
import { SoundService } from '../services/sound/SoundService';
import { ChatMessage, ChatSession } from '../types/chat';
import { ModelMetadata } from '../types/model';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';

interface ChatScreenProps {
  onOpenModelStore: () => void;
  onOpenSettings: () => void;
  onOpenDesktopSync: () => void;
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

  const isSpeaking = Boolean(speakingMessageId) && !ttsPaused;

  const flatListRef = useRef<FlatList>(null);
  const engine = LlamaEngine.getInstance();
  const chatRepo = useRef(new ChatRepository()).current;
  const downloader = ModelDownloader.getInstance();

  useEffect(() => {
    initApp();
    loadUserProfile();
  }, []);

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

    // Prepare assistant streaming placeholder
    const assistantMsgId = 'msg_ast_' + Date.now();
    const streamingPlaceholder: ChatMessage = {
      id: assistantMsgId,
      sessionId: currentSessionId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      modelId: activeModel.id,
    };

    setMessages([...newHistory, streamingPlaceholder]);
    setIsGenerating(true);

    try {
      let streamedContent = '';

      await engine.generateStream(
        text,
        newHistory,
        {
          temperature: 0.7,
          topP: 0.9,
          contextSize: 2048,
          threads: 4,
          systemPrompt: 'You are Ultron Mobile, a fast, offline privacy-first AI companion.',
          useHardwareAcceleration: true,
        },
        (token) => {
          streamedContent += token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: streamedContent }
                : m
            )
          );
        },
        async (fullText, stats) => {
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
      setIsGenerating(false);
      const friendlyMsg = err?.message || 'Failed to complete generation';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ ${friendlyMsg}`, isStreaming: false }
            : m
        )
      );
      Alert.alert('Inference Notice', friendlyMsg);
    }
  };

  const handleStopGeneration = () => {
    engine.stopGeneration();
    setIsGenerating(false);
  };

  const handleVoiceToggle = async () => {
    if (isListening) {
      await SpeechToTextService.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      await SpeechToTextService.startListening({
        onPartialResult: (text) => {},
        onFinalResult: (finalText) => {
          setIsListening(false);
          if (finalText) {
            handleSendMessage(finalText);
          }
        },
        onError: () => setIsListening(false),
      });
    }
  };

  const handleSpeakText = (messageId: string, text: string) => {
    const isThisMessage = speakingMessageId === messageId;

    if (isThisMessage && !ttsPaused) {
      TextToSpeechService.pause();
      setTtsPaused(true);
      return;
    }

    if (isThisMessage && ttsPaused) {
      TextToSpeechService.resume();
      setTtsPaused(false);
      return;
    }

    TextToSpeechService.stop();
    setSpeakingMessageId(messageId);
    setTtsPaused(false);
    TextToSpeechService.speak(text, () => {
      setSpeakingMessageId(null);
      setTtsPaused(false);
    });
  };

  const handleCopy = (_text: string) => {
    // Visual copied-state is handled on the bubble copy button.
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <Header
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onOpenSettings={() => {
          setIsSidebarOpen(false);
          onOpenSettings();
        }}
        isScrolled={isScrolled}
      />

      {/* Chat Messages or Centered New Chat Greeting Canvas */}
      {messages.length === 0 ? (
        <View style={styles.emptyWelcomeContainer}>
          <Image
            source={require('../../Assets/ultron-logo.png')}
            style={styles.emptyWelcomeLogo}
            resizeMode="contain"
          />
          <Text style={styles.emptyWelcomeTitle}>{getGreetingText()}</Text>
          <Text style={styles.emptyWelcomeSubtitle}>How can Ultron assist you today?</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item: ChatMessage) => item.id}
          renderItem={({ item }: { item: ChatMessage }) => (
            <ChatBubble
              message={item}
              onCopy={handleCopy}
              onSpeak={handleSpeakText}
              isSpeaking={speakingMessageId === item.id && isSpeaking}
              isPaused={speakingMessageId === item.id && ttsPaused}
            />
          )}
          contentContainerStyle={styles.listContent}
          onScroll={(e: any) => {
            const y = e?.nativeEvent?.contentOffset?.y || 0;
            setIsScrolled(y > 8);
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input Field & Voice Controls */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        onVoicePress={handleVoiceToggle}
        onOpenModelStore={onOpenModelStore}
        onSelectModel={handleSelectModel}
        activeModel={activeModel}
        isGenerating={isGenerating}
        isListening={isListening}
        isSpeaking={isSpeaking}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'visible',
  },
  emptyWelcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyWelcomeLogo: {
    width: 68,
    height: 68,
    marginBottom: 20,
    tintColor: '#ffffff',
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
    paddingVertical: spacing.md,
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
