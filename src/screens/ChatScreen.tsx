import { BrownButton as TouchableOpacity } from '../components/ButtonSurface';
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
  
  Alert,
  Animated,
  AppState,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  InteractionManager,
} from 'react-native';
import { BrownLogo } from '../components/BrownLogo';
import { RightArrowIcon } from '../components/Icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import { DownloadsModal } from '../components/DownloadsModal';
import { Header } from '../components/Header';
import { hasHeaderOverlap } from '../utils/headerOverlap';
import { DrawerSidebar } from '../components/DrawerSidebar';
import { LlamaEngine } from '../services/inference/LlamaEngine';
import { SessionTitleService } from '../services/inference/SessionTitleService';
import { ChatRepository } from '../services/storage/ChatRepository';
import { PendingReplyStore } from '../services/storage/PendingReplyStore';
import { chatExecutionStatus } from '../services/inference/ChatExecutionStatus';
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
import { DesktopSyncService } from '../services/sync/DesktopSync';

interface ChatScreenProps {
  isActive?: boolean;
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
      <TouchableOpacity style={styles.quickCard}
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
  isActive = true,
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
  const sendLock = useRef(false);
  const pendingReply = useRef(new PendingReplyStore()).current;
  const [replyFailure,setReplyFailure]=useState<{sessionId:string;prompt:string;replyId?:string;message:string}|null>(null);
  const [desktopConnected,setDesktopConnected]=useState(()=>DesktopSyncService.getInstance().getStatus().isConnected);
  useEffect(()=>DesktopSyncService.getInstance().subscribe(status=>setDesktopConnected(status.isConnected)),[]);
  const executionStatus=chatExecutionStatus(activeModel,desktopConnected);
  const previewSnapshot = useRef<any>(null);
  const previewActive = useRef(isActive);
  previewActive.current = isActive;
  previewSnapshot.current = { visible: true, sessionId: currentSessionId,
    title: sessions.find(s => s.id === currentSessionId)?.title || 'New chat',
    model: activeModel?.name || '', generating: isGenerating,
    messages: messages.slice(-60).map(m => ({ id: m.id, role: m.role, content: m.content, isStreaming: m.isStreaming, statusLabel: m.statusLabel })) };
  useEffect(() => {
    let busy = false, disposed = false;
    const service = DesktopSyncService.getInstance();
    const publish = async () => {
      if (busy) return;
      busy = true;
      try { await service.publishChatPreview(previewActive.current && AppState.currentState === 'active' ? previewSnapshot.current : { visible: false }); }
      catch {} finally { busy = false; if (disposed) service.publishChatPreview({ visible: false }).catch(() => {}); }
    };
    const timer = setInterval(publish, 1000);
    const listener = AppState.addEventListener('change', publish);
    return () => { disposed = true; clearInterval(timer); listener.remove(); service.publishChatPreview({ visible: false }).catch(() => {}); };
  }, []);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const speechRequest = useRef(0);
  useEffect(() => () => { speechRequest.current++; TextToSpeechService.stop(); }, []);
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
  const [showDownloads, setShowDownloads] = useState(false);
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
  const titleService = useMemo(() => new SessionTitleService(engine, chatRepo), [engine, chatRepo]);
  const replyEpoch = useRef(0);
  useEffect(() => () => { replyEpoch.current++; titleService.cancel(); engine.stopGeneration(); void pendingReply.flush().catch(()=>{}); }, [titleService]);
  useEffect(() => {
    if (!isActive) { titleService.cancel(); }
  }, [isActive, titleService]);
  const downloader = ModelDownloader.getInstance();
  // The active chat object + whether it has been written to disk yet.
  // Empty chats are kept in memory only and persisted on the first message,
  // so a fresh "New chat" the user never types into never shows up in History.
  const currentSessionRef = useRef<ChatSession | null>(null);
  const sessionSavedRef = useRef<boolean>(false);
  const activeReplyRef = useRef<ChatMessage | null>(null);
  const activeCheckpointId=useRef<string|null>(null);
  const requestPrompt=useRef('');
  const replySaves=useRef<Promise<void>>(Promise.resolve());
  const persistReply=(message:ChatMessage,checkpointId:string)=>{
    const saved=replySaves.current.catch(()=>{}).then(async()=>{await chatRepo.saveReply(message);await pendingReply.finish(checkpointId);});
    replySaves.current=saved;return saved;
  };
  const streamUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReplyDeadline=()=>{if(replyDeadline.current)clearTimeout(replyDeadline.current);replyDeadline.current=null;};
  const cancelStreamUpdate = () => { if (streamUpdateTimer.current) clearTimeout(streamUpdateTimer.current); streamUpdateTimer.current = null; };
  useEffect(() => () => { cancelStreamUpdate();clearReplyDeadline(); }, []);
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')void pendingReply.flush().catch(()=>{});});return ()=>listener.remove();},[pendingReply]);
  const requestedModelRef = useRef<ModelMetadata | null>(requestedModel ?? null);
  const modelActivation = useRef<{ id: string; promise: Promise<void> } | null>(null);
  const loadedModelId = useRef<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  /** Single place that swaps the active model: persists the pick and loads the engine. */
  const activateModel = useCallback(
    async (model: ModelMetadata | null, opts?: { silent?: boolean }) => {
      if(sendLock.current || activeReplyRef.current)handleStopGeneration();
      replyEpoch.current++;
      titleService.cancel();
      if (!model) {
        setActiveModel(null);
        return;
      }
      if (modelActivation.current?.id === model.id) return modelActivation.current.promise;
      if (!modelActivation.current && loadedModelId.current === model.id && engine.getActiveModel()?.id === model.id) {
        setActiveModel(model);
        return;
      }
      const previous = modelActivation.current?.promise;
      const activation = { id: model.id, promise: Promise.resolve() };
      setActiveModel(model);
      saveSelectedModel(model).catch(() => {});
      setIsModelLoading(true);
      const promise = (async () => {
        // Serialize switches so native contexts cannot be initialized/released concurrently.
        await previous;
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
          loadedModelId.current = ok ? model.id : null;
          if (!ok && modelActivation.current === activation) setActiveModel(null);
          if (!ok && isDeviceModel && !opts?.silent && modelActivation.current === activation) {
            Alert.alert(
              'Model Load Failed',
              engine.getLastNativeError?.() ||
                'On-device GGUF could not be loaded. Rebuild with llama.rn, or use a Cloud model.'
            );
          }
        } catch (err) {
          loadedModelId.current = null;
          if (modelActivation.current === activation) setActiveModel(null);
          console.warn('[ChatScreen] Error switching model:', err);
        } finally {
          if (modelActivation.current === activation) {
            modelActivation.current = null;
            setIsModelLoading(false);
          }
        }
      })();
      activation.promise = promise;
      modelActivation.current = activation;
      return promise;
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
    initApp().catch(error=>Alert.alert('Chat storage unavailable',error?.message||'Restart Brown and check device storage.'));
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
    const task = InteractionManager.runAfterInteractions(() => { activateModel(requestedModel); });
    return () => task.cancel();
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

  const promptKokoroDownload = async (_messageId: string, _text: string) => {
    const status = await getKokoroInstallStatus();
    Alert.alert(status.engineInstalled ? 'Choose a voice' : 'Kokoro engine required',
      status.engineInstalled ? 'Your Kokoro engine is installed. Open Settings → Voice and download the voice you want to use.' : 'Install the shared Kokoro engine first. Voice profiles are downloaded separately when you choose them.',
      [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: onOpenSettings }]);
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

    const interrupted=await pendingReply.read();
    if(interrupted&&await chatRepo.getSessionById(interrupted.sessionId)){
      const existing=await chatRepo.getMessagesForSession(interrupted.sessionId);
      const completed=existing.find(message=>message.id===interrupted.id&&message.timestamp>=interrupted.timestamp);
      if(!completed&&interrupted.content.trim())await chatRepo.saveReply({...interrupted,role:'assistant',isStreaming:false});
      await pendingReply.finish(interrupted.requestId||interrupted.id);
      setSessions(await chatRepo.getAllSessions());await loadSession(interrupted.sessionId);
      if(!completed)setReplyFailure({sessionId:interrupted.sessionId,prompt:interrupted.prompt,replyId:interrupted.id,message:interrupted.content.trim()?'Reply interrupted. Your partial response was recovered.':'Reply interrupted before any output. Your message is saved.'});
    }else{if(interrupted)await pendingReply.finish(interrupted.id);setSessions(await chatRepo.getAllSessions());createNewChat();}
  };

  const createNewChat = async () => {
    replyEpoch.current++;
    titleService.cancel();
    if (activeReplyRef.current || sendLock.current) handleStopGeneration();
    setReplyFailure(null);
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
    replyEpoch.current++;
    titleService.cancel();
    if (activeReplyRef.current || sendLock.current) handleStopGeneration();
    setReplyFailure(null);
    const navigation=replyEpoch.current;
    setCurrentSessionId(sessionId);
    const session =
      sessions.find((s) => s.id === sessionId) || (await chatRepo.getSessionById(sessionId));
    if(navigation!==replyEpoch.current)return;
    currentSessionRef.current = session || null;
    sessionSavedRef.current = true;
    await replySaves.current.catch(()=>{});
    const msgs = await chatRepo.getMessagesForSession(sessionId);
    if(navigation===replyEpoch.current)setMessages(msgs);
  };

  const handleDeleteSession = async (sessionId: string) => {
    replyEpoch.current++;
    titleService.cancel();
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
    await titleService.lockManualTitle(sessionId);
    const renamed = { ...session, title, updatedAt: Date.now() };
    await chatRepo.upsertSession(renamed);
    if (currentSessionRef.current?.id === sessionId) currentSessionRef.current = renamed;
    setSessions(await chatRepo.getAllSessions());
  };

  const handleSendMessage = async (text: string, retryId?: string) => {
    text=text.trim();
    if (!text || !currentSessionId || sendLock.current || isGenerating || modelActivation.current) return;
    if (!activeModel) {
      setDraftText(text);
      Alert.alert('No model selected', 'Choose a downloaded phone model, connect to your desktop, or configure a cloud provider.');
      return;
    }
    if(chatExecutionStatus(activeModel,desktopConnected).desktop&&!desktopConnected){setDraftText(text);setReplyFailure({sessionId:currentSessionId,prompt:text,message:'Your desktop is unavailable. Reconnect or select a downloaded phone model.'});return;}

    titleService.cancel();
    const reply = ++replyEpoch.current;
    sendLock.current=true;setIsGenerating(true);setReplyFailure(null);
    requestPrompt.current=text;
    const current=()=>reply===replyEpoch.current;
    try{

    // Persist the chat to history only now that it actually has content,
    // so a fresh empty "New chat" never leaves a stub in History.
    if (!sessionSavedRef.current && currentSessionRef.current) {
      await chatRepo.upsertSession(currentSessionRef.current);
      if(!current())return;
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

    const retryUserIndex=retryId?messages.map(message=>message.role).lastIndexOf('user'):-1;
    const replay=retryUserIndex>=0&&messages[retryUserIndex].content===text;
    const newHistory = replay?messages.slice(0,retryUserIndex+1):[...messages, userMsg];
    setMessages(newHistory);
    if(!replay)await chatRepo.addMessage(userMsg);
    if(!current())return;

    // Auto-title the chat from the first meaningful user prompt
    const currentSession = currentSessionRef.current;
    if (currentSession && isDefaultSessionTitle(currentSession.title)) {
      const autoTitle = generateSessionTitle(text);
      if (autoTitle && !isDefaultSessionTitle(autoTitle)) {
        const titled = { ...currentSession, title: autoTitle, updatedAt: Date.now() };
        await chatRepo.upsertSession(titled);
        if(!current())return;
        currentSessionRef.current = titled;
      }
    }
    setSessions(await chatRepo.getAllSessions());
    if(!current())return;

    const memoryReply = replay?null:await AssistantMemory.directive(text).catch(() => 'Could not update saved memory. Please try again.');
    if(!current())return;
    if (memoryReply) {
      const reply: ChatMessage = { id: 'memory_' + Date.now(), sessionId: currentSessionId, role: 'assistant', content: memoryReply, timestamp: Date.now() };
      setMessages([...newHistory, reply]);
      await chatRepo.addMessage(reply);
      setSessions(await chatRepo.getAllSessions());
      return;
    }

    // Prepare assistant streaming placeholder — dynamic contextual status (Thinking/Searching/Analyzing → Answering)
    const assistantMsgId = replay&&retryId?retryId:'msg_ast_' + Date.now();
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
    const checkpointId=assistantMsgId+':'+reply;activeCheckpointId.current=checkpointId;
    await pendingReply.begin({id:assistantMsgId,requestId:checkpointId,sessionId:currentSessionId,prompt:text,content:'',modelId:activeModel.id,timestamp:streamingPlaceholder.timestamp});
    if(!current())return;
    setMessages([...newHistory, streamingPlaceholder]);
    setIsGenerating(true);
    replyDeadline.current=setTimeout(()=>{if(!current())return;handleStopGeneration();setReplyFailure({sessionId:currentSessionId,prompt:text,replyId:assistantMsgId,message:'This reply reached its time limit. Your message and any partial response are saved. Retry or choose a smaller model.'});},360000);

    setTimeout(() => {
      scheduleScrollToEnd(true);
    }, 60);

    // Promote to Formulating response / Answering if still waiting for the first token
    const promoteTimer = setTimeout(() => {
      if(!current())return;
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
      if(!current())return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId && m.isStreaming && !String(m.content || '').trim()
            ? { ...m, statusLabel: 'Generating answer' }
            : m
        )
      );
    }, GENERATING_PROMOTE_MS);

    try {
      let savedReply: Promise<void> | undefined;
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
          if(!current()||activeReplyRef.current?.id!==assistantMsgId)return;
          if (!receivedFirstToken) {
            receivedFirstToken = true;
            clearTimeout(promoteTimer);
            clearTimeout(secondPromoteTimer);
          }
          streamedContent += token;
          activeReplyRef.current = { ...streamingPlaceholder, content: streamedContent };
          pendingReply.update(checkpointId,streamedContent);
          // Native tokens may arrive faster than a phone can redraw Markdown.
          if (!streamUpdateTimer.current) streamUpdateTimer.current = setTimeout(() => {
            streamUpdateTimer.current = null;
            const reply = activeReplyRef.current;
            if (current()&&reply?.id === assistantMsgId) setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: reply.content, statusLabel: undefined } : m));
          }, 50);
        },
        (fullText, stats) => {
          if(!current()||activeReplyRef.current?.id!==assistantMsgId)return;
          clearReplyDeadline();
          cancelStreamUpdate();
          activeReplyRef.current = null;
          activeCheckpointId.current=null;
          clearTimeout(promoteTimer);
          clearTimeout(secondPromoteTimer);
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
          savedReply = (async () => {
            await persistReply(finalMsg,checkpointId);
            setSessions(await chatRepo.getAllSessions());
          })();
        }
      );
      if (savedReply) {
        await savedReply;
        if (reply === replyEpoch.current) {
          void titleService.regenerate(currentSessionId).then(async titled => {
            if (!titled) return;
            if (currentSessionRef.current?.id === titled.id) currentSessionRef.current = titled;
            setSessions(await chatRepo.getAllSessions());
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      if(!current())return;
      clearReplyDeadline();
      const partial=activeReplyRef.current;
      cancelStreamUpdate();
      activeReplyRef.current = null;
      activeCheckpointId.current=null;
      clearTimeout(promoteTimer);
      clearTimeout(secondPromoteTimer);
      const friendlyMsg = err?.message || 'Failed to complete generation';
      const isLoadFailure =
        /could not be loaded|not found on device|llama\.rn|native module|rebuild/i.test(
          friendlyMsg
        );
      if(partial?.content.trim())await persistReply({...partial,isStreaming:false,statusLabel:undefined},checkpointId);
      else await pendingReply.finish(checkpointId);
      if(!current())return;
      setMessages(prev=>prev.flatMap(message=>message.id!==assistantMsgId?[message]:partial?.content.trim()?[{...partial,isStreaming:false,statusLabel:undefined}]:[]));
      setReplyFailure({sessionId:currentSessionId,prompt:text,replyId:assistantMsgId,message:friendlyMsg});
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
      }
    }
    }catch(error:any){if(current()){cancelStreamUpdate();activeReplyRef.current=null;setDraftText(text);setReplyFailure({sessionId:currentSessionId,prompt:text,message:error?.message||'Could not save your message. Please try again.'});}}
    finally{if(current()){sendLock.current=false;setIsGenerating(false);}}
  };

  const handleStopGeneration = () => {
    replyEpoch.current++;
    titleService.cancel();
    cancelStreamUpdate();
    engine.stopGeneration();
    clearReplyDeadline();
    sendLock.current=false;
    const stoppedReply = activeReplyRef.current;
    const checkpointId=activeCheckpointId.current;
    activeReplyRef.current = null;
    activeCheckpointId.current=null;
    if (stoppedReply?.content.trim()) {
      persistReply({ ...stoppedReply, isStreaming: false, statusLabel: undefined },checkpointId||stoppedReply.id)
        .then(() => chatRepo.getAllSessions()).then(setSessions)
        .catch((error) => console.warn('[Chat] Could not save stopped reply', error));
    }
    else if(stoppedReply)void pendingReply.finish(checkpointId||stoppedReply.id).catch(()=>{});
    setIsGenerating(false);
    setMessages((prev) =>
      prev.flatMap((m) =>
        m.isStreaming
          ? (stoppedReply?.id===m.id?stoppedReply.content:m.content)?.trim()?[{
              ...m,
              isStreaming: false,
              statusLabel: undefined,
              content: (stoppedReply?.id === m.id ? stoppedReply.content : m.content),
            }]:[]
          : [m]
      )
    );
    if(stoppedReply)setReplyFailure({sessionId:stoppedReply.sessionId,prompt:requestPrompt.current,replyId:stoppedReply.id,message:stoppedReply.content.trim()?'Stopped. Your partial response is kept.':'Stopped before any output. You can retry this message.'});
  };

  const [voiceInsertText, setVoiceInsertText] = useState<string | null>(null);
  const [voicePartial, setVoicePartial] = useState('');
  useEffect(() => () => { SpeechToTextService.cancelListening().catch(() => {}); }, []);
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
      setIsListening(SpeechToTextService.getIsListening());
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
    speechRequest.current++;
    TextToSpeechService.stop();
    setSpeakingMessageId(null);
    setTtsLoading(false);
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
    const request = ++speechRequest.current;
    TextToSpeechService.stop();
    if (speakingMessageId === messageId) {
      setSpeakingMessageId(null);
      setTtsLoading(false);
      setTtsPaused(false);
      return;
    }
    setSpeakingMessageId(messageId);
    setTtsLoading(true);
    setTtsPaused(false);
    try {
      await TextToSpeechService.speak(text, () => {
        if (request !== speechRequest.current) return;
        setSpeakingMessageId(null);
        setTtsLoading(false);
        setTtsPaused(false);
      }, status => {
        if (request === speechRequest.current) setTtsLoading(status === 'loading');
      });
    } catch (err) {
      if (request !== speechRequest.current) return;
      setSpeakingMessageId(null);
      setTtsLoading(false);
      setTtsPaused(false);
      if (err instanceof KokoroNotInstalledError) {
        promptKokoroDownload(messageId, text);
      } else {
        Alert.alert('Speech Error', (err as any)?.message || 'Unable to speak this message.');
      }
    }
  }, [speakingMessageId]);

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
        isLoadingSpeech={speakingMessageId === item.id && ttsLoading}
      />
    ),
    [handleCopy, handleSpeakText, speakingMessageId, isSpeaking, ttsPaused, ttsLoading]
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
      <Pressable accessibilityRole="button" accessibilityLabel={executionStatus.label+'. '+executionStatus.detail}
        onPress={()=>executionStatus.desktop?onOpenDesktopSync():Alert.alert(executionStatus.label,executionStatus.detail)}
        style={styles.executionStatus}>
        <View style={[styles.executionDot,{backgroundColor:executionStatus.desktop&&!desktopConnected?'#f5b75c':'#78b4ff'}]}/>
        <Text style={styles.executionLabel}>{executionStatus.label}</Text>
      </Pressable>
      {replyFailure?.sessionId===currentSessionId&&<View style={styles.replyNotice} accessibilityLiveRegion="polite">
        <Text style={styles.replyNoticeText} numberOfLines={3}>{replyFailure.message}</Text>
        {replyFailure.replyId&&<Pressable accessibilityRole="button" accessibilityLabel="Retry interrupted reply" disabled={isGenerating||isModelLoading}
          onPress={()=>handleSendMessage(replyFailure.prompt,replyFailure.replyId)} style={styles.replyRetry}><Text style={styles.replyRetryText}>Retry</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss reply notice" onPress={()=>setReplyFailure(null)} hitSlop={8} style={styles.replyDismiss}><Text style={{color:'#fff',fontSize:22}}>×</Text></Pressable>
      </View>}
      {isModelLoading && <Text accessibilityLiveRegion="polite" style={{ color: '#ffffff', fontSize: 12, textAlign: 'center', paddingVertical: 6 }}>Loading model…</Text>}
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
        disabled={isModelLoading}
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
        onOpenDownloads={() => setShowDownloads(true)}
        onOpenSync={onOpenDesktopSync}
        onOpenSettings={() => {
          setIsSidebarOpen(false);
          onOpenSettings();
        }}
        onClose={() => setIsSidebarOpen(false)}
      />

      <DownloadsModal visible={showDownloads} onClose={() => setShowDownloads(false)} />
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
  executionStatus:{flexDirection:'row',alignItems:'center',alignSelf:'center',gap:6,paddingHorizontal:12,paddingVertical:7,minHeight:32},
  executionDot:{width:6,height:6,borderRadius:3},
  executionLabel:{color:'#c5c7ce',fontSize:11,fontFamily:'Outfit_400Regular'},
  replyNotice:{flexDirection:'row',alignItems:'center',gap:10,marginHorizontal:16,marginBottom:6,paddingHorizontal:12,paddingVertical:10,backgroundColor:'#242528',borderRadius:14},
  replyNoticeText:{flex:1,color:'#fff',fontSize:13,fontFamily:'Outfit_400Regular'},
  replyRetry:{paddingHorizontal:13,paddingVertical:10,borderRadius:18,backgroundColor:'#287cff',minHeight:40,justifyContent:'center'},
  replyRetryText:{color:'#fff',fontSize:13,fontFamily:'Outfit_500Medium'},
  replyDismiss:{minWidth:36,minHeight:40,alignItems:'center',justifyContent:'center'},
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
