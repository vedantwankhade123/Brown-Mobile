import { VoiceDownloadIcon } from '../components/VoiceDownloadIcon';
import { BrownButton as TouchableOpacity } from '../components/ButtonSurface';
import { PreferencesScreen } from './PreferencesScreen';
import { MAX_BACKUP_BYTES, validateBackup, restoreBackup } from '../services/storage/BackupService';
import * as DocumentPicker from 'expo-document-picker';
import { StorageLocationControl } from '../components/StorageLocationControl';
import { AssistantMemory } from '../services/storage/AssistantMemory';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  
  TextInput,
  SafeAreaView,
  Alert,
  Platform,
  Linking,
  Animated,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';

const Easing = (Animated as any).Easing || {
  inOut: (fn: any) => fn,
  out: (fn: any) => fn,
  in: (fn: any) => fn,
  cubic: (t: any) => t,
  ease: (t: any) => t,
};
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService, ConsentRecord } from '../services/storage/ConsentService';
import { SoundService } from '../services/sound/SoundService';
import { getNotificationPermission, requestNotificationPermission, sendTestNotification } from '../services/NotificationService';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { saveGeminiApiKey, getGeminiApiKey, discoverGeminiModels, getCachedGeminiModels } from '../services/inference/GeminiClient';
import {
  CLOUD_PROVIDERS,
  CLOUD_PROVIDER_IDS,
  CloudProviderId,
  getProviderApiKey,
  saveProviderApiKey,
  deleteProviderApiKey,
  getCustomEndpointUrl,
  saveCustomEndpointUrl,
  clearCustomEndpointUrl,
  getProviderModels,
  getConfiguredCloudModels,
  testProviderConnection,
} from '../services/inference/CloudProviders';
import { LlamaEngine } from '../services/inference/LlamaEngine';
import { HeaderFade } from '../components/HeaderFade';
import { HeaderTitle, headerButtonStyle, GlassControl, GlassSurface, ScreenHeader, useStickyHeader } from '../components/ScreenHeader';
import { HuggingFaceLogo } from '../components/HuggingFaceLogo';
import {
  UpdatePromptModal,
  parseReleaseNotes,
  formatBytes,
  formatReleaseDate,
  stripV,
} from '../components/UpdatePromptModal';
import { UpdateHero } from '../components/UpdateHero';
import { EmptyState } from '../components/EmptyState';
import { animateOnce, revealValues } from '../utils/motion';
import { useBackLayer } from '../utils/backStack';
import { saveSelectedModel } from '../services/modelManager/ModelSelection';
import {
  AppUpdateInfo,
  checkForAppUpdate,
  getAutoCheckEnabled,
  getCurrentAppVersion,
  setAutoCheckEnabled,
} from '../services/updater/GitHubUpdateService';
import {
  KOKORO_VOICES,
  KokoroVoiceId,
  cancelKokoroDownload,
  deleteKokoroAssets,
  downloadKokoroOnboardingDefaults,
  downloadKokoroEngine,
  downloadKokoroVoice,
  isKokoroVoiceInstalled,
  KokoroInstallStatus,
  KokoroDownloadProgress,
  getActiveKokoroVoice,
  getKokoroInstallStatus,
  getKokoroDownloadState,
  setActiveKokoroVoice,
} from '../services/voice/KokoroTtsService';
import { SpeechToTextService } from '../services/voice/SpeechToText';
import { TextToSpeechService } from '../services/voice/TextToSpeech';
import { typography, spacing, borderRadius } from '../theme/typography';
import {
  SearchIcon,
  CloseIcon,
  ArrowUpRightIcon,
  ShieldCheckIcon,
  CpuIcon,
  TrashIcon,
  LaptopIcon,
  UserIcon,
  MicIcon,
  SparklesIcon,
  PencilIcon,
  HelpCircleIcon,
  LockIcon,
  ZapIcon,
  IdCardIcon,
  SlidersIcon,
  CalendarIcon,
  ChevronLeftIcon,
  BackArrowIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  VolumeIcon,
  DatabaseIcon,
  DownloadIcon,
  GlobeIcon,
  WifiIcon,
  InstagramIcon,
  MailIcon,
  WindowsIcon,
  AndroidIcon,
  SyncArrowsIcon,
  SoftwareUpdateIcon,
  AboutUltronIcon,
  ChatIcon,
} from '../components/Icons';
import { getInstalledDeviceModels } from '../services/modelManager/ModelCatalog';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { ModelMetadata } from '../types/model';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { pickStorageFolder } from '../utils/storageFolderPicker';
import { StoragePaths } from '../services/storage/StoragePaths';
import { ProfileService } from '../services/storage/ProfileService';
import { LegalDocumentScreen } from './LegalDocumentScreen';
import { HelpSupportScreen } from './HelpSupportScreen';
import { DesktopSyncService } from '../services/sync/DesktopSync';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SettingsView =
  | 'main'
  | 'account'
  | 'edit_profile'
  | 'models'
  | 'sounds'
  | 'voice'
  | 'preferences'
  | 'storage'
  | 'data_sync'
  | 'updates'
  | 'help'
  | 'privacy'
  | 'terms'
  | 'about';
// Legal documents share one screen and the app's reusable header treatment.

// RN needs static require() paths — map each Kokoro voiceId to its bundled portrait.
const PERSONA_IMAGES: Record<KokoroVoiceId, number> = {
  af_heart: require('../../Assets/personas/heart_sound.png'),
  am_michael: require('../../Assets/personas/michael_sound.png'),
  bm_george: require('../../Assets/personas/george_sound.png'),
  bm_lewis: require('../../Assets/personas/lewis_sound.png'),
};

function VoiceCardIcon({ kind }: { kind: 'play' | 'stop' | 'star' | 'check' }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'play' ? <Path d="M7 4L21 12L7 20Z" fill="#ffffff" stroke="none" /> :
        kind === 'stop' ? <Path d="M5 5H19V19H5Z" fill="#ffffff" stroke="none" /> :
        kind === 'star' ? <Path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" /> :
        <><Circle cx={12} cy={12} r={9} /><Path d="m8 12 3 3 7-8" /></>}
    </Svg>
  );
}

const kokoroLabel = (id: KokoroVoiceId) =>
  KOKORO_VOICES.find((v) => v.voiceId === id)?.label ?? 'Heart';

interface SettingsScreenProps {
  // ScreenTransition keeps every visited screen mounted, so this is the only signal that
  // the page is actually on top again.
  isActive?: boolean;
  onBack: () => void;
  onClearHistory: () => void;
  onDeleteAccount: () => void;
  onRerunOnboarding?: () => void;
  onOpenModelStore?: () => void;
  onOpenDesktopSync?: () => void;
}

const MONTHS_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MODEL_TAG_FILTERS = ['All', 'Cloud', 'Offline', 'Thinking', 'Vision', 'Code', 'Embedding'];


// Hands a written file to the system viewer through a content URI, the same route the
// APK installer uses; without it the backup is only reachable through a file manager.
const openExportedFile = async (path: string): Promise<void> => {
  const FileSystem = require('expo-file-system');
  const IntentLauncher = require('expo-intent-launcher');
  if (!IntentLauncher?.startActivityAsync || !FileSystem?.getContentUriAsync) {
    throw new Error('No file viewer is available.');
  }
  const contentUri = await FileSystem.getContentUriAsync(path);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: 'application/json',
  });
};

// Hoverable settings row with subtle bg highlight on hover
const HoverableSettingsRow: React.FC<{
  onPress: () => void;
  children: React.ReactNode;
}> = ({ onPress, children }) => {
  const [isHovered, setIsHovered] = useState(false);
  const hoverProps = Platform.OS === 'web' ? {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  } : {};
  return (
    <TouchableOpacity
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 56,
          paddingVertical: 10,
          paddingHorizontal: 18,
        },
        isHovered && { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      {...(hoverProps as any)}
    >
      {children}
    </TouchableOpacity>
  );
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  isActive = true,
  onBack,
  onClearHistory,
  onDeleteAccount,
  onOpenModelStore,
  onOpenDesktopSync,
}) => {
  const [profile, setProfile] = useState<ConsentRecord | null>(null);
  const [viewHistory, setViewHistory] = useState<SettingsView[]>(['main']);
  const currentView = viewHistory[viewHistory.length - 1] || 'main';
  const [searchQuery, setSearchQuery] = useState('');
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);

  // Smooth Screen Slide & Fade Animation
  const screenSlideAnim = useRef(new Animated.Value(20)).current;
  const screenFadeAnim = useRef(new Animated.Value(0)).current;

  // One UI style sticky header: gains background once content scrolls under it
  const { onScroll: settingsScroll, scrolled: settingsScrolled } = useStickyHeader();

  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBirthdate, setEditBirthdate] = useState('');
  // DOB Calendar Popover State for Full-Page Edit Profile
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarView, setCalendarView] = useState<'days' | 'months' | 'years'>('days');
  const [currentYear, setCurrentYear] = useState(2005);
  const [currentMonth, setCurrentMonth] = useState(0);
  const [selectedDay, setSelectedDay] = useState(14);

  // Models State (Desktop Connectors & Weights Parity)
  const [selectedModelId, setSelectedModelId] = useState('');
  const [activeModelFilter, setActiveModelFilter] = useState('All');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGeminiKeyInput, setShowGeminiKeyInput] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [geminiDiscovering, setGeminiDiscovering] = useState(false);
  const [liveGeminiModels, setLiveGeminiModels] = useState<ModelMetadata[]>([]);
  const [modelsRevision, setModelsRevision] = useState(0);

  // Cloud Providers State (OpenAI, Claude, DeepSeek, Groq, Custom)
  const [cloudKeys, setCloudKeys] = useState<Record<CloudProviderId, string>>({
    openai: '',
    anthropic: '',
    deepseek: '',
    groq: '',
    custom: '',
  });
  const [showCloudKeyInput, setShowCloudKeyInput] = useState<Record<CloudProviderId, boolean>>({
    openai: false,
    anthropic: false,
    deepseek: false,
    groq: false,
    custom: false,
  });
  const [cloudConnected, setCloudConnected] = useState<Record<CloudProviderId, boolean>>({
    openai: false,
    anthropic: false,
    deepseek: false,
    groq: false,
    custom: false,
  });
  const [cloudDiscovering, setCloudDiscovering] = useState<Record<CloudProviderId, boolean>>({
    openai: false,
    anthropic: false,
    deepseek: false,
    groq: false,
    custom: false,
  });
  const [liveCloudModels, setLiveCloudModels] = useState<Record<CloudProviderId, ModelMetadata[]>>({
    openai: [],
    anthropic: [],
    deepseek: [],
    groq: [],
    custom: [],
  });
  const [customEndpointUrlInput, setCustomEndpointUrlInput] = useState('http://localhost:1234/v1');

  // Agent Sounds & Speech States (Desktop Parity)
  const [autoSpeakTts, setAutoSpeakTts] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voiceSensitivity, setVoiceSensitivity] = useState('Balanced');
  const [completionSound, setCompletionSound] = useState(() => SoundService.isSoundEnabled('task-complete'));
  const [permissionSound, setPermissionSound] = useState(() => SoundService.isSoundEnabled('permission'));
  const [questionSound, setQuestionSound] = useState(() => SoundService.isSoundEnabled('question'));
  const [notifGranted, setNotifGranted] = useState(true);
  // The page ScrollViews sit inside a SafeAreaView, so their bottom edge already clears the system
  // nav bar — the keyboard height alone is what covers them.
  const keyboardInset = useKeyboardInset(0);
  const scrollStyle = useMemo(
    () => [styles.scrollContainer, keyboardInset > 0 && { paddingBottom: keyboardInset }],
    [keyboardInset]
  );
  const [requestingNotif, setRequestingNotif] = useState(false);
  const [testingNotif, setTestingNotif] = useState(false);
  const [testNotifResult, setTestNotifResult] = useState('');

  // Re-read on every visit: the answer lives in the system settings, which the user can
  // change without the app ever unmounting.
  useEffect(() => {
    if (currentView !== 'sounds') return;
    getNotificationPermission().then(setNotifGranted).catch(() => {});
  }, [currentView]);

  // Storage & Memory States (Desktop Parity)
  const [memoryPersistence, setMemoryPersistence] = useState(true);
  const [savedPreferences, setSavedPreferences] = useState<string[]>([]);
  useEffect(() => {
    if (isActive) { AssistantMemory.enabled().then(setMemoryPersistence); AssistantMemory.list().then(setSavedPreferences); }
  }, [isActive, currentView]);
  const [customDataDir, setCustomDataDir] = useState('/data/user/0/com.ultron.mobile/files');
  const [customConnectorsDir, setCustomConnectorsDir] = useState('/data/user/0/com.ultron.mobile/models');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [autoConnectWifi, setAutoConnectWifi] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);

  // Software Updates State (Desktop Parity)
  const [updateStatus, setUpdateStatus] = useState<'up-to-date' | 'checking' | 'available' | 'error'>('up-to-date');
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [latestUpdateInfo, setLatestUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showAllUpdateNotes, setShowAllUpdateNotes] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const currentAppVersion = getCurrentAppVersion();
  const [kokoroVoice, setKokoroVoice] = useState<KokoroVoiceId>('af_heart');
  const [kokoroInstalled, setKokoroInstalled] = useState(false);
  const [kokoroBusy, setKokoroBusy] = useState(false);
  const [kokoroStatus, setKokoroStatus] = useState<KokoroInstallStatus | null>(null);
  const [activeVoiceDownload, setActiveVoiceDownload] = useState<string | null>(null);
  const [showVoiceDownloads, setShowVoiceDownloads] = useState(false);
  const [voiceDownloads, setVoiceDownloads] = useState<Record<string, KokoroDownloadProgress>>({});
  const [engineDownloadedBanner, setEngineDownloadedBanner] = useState(false);
  const engineBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (engineBannerTimer.current) clearTimeout(engineBannerTimer.current); }, []);
  const [voiceGridWidth, setVoiceGridWidth] = useState(0);
  const [kokoroProgress, setKokoroProgress] = useState('');
  useEffect(() => {
    if (currentView !== 'voice' || !isActive) return;
    let disposed = false, checking = false;
    const refresh = async () => {
      if (checking) return;
      checking = true;
      try {
        const status = await getKokoroInstallStatus();
        if (disposed) return;
        setKokoroStatus(status);
        setKokoroInstalled(KOKORO_VOICES.some(v => isKokoroVoiceInstalled(status, v.voiceId)));
        const state = getKokoroDownloadState();
        setKokoroBusy(state.busy);
        setActiveVoiceDownload(state.task);
        if (state.task && state.progress) setVoiceDownloads(previous => ({ ...previous, [state.task!]: state.progress! }));
      } catch {} finally { checking = false; }
    };
    refresh(); const timer = setInterval(refresh, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [currentView, isActive]);
  const [previewingVoice, setPreviewingVoice] = useState<KokoroVoiceId | null>(null);
  const [desktopSyncStatus, setDesktopSyncStatus] = useState<{ isConnected: boolean; deviceName: string }>({
    isConnected: false,
    deviceName: '',
  });
  const [whisperStatus, setWhisperStatus] = useState<{ checked: boolean; ready: boolean }>({
    checked: false,
    ready: false,
  });
  const [nativeSpeech, setNativeSpeech] = useState(false);

  useEffect(() => {
    if (currentView !== 'sounds') return;
    // Sync native call, so it runs once per visit rather than on every render.
    const onDevice = SpeechToTextService.getPreferredEngine() === 'native';
    setNativeSpeech(onDevice);
    if (onDevice || !desktopSyncStatus.isConnected) {
      setWhisperStatus({ checked: false, ready: false });
      return;
    }
    let alive = true;
    DesktopSyncService.getInstance()
      .getDesktopSttStatus()
      .then((s) => {
        if (alive) setWhisperStatus({ checked: true, ready: !!s.ok && !!s.ready });
      });
    return () => {
      alive = false;
    };
  }, [currentView, desktopSyncStatus.isConnected]);

  const chatRepo = new ChatRepository();

  // Trigger smooth enter animation on screen change.
  // JS driver on purpose: a native-driver fade whose end event is lost leaves the whole
  // page pinned at opacity 0 (black screen) that no setValue can reclaim.
  // isActive is part of the key because the page owns its own exit fade to 0 and stays
  // mounted: without re-revealing on every visit, the second visit rendered transparent.
  useEffect(() => {
    if (!isActive) return;
    revealValues(
      [
        { value: screenSlideAnim, from: 12, to: 0 },
        { value: screenFadeAnim, from: 0, to: 1 },
      ],
      180,
      undefined,
      false
    );
  }, [isActive, currentView, screenSlideAnim, screenFadeAnim]);

  useEffect(() => {
    loadConsentProfile();
    loadGeminiKey();
    loadAllCloudKeys();
    loadStorageAndSyncPrefs();
    getAutoCheckEnabled()
      .then(setAutoCheckUpdates)
      .catch(() => {});
    getActiveKokoroVoice()
      .then(setKokoroVoice)
      .catch(() => {});
    getKokoroInstallStatus()
      .then((s) => { setKokoroStatus(s); setKokoroInstalled(KOKORO_VOICES.some(v => isKokoroVoiceInstalled(s, v.voiceId))); })
      .catch(() => {});
    const active = LlamaEngine.getInstance().getActiveModel();
    if (active) setSelectedModelId(active.id);
    const downloader = ModelDownloader.getInstance();
    downloader.whenReady().then(() => setModelsRevision((n) => n + 1));
    const unsubDownloader = downloader.subscribe(() => {
      setModelsRevision((n) => n + 1);
    });

    const sync = DesktopSyncService.getInstance();
    const updateSyncState = (st: any) => {
      setDesktopSyncStatus({
        isConnected: !!st?.isConnected,
        deviceName: st?.activeDesktop?.name || '',
      });
    };
    updateSyncState(sync.getStatus());
    const unsubSync = sync.subscribe(updateSyncState);

    return () => {
      unsubDownloader();
      unsubSync();
    };
  }, []);

  const loadStorageAndSyncPrefs = async () => {
    try {
      await StoragePaths.ensureLayout();
      setCustomDataDir(StoragePaths.displayPath(await StoragePaths.getDataDir()));
      setCustomConnectorsDir(StoragePaths.displayPath(await StoragePaths.getModelsDir()));
      const profile = await ProfileService.getLocalProfile();
      setSystemPrompt(profile.systemPrompt || '');
      const sync = DesktopSyncService.getInstance();
      setAutoConnectWifi(await sync.isAutoConnectEnabled());
    } catch {}
  };

  const loadConsentProfile = async () => {
    try {
      const data = await ConsentService.getLatestConsent();
      if (data) {
        setProfile(data);
        setEditName(data.fullName || '');
        setEditEmail(data.email || '');
        setEditBirthdate(data.birthdate || '');
        parseDateToCalendar(data.birthdate);
      } else {
        setEditName('');
        setEditEmail('');
        setEditBirthdate('');
      }
    } catch {}
  };

  const loadGeminiKey = async () => {
    try {
      const key = await getGeminiApiKey();
      if (key) {
        setGeminiApiKey(key);
        setIsGeminiConnected(true);
        const cached = await getCachedGeminiModels();
        if (cached.length) setLiveGeminiModels(cached);
        discoverGeminiModels(key)
          .then(setLiveGeminiModels)
          .catch(() => {});
      }
    } catch {}
  };

  const loadAllCloudKeys = async () => {
    try {
      const keysObj: Record<CloudProviderId, string> = {
        openai: '',
        anthropic: '',
        deepseek: '',
        groq: '',
        custom: '',
      };
      const connObj: Record<CloudProviderId, boolean> = {
        openai: false,
        anthropic: false,
        deepseek: false,
        groq: false,
        custom: false,
      };
      const modelsObj: Record<CloudProviderId, ModelMetadata[]> = {
        openai: [],
        anthropic: [],
        deepseek: [],
        groq: [],
        custom: [],
      };

      for (const pId of CLOUD_PROVIDER_IDS) {
        if (pId === 'custom') {
          const url = await getCustomEndpointUrl();
          const key = await getProviderApiKey('custom');
          keysObj.custom = key;
          setCustomEndpointUrlInput(url || CLOUD_PROVIDERS.custom.defaultUrl || 'http://localhost:1234/v1');
          connObj.custom = Boolean(url);
          if (url) {
            modelsObj.custom = await getProviderModels('custom');
          }
        } else {
          const key = await getProviderApiKey(pId);
          keysObj[pId] = key;
          connObj[pId] = Boolean(key);
          if (key) {
            modelsObj[pId] = await getProviderModels(pId);
          }
        }
      }
      setCloudKeys(keysObj);
      setCloudConnected(connObj);
      setLiveCloudModels(modelsObj);
    } catch {}
  };

  const saveGeminiKey = async () => {
    const key = geminiApiKey.trim();
    if (!key) {
      Alert.alert('API key required', 'Paste a Gemini API key from Google AI Studio.');
      return;
    }
    try {
      setGeminiDiscovering(true);
      const models = await discoverGeminiModels(key);
      await saveGeminiApiKey(key);
      setLiveGeminiModels(models);
      setIsGeminiConnected(true);
      setShowGeminiKeyInput(false);
      try {
        const sync = DesktopSyncService.getInstance();
        if (sync.getStatus().isConnected) {
          await sync.pushProfile({ geminiApiKey: key });
        }
      } catch {}
      Alert.alert('Gemini connected', `${models.length} chat model${models.length === 1 ? '' : 's'} available for this key.`);
    } catch (err: any) {
      setIsGeminiConnected(false);
      Alert.alert('Could not use this key', err?.message || 'Check the API key and try again.');
    } finally {
      setGeminiDiscovering(false);
    }
  };

  const disconnectGemini = () => {
    Alert.alert('Disconnect Google Gemini', 'Remove the Gemini API key from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await saveGeminiApiKey('');
          setGeminiApiKey('');
          setIsGeminiConnected(false);
          setLiveGeminiModels([]);
          setShowGeminiKeyInput(false);
          setModelsRevision((n) => n + 1);
        },
      },
    ]);
  };

  const saveCloudProviderKey = async (providerId: CloudProviderId) => {
    const key = (cloudKeys[providerId] || '').trim();
    const customUrl = customEndpointUrlInput.trim();

    if (providerId === 'custom' && !customUrl) {
      Alert.alert('URL required', 'Enter a custom server URL (e.g. http://localhost:1234/v1).');
      return;
    }
    if (providerId !== 'custom' && !key) {
      Alert.alert('API key required', `Paste an API key for ${CLOUD_PROVIDERS[providerId].name}.`);
      return;
    }

    try {
      setCloudDiscovering((prev) => ({ ...prev, [providerId]: true }));
      await testProviderConnection(providerId, key, customUrl);

      if (providerId === 'custom') {
        await saveCustomEndpointUrl(customUrl);
        if (key) await saveProviderApiKey('custom', key);
      } else {
        await saveProviderApiKey(providerId, key);
      }

      const models = await getProviderModels(providerId);
      setLiveCloudModels((prev) => ({ ...prev, [providerId]: models }));
      setCloudConnected((prev) => ({ ...prev, [providerId]: true }));
      setShowCloudKeyInput((prev) => ({ ...prev, [providerId]: false }));
      setModelsRevision((n) => n + 1);

      Alert.alert(
        `${CLOUD_PROVIDERS[providerId].name} Connected`,
        `${models.length} model${models.length === 1 ? '' : 's'} available.`
      );
    } catch (err: any) {
      setCloudConnected((prev) => ({ ...prev, [providerId]: false }));
      Alert.alert('Connection Failed', err?.message || 'Could not connect. Check credentials and URL.');
    } finally {
      setCloudDiscovering((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const disconnectCloudProvider = (providerId: CloudProviderId) => {
    Alert.alert(
      `Disconnect ${CLOUD_PROVIDERS[providerId].name}`,
      'Remove credentials and reset connection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (providerId === 'custom') {
              await clearCustomEndpointUrl();
              await deleteProviderApiKey('custom');
              setCustomEndpointUrlInput(CLOUD_PROVIDERS.custom.defaultUrl || 'http://localhost:1234/v1');
            } else {
              await deleteProviderApiKey(providerId);
            }
            setCloudKeys((prev) => ({ ...prev, [providerId]: '' }));
            setCloudConnected((prev) => ({ ...prev, [providerId]: false }));
            setLiveCloudModels((prev) => ({ ...prev, [providerId]: [] }));
            setShowCloudKeyInput((prev) => ({ ...prev, [providerId]: false }));
            setModelsRevision((n) => n + 1);
          },
        },
      ]
    );
  };

  const parseDateToCalendar = (dateStr?: string) => {
    if (!dateStr) return;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d)) setSelectedDay(d);
      if (!isNaN(m) && m >= 0 && m <= 11) setCurrentMonth(m);
      if (!isNaN(y)) setCurrentYear(y);
    }
  };

  // Settings owns the back button while it is on screen: pop the internal view
  // history first, then hand control back to the app-level screen stack. Registering
  // unconditionally kept stealing the back button from chat after one visit.
  useBackLayer(isActive, () => {
    handleSmoothBack();
    return true;
  });

  const handleSmoothBack = () => {
    if (viewHistory.length > 1) {
      animateOnce(
        [
          Animated.timing(screenSlideAnim, {
            toValue: 12,
            duration: 140,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(screenFadeAnim, {
            toValue: 0,
            duration: 140,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: false,
          }),
        ],
        140,
        () => {
          setViewHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : ['main']));
        }
      );
      return;
    }

    animateOnce(
      [
        Animated.timing(screenSlideAnim, {
          toValue: 16,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(screenFadeAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
      ],
      150,
      () => {
        onBack();
      }
    );
  };

  const navigateToView = (view: SettingsView) => {
    if (view === 'data_sync' && onOpenDesktopSync) { onOpenDesktopSync(); return; }
    animateOnce(
      [
        Animated.timing(screenSlideAnim, {
          toValue: -10,
          duration: 130,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(screenFadeAnim, {
          toValue: 0,
          duration: 130,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
      ],
      130,
      () => {
        setViewHistory((prev) => (prev[prev.length - 1] === view ? prev : [...prev, view]));
      }
    );
  };

  const handleBirthdateInput = (val: string) => {
    const digitsOnly = val.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (digitsOnly.length <= 2) {
      formatted = digitsOnly;
    } else if (digitsOnly.length <= 4) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
    } else {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4, 8)}`;
    }

    setEditBirthdate(formatted);

    if (digitsOnly.length === 8) {
      const d = parseInt(digitsOnly.slice(0, 2), 10);
      const m = parseInt(digitsOnly.slice(2, 4), 10) - 1;
      const y = parseInt(digitsOnly.slice(4, 8), 10);
      if (d >= 1 && d <= 31 && m >= 0 && m <= 11 && y >= 1900 && y <= 2026) {
        setSelectedDay(d);
        setCurrentMonth(m);
        setCurrentYear(y);
      }
    }
  };

  const selectDay = (day: number) => {
    setSelectedDay(day);
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const monthStr = currentMonth + 1 < 10 ? `0${currentMonth + 1}` : `${currentMonth + 1}`;
    setEditBirthdate(`${dayStr}/${monthStr}/${currentYear}`);
    setShowDatePicker(false);
  };

  const handleSaveProfile = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Please enter your name.');
      return;
    }

    const updated = await ConsentService.recordConsent({
      fullName: trimmedName,
      email: editEmail.trim(),
      birthdate: editBirthdate.trim() || 'Not specified',
      agreedToTerms: true,
      agreedToPrivacyPolicy: true,
    });

    setProfile(updated);
    await ProfileService.applyProfile({
      displayName: trimmedName,
      email: editEmail.trim(),
      systemPrompt,
    });
    try {
      const sync = DesktopSyncService.getInstance();
      if (sync.getStatus().isConnected) {
        await sync.pushProfile({
          displayName: trimmedName,
          email: editEmail.trim(),
          systemPrompt,
          geminiApiKey,
        });
      }
    } catch {}
    handleSmoothBack();
    Alert.alert('Profile Updated', 'Your profile details have been saved securely on-device.');
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear All Local Chats',
      'This will permanently delete all conversation sessions and messages stored in local SQLite on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Data',
          style: 'destructive',
          onPress: async () => {
            await chatRepo.clearAllHistory();
            onClearHistory();
            handleSmoothBack();
            Alert.alert('Database Cleared', 'All local conversation histories have been erased.');
          },
        },
      ]
    );
  };

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const confirmDeleteAccount = () => Alert.alert(
    'Delete local account?',
    'This permanently removes your profile, chats, saved preferences, API credentials, desktop pairing, downloaded models and private app files and caches. Brown will restart at onboarding.\n\nThis cannot be undone. Exported backups and copies on other devices or online services are not deleted.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Account', style: 'destructive', onPress: onDeleteAccount },
    ]
  );

  const handleImportData = async () => {
    if (importing || exporting) return;
    setImporting(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) { setImporting(false); return; }
      const file = picked.assets[0];
      const FileSystem = require('expo-file-system');
      const info = await FileSystem.getInfoAsync(file.uri);
      if ((file.size || info.size || 0) > MAX_BACKUP_BYTES) throw new Error('Choose a backup smaller than 10 MB.');
      const backup = validateBackup(await FileSystem.readAsStringAsync(file.uri));
      Alert.alert('Import Backup', `${backup.sessions.length} conversations, ${backup.messageCount} messages and ${backup.preferences.length} saved preferences.\n\nMerge with existing data? Duplicates will be skipped. Your memory toggle stays unchanged.`, [
        { text: 'Cancel', style: 'cancel', onPress: () => setImporting(false) },
        { text: 'Import', onPress: async () => {
          try {
            const result = await restoreBackup(backup);
            setSavedPreferences(await AssistantMemory.list());
            Alert.alert('Backup Imported', `Added ${result.sessions} conversations, ${result.messages} messages and ${result.preferences} preferences. If an import is interrupted, choosing the same backup again skips existing entries.`);
          } catch (err: any) { Alert.alert('Import Failed', err?.message || 'Could not restore backup. You can retry the same file.'); }
          finally { setImporting(false); }
        } },
      ]);
    } catch (err: any) {
      setImporting(false);
      Alert.alert('Import Failed', err?.message || 'The backup could not be read.');
    }
  };

  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const bundle = await chatRepo.exportAll();
      const json = JSON.stringify(
        { app: 'Brown', schemaVersion: 1, platform: 'android', exportedAt: new Date().toISOString(), ...bundle, assistantMemory: { enabled: await AssistantMemory.enabled(), preferences: await AssistantMemory.list() } },
        null,
        2
      );
      const FileSystem = require('expo-file-system');
      const base = FileSystem?.documentDirectory;
      if (!base || !FileSystem.writeAsStringAsync) {
        throw new Error('This device is not exposing app storage, so the backup cannot be written.');
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const path = `${base}Brown_Backup_${stamp}.json`;
      await FileSystem.writeAsStringAsync(path, json);
      const info = await FileSystem.getInfoAsync(path);
      if (!info?.exists) throw new Error('The backup file was not created.');

      const sizeKb = Math.max(1, Math.round((info.size || json.length) / 1024));
      const summary = `${bundle.sessions.length} conversation${
        bundle.sessions.length === 1 ? '' : 's'
      } and ${bundle.messages.length} messages · ${sizeKb} KB\n\nSaved to ${StoragePaths.displayPath(path)}`;

      Alert.alert('Backup Exported', summary, [
        { text: 'Done', style: 'cancel' },
        {
          text: 'Save a copy',
          onPress: async () => {
            try {
              const folder = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
              if (!folder.granted) return;
              const destination = await FileSystem.StorageAccessFramework.createFileAsync(folder.directoryUri, `Brown_Backup_${stamp}.json`, 'application/json');
              await FileSystem.writeAsStringAsync(destination, json);
              Alert.alert('Backup Saved', 'Your backup is ready to import from the folder you chose.');
            } catch (err: any) {
              Alert.alert('Save Failed', err?.message || 'Could not save the backup to that folder.');
            }
          },
        },
        {
          text: 'Open',
          onPress: () => {
            openExportedFile(path).catch(() =>
              Alert.alert(
                'Cannot Open',
                'No app on this phone can display the backup. It is still saved at the path shown above.'
              )
            );
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'The backup could not be written to storage.');
    } finally {
      setExporting(false);
    }
  };

  const handleCheckUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const info = await checkForAppUpdate();
      setLatestUpdateInfo(info);
      if (info.available) {
        setUpdateStatus('available');
        setShowUpdateModal(true);
      } else {
        setUpdateStatus('up-to-date');
        Alert.alert('Software Update', `Brown Mobile v${info.currentVersion} is up to date.`);
      }
    } catch (e: any) {
      setUpdateStatus('error');
      setUpdateError(e?.message || 'Unable to reach the update service.');
      Alert.alert('Update Check Failed', e?.message || 'Unable to reach the update service.');
    }
  };

  const handleAutoCheckToggle = (value: boolean) => {
    setAutoCheckUpdates(value);
    setAutoCheckEnabled(value).catch(() => {});
  };

  const chooseStorageFolder = async (kind: 'data' | 'models') => {
    try {
      const folder = await pickStorageFolder();
      if (!folder) return;
      if (kind === 'data') {
        await StoragePaths.setDataDir(folder);
        setCustomDataDir(StoragePaths.displayPath(folder));
      } else {
        await StoragePaths.setModelsDir(folder);
        setCustomConnectorsDir(StoragePaths.displayPath(folder));
      }
    } catch (error: any) {
      Alert.alert('Could not select folder', error?.message || 'Please try another folder.');
    }
  };

  const userName = profile?.fullName || 'Your profile';
  const userEmail = profile?.email || '';
  const userInitial = userName.charAt(0).toUpperCase();

  const ULTRON_DOWNLOAD_URL = 'https://usebrown.online/download';

  // Platform-aware "Also Available On" links (Windows & Android only for now)
  const currentPlatform = Platform.OS; // 'android' | 'ios' | 'web' | 'windows' | 'macos'
  const allPlatforms = [
    { id: 'windows', label: 'Download for Windows', icon: 'windows', color: '#0078D4', branded: true, url: `${ULTRON_DOWNLOAD_URL}?platform=windows`, disabled: false },
    { id: 'android', label: 'Download for Android', icon: 'android', color: '#3DDC84', branded: false, url: `${ULTRON_DOWNLOAD_URL}?platform=android`, disabled: false },
  ];
  // Filter out the current platform
  const otherPlatforms = allPlatforms.filter((p) => {
    if (currentPlatform === 'android') return p.id !== 'android';
    if (currentPlatform === 'web') return true; // show all on web
    return p.id !== currentPlatform;
  });

  const renderPlatformIcon = (platform: { icon: string; color: string; branded?: boolean }, size: number) => {
    switch (platform.icon) {
      case 'windows': return <WindowsIcon size={size} color={platform.color} branded={platform.branded} />;
      case 'android': return <Image source={require('../../Assets/android-logo.png')} style={{ width: size + 2, height: size + 2 }} resizeMode="contain" />;
      default: return <GlobeIcon size={size} color={platform.color} />;
    }
  };

  const handleOpenDownloadLink = async (url: string) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Unable to open link', url);
    }
  };

  // Top-Level Main Settings Menu Groups (Title Cased & Transparent Icons)
  const settingsGroups = [
    {
      id: 'general_account',
      title: 'General & Account',
      badge: undefined,
      items: [
        {
          id: 'account',
          title: 'Account',
          iconType: 'user',
          iconColor: '#60a5fa',
          detail: userName || 'Profile',
          action: () => navigateToView('account'),
        },
        {
          id: 'models',
          title: 'Models',
          iconType: 'cpu',
          iconColor: '#c084fc',
          detail: undefined,
          action: () => navigateToView('models'),
        },
        { id: 'preferences', title: 'View Preferences', iconType: 'sliders', iconColor: '#a1a1aa', detail: `${savedPreferences.length} saved`, action: () => navigateToView('preferences') },
        {
          id: 'data_sync',
          title: 'Desktop Sync',
          iconType: 'sync',
          iconColor: '#38bdf8',
          detail: desktopSyncStatus.isConnected
            ? (desktopSyncStatus.deviceName
                ? (desktopSyncStatus.deviceName.length > 18
                    ? `${desktopSyncStatus.deviceName.slice(0, 18)}…`
                    : desktopSyncStatus.deviceName)
                : 'Connected')
            : 'Disconnected',
          action: () => navigateToView('data_sync'),
        },
      ],
    },
    {
      id: 'voice_storage',
      title: 'Voice & Storage',
      badge: undefined,
      items: [
        {
          id: 'voice',
          title: 'Voice',
          iconType: 'volume',
          iconColor: '#fb7185',
          detail: kokoroInstalled ? kokoroLabel(kokoroVoice) : 'Download Kokoro',
          action: () => navigateToView('voice'),
        },
        {
          id: 'sounds',
          title: 'Sound',
          iconType: 'mic',
          iconColor: '#38bdf8',
          detail: nativeSpeech ? 'On-device dictation' : 'Whisper via PC',
          action: () => navigateToView('sounds'),
        },
        {
          id: 'storage',
          title: 'Storage & Memory',
          iconType: 'database',
          iconColor: '#4ade80',
          detail: undefined,
          action: () => navigateToView('storage'),
        },
        {
          id: 'updates',
          title: 'Software Updates',
          iconType: 'update',
          iconColor: '#fb923c',
          detail: `v${currentAppVersion}`,
          action: () => navigateToView('updates'),
        },
      ],
    },
    {
      id: 'about_system',
      title: 'About & System',
      badge: undefined,
      items: [
        {
          id: 'about',
          title: 'About Brown',
          iconType: 'about',
          iconColor: '#e4e4e7',
          detail: `v${currentAppVersion}`,
          action: () => navigateToView('about'),
        },
        { id: 'help', title: 'Help & Support', iconType: 'help', iconColor: '#93c5fd', detail: 'Docs & contact', action: () => navigateToView('help') },
        { id: 'privacy', title: 'Privacy Policy', iconType: 'shield', detail: undefined, action: () => navigateToView('privacy') },
        { id: 'terms', title: 'Terms & Conditions', iconType: 'file', detail: undefined, action: () => navigateToView('terms') },
      ],
    },
  ];

  const renderItemIcon = (iconType: string, iconColor: string = '#ffffff') => {
    let iconEl = <CpuIcon size={20} color={iconColor} />;
    if (iconType === 'chat') iconEl = <ChatIcon size={20} color={iconColor} />;
    else if (iconType === 'user') iconEl = <UserIcon size={20} color={iconColor} />;
    else if (iconType === 'sliders') iconEl = <SlidersIcon size={20} color={iconColor} />;
    else if (iconType === 'cpu') iconEl = <CpuIcon size={20} color={iconColor} />;
    else if (iconType === 'sync') iconEl = <SyncArrowsIcon size={20} color={iconColor} />;
    else if (iconType === 'volume') iconEl = <VolumeIcon size={20} color={iconColor} />;
    else if (iconType === 'mic') iconEl = <MicIcon size={20} color={iconColor} />;
    else if (iconType === 'database') iconEl = <DatabaseIcon size={20} color={iconColor} />;
    else if (iconType === 'update') iconEl = <SoftwareUpdateIcon size={20} color={iconColor} />;
    else if (iconType === 'about') iconEl = <AboutUltronIcon size={20} color={iconColor} />;
    else if (iconType === 'shield') iconEl = <ShieldCheckIcon size={20} color={iconColor} />;
    else if (iconType === 'help') iconEl = <HelpCircleIcon size={20} color={iconColor} />;

    return (
      <View style={styles.cleanMenuIconBox}>
        {iconEl}
      </View>
    );
  };

  const downloadedIds = useMemo(
    () => ModelDownloader.getInstance().getDownloadedIds(),
    [modelsRevision]
  );
  const installedDeviceCatalog = getInstalledDeviceModels(downloadedIds);

  const configuredCloudCatalog = useMemo(() => {
    const list: ModelMetadata[] = [];
    if (isGeminiConnected && liveGeminiModels.length > 0) {
      list.push(...liveGeminiModels);
    }
    for (const pId of CLOUD_PROVIDER_IDS) {
      if (cloudConnected[pId] && liveCloudModels[pId]?.length > 0) {
        list.push(...liveCloudModels[pId]);
      }
    }
    return list;
  }, [isGeminiConnected, liveGeminiModels, cloudConnected, liveCloudModels, modelsRevision]);

  const allAvailableModelsList = useMemo(() => {
    return [...installedDeviceCatalog, ...configuredCloudCatalog];
  }, [installedDeviceCatalog, configuredCloudCatalog]);

  const filteredModels = allAvailableModelsList.filter((m) => {
    if (activeModelFilter === 'All') return true;
    if (activeModelFilter === 'Cloud') return m.source === 'cloud' || m.provider === 'gemini' || CLOUD_PROVIDER_IDS.includes(m.provider as any);
    if (activeModelFilter === 'Offline') return m.provider === 'device';
    if (activeModelFilter === 'Thinking') {
      return (
        m.tags?.some((t) => /reasoning|thinking/i.test(t)) ||
        (m.description || '').toLowerCase().includes('reasoning') ||
        m.id.includes('reasoner') ||
        m.id.includes('r1') ||
        m.id.includes('o1') ||
        m.id.includes('o3')
      );
    }
    if (activeModelFilter === 'Vision') return m.capabilities?.images === true;
    if (activeModelFilter === 'Code') return m.tags?.some((t) => /code/i.test(t)) || m.capabilities?.code === true;
    if (activeModelFilter === 'Embedding') return m.tags?.some((t) => /embedding/i.test(t));
    return true;
  });

  const handleSelectModelFromSettings = async (model: ModelMetadata) => {
    try {
      setSelectedModelId(model.id);
      const engine = LlamaEngine.getInstance();
      const ok = await engine.loadModel(model);
      if (!ok) {
        Alert.alert(
          'Activation Error',
          engine.getLastNativeError?.() ||
            'Could not load this model. For on-device GGUFs, rebuild with llama.rn linked.'
        );
        return;
      }
      Alert.alert('Model Activated', `${model.name} is now your active model.`);
    } catch (err: any) {
      Alert.alert('Activation Error', err?.message || 'Could not activate model.');
    }
  };

  const yearsList = [];
  for (let y = 2026; y >= 1930; y--) {
    yearsList.push(y);
  }

  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1);

  // ==========================================
  // VIEW HELPER: FULL-PAGE HEADER COMPONENT
  // ==========================================
  const renderFullPageHeader = (title: string, onCustomBack?: () => void) => (
    <ScreenHeader overlay centered title={title} onBack={onCustomBack || handleSmoothBack} scrolled={settingsScrolled} />
  );

  // ==========================================
  // FULL-PAGE VIEW: EDIT PROFILE DETAILS
  // ==========================================
  if (currentView === 'edit_profile') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Edit Profile', handleSmoothBack)}

          {showDatePicker && (
            <TouchableOpacity
              style={styles.fullscreenBackdrop}
              onPress={() => setShowDatePicker(false)}
              activeOpacity={1}
            />
          )}

          <ScrollView key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.centerSection}>
              <View style={styles.editAvatarBigCircle}>
                <Text style={styles.editAvatarInitialText}>{userInitial}</Text>
              </View>
              <Text style={styles.pageMainHeading}>Profile Details</Text>
              <Text style={styles.pageSubHeading}>Updates are saved in private app storage on this device.</Text>
            </View>

            <View style={styles.transparentFormContainer}>
              <View style={styles.floatingBorderField}>
                <View style={styles.floatingBorderLabelBadge}>
                  <Text style={styles.floatingBorderLabelText}>Full name</Text>
                </View>
              <TextInput
                style={[styles.floatingBorderInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor="#71717a"
                showSoftInputOnFocus
              />
              </View>

              <View style={styles.floatingBorderField}>
                <View style={styles.floatingBorderLabelBadge}>
                  <Text style={styles.floatingBorderLabelText}>Email address</Text>
                </View>
                <TextInput
                  style={[styles.floatingBorderInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="your.email@example.com"
                  placeholderTextColor="#71717a"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.floatingBorderField}>
                <View style={styles.floatingBorderLabelBadge}>
                  <Text style={styles.floatingBorderLabelText}>Date of birth</Text>
                </View>
                <TextInput
                  style={[styles.floatingBorderInput, { paddingRight: 44 }, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                  value={editBirthdate}
                  onChangeText={handleBirthdateInput}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#71717a"
                  keyboardType="numeric"
                  maxLength={10}
                />
                <TouchableOpacity brownSurface
                  style={styles.calendarToggleBtn}
                  onPress={() => setShowDatePicker(!showDatePicker)}
                  activeOpacity={0.7}
                >
                  <CalendarIcon size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <View style={styles.customDatepickerPopover}>
                  <View style={styles.datepickerHeader}>
                    <TouchableOpacity brownSurface
                      style={styles.datepickerMonthYearBtn}
                      onPress={() => setCalendarView(calendarView === 'days' ? 'months' : 'days')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.datepickerMonthYearText}>
                        {MONTHS_LIST[currentMonth]} {currentYear}
                      </Text>
                      <ChevronDownIcon size={12} color="#ffffff" />
                    </TouchableOpacity>

                    <View style={styles.datepickerNavArrows}>
                      <TouchableOpacity brownSurface
                        style={styles.datepickerArrowBtn}
                        onPress={() => {
                          if (currentMonth === 0) {
                            setCurrentMonth(11);
                            setCurrentYear(currentYear - 1);
                          } else {
                            setCurrentMonth(currentMonth - 1);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <ChevronLeftIcon size={16} color="#ffffff" />
                      </TouchableOpacity>
                      <TouchableOpacity brownSurface
                        style={styles.datepickerArrowBtn}
                        onPress={() => {
                          if (currentMonth === 11) {
                            setCurrentMonth(0);
                            setCurrentYear(currentYear + 1);
                          } else {
                            setCurrentMonth(currentMonth + 1);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <ChevronRightIcon size={16} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {calendarView === 'days' && (
                    <View style={styles.datepickerDaysSection}>
                      <View style={styles.datepickerWeekHeader}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                          <Text key={idx} style={styles.datepickerWeekDayText}>{day}</Text>
                        ))}
                      </View>
                      <View style={styles.datepickerDaysGrid}>
                        {daysArray.map((day) => {
                          const isSelected = day === selectedDay;
                          return (
                            <TouchableOpacity brownSurface
                              key={day}
                              style={[styles.datepickerDayCell, isSelected && styles.datepickerDayCellSelected]}
                              onPress={() => selectDay(day)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.datepickerDayText, isSelected && styles.datepickerDayTextSelected]}>
                                {day}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {calendarView === 'months' && (
                    <ScrollView keyboardShouldPersistTaps="handled" style={styles.verticalSelectionList} showsVerticalScrollIndicator={false}>
                      {MONTHS_LIST.map((mName, idx) => (
                        <TouchableOpacity brownSurface
                          key={mName}
                          style={[styles.verticalListItem, idx === currentMonth && styles.verticalListItemSelected]}
                          onPress={() => {
                            setCurrentMonth(idx);
                            setCalendarView('years');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.verticalListText, idx === currentMonth && styles.verticalListTextSelected]}>
                            {mName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {calendarView === 'years' && (
                    <ScrollView keyboardShouldPersistTaps="handled" style={styles.verticalSelectionList} showsVerticalScrollIndicator={false}>
                      {yearsList.map((yVal) => (
                        <TouchableOpacity brownSurface
                          key={yVal}
                          style={[styles.verticalListItem, yVal === currentYear && styles.verticalListItemSelected]}
                          onPress={() => {
                            setCurrentYear(yVal);
                            setCalendarView('days');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.verticalListText, yVal === currentYear && styles.verticalListTextSelected]}>
                            {yVal}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}

              <View style={styles.fullPageActionRow}>
                <TouchableOpacity brownSurface style={styles.cancelFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
                  <Text style={styles.cancelFullBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity brownSurface style={styles.saveFullBtn} onPress={handleSaveProfile} activeOpacity={0.8}>
                  <Text style={styles.saveFullBtnText}>Save Profile</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 1: ACCOUNT (Desktop Parity)
  // ==========================================
  if (currentView === 'privacy' || currentView === 'terms') {
    return <LegalDocumentScreen document={currentView} onBack={handleSmoothBack} />;
  }

  if (currentView === 'help') {
    return <HelpSupportScreen onBack={handleSmoothBack} />;
  }

  if (currentView === 'account') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('User Account')}
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={[styles.fullPageScrollContent, styles.accountScrollContent]}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            {/* User Profile Card without Green Badge */}
            <View style={styles.accountProfileCard}>
              <View style={styles.accountAvatarLarge}>
                <Text style={styles.avatarBigText}>{userInitial}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.accountNameText} numberOfLines={1}>{userName}</Text>
                <Text style={styles.accountEmailText} numberOfLines={1}>{userEmail}</Text>
              </View>
              <TouchableOpacity brownSurface="light"
                style={styles.accountEditHeaderBtn}
                onPress={() => navigateToView('edit_profile')}
                activeOpacity={0.7}
              >
                <PencilIcon size={14} color="#ffffff" />
                <Text style={styles.accountEditHeaderBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.accountDeleteFooter}>
              <TouchableOpacity style={styles.deleteAccountButton} onPress={confirmDeleteAccount} accessibilityLabel="Delete Account" activeOpacity={0.8}>
                <TrashIcon size={18} color="#70232E" />
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 2: MODELS (Desktop Parity matching Reference Screenshot)
  // ==========================================
  if (currentView === 'models') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Models')}
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={styles.fullPageScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            {/* Section 1: Connectors & Weights Header */}
            <Text style={styles.desktopSectionHeading}>{'Connectors & Weights'}</Text>

            {/* Connector Card 1: Google Gemini */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 4, alignItems: 'center', justifyContent: 'center' }]}>
                    <Image
                      source={require('../../Assets/gemini-logo.png')}
                      style={{ width: 26, height: 26 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>Google Gemini</Text>
                      <View style={[styles.statusBadge, isGeminiConnected && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, isGeminiConnected && styles.statusBadgeTextConnected]}>
                          {isGeminiConnected ? 'Connected' : 'Not configured'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>Endpoint: https://generativelanguage.googleapis.com</Text>
                  </View>
                </View>
                {isGeminiConnected && (
                  <TouchableOpacity brownSurface="light" onPress={disconnectGemini} activeOpacity={0.7} style={{ padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Disconnect</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.connectorDesc}>
                Multimodal reasoning and fast generation. Get a free API key at{' '}
                <Text style={{ color: '#60a5fa', textDecorationLine: 'underline' }}>aistudio.google.com</Text>.
              </Text>

              {!showGeminiKeyInput ? (
                <TouchableOpacity brownSurface="light"
                  style={styles.addKeyBtn}
                  onPress={() => setShowGeminiKeyInput(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addKeyBtnText}>{isGeminiConnected ? 'Update Key' : '+ Add Key'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.geminiKeyForm}>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={geminiApiKey}
                    onChangeText={setGeminiApiKey}
                    placeholder="Paste Gemini API Key (AIzaSy...)"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.geminiKeyActions}>
                    <TouchableOpacity brownSurface="light"
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowGeminiKeyInput(false)}
                      activeOpacity={0.7}
                      disabled={geminiDiscovering}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity brownSurface="light"
                      style={[styles.saveKeyBtn, geminiDiscovering && { opacity: 0.6 }]}
                      onPress={saveGeminiKey}
                      activeOpacity={0.8}
                      disabled={geminiDiscovering}
                    >
                      <Text style={styles.saveKeyBtnText}>
                        {geminiDiscovering ? 'Checking models…' : 'Save Key'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {isGeminiConnected && liveGeminiModels.length > 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {liveGeminiModels.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.connectorDesc}>{m.apiModel || m.name}</Text>
                      <View style={styles.offlineTypePill}>
                        <Text style={styles.offlineTypePillText}>CLOUD</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Connector Card 2: OpenAI */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 4, alignItems: 'center', justifyContent: 'center' }]}>
                    <Image
                      source={require('../../Assets/openai-black-logo.png')}
                      style={{ width: 26, height: 26 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>OpenAI</Text>
                      <View style={[styles.statusBadge, cloudConnected.openai && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, cloudConnected.openai && styles.statusBadgeTextConnected]}>
                          {cloudConnected.openai ? 'Connected' : 'Not configured'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>Endpoint: https://api.openai.com/v1</Text>
                  </View>
                </View>
                {cloudConnected.openai && (
                  <TouchableOpacity brownSurface="light" onPress={() => disconnectCloudProvider('openai')} activeOpacity={0.7} style={{ padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Disconnect</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.connectorDesc}>
                Flagship GPT-5, GPT-4o, and o3-mini reasoning models. Get an API key at{' '}
                <Text style={{ color: '#10a37f', textDecorationLine: 'underline' }}>platform.openai.com</Text>.
              </Text>

              {!showCloudKeyInput.openai ? (
                <TouchableOpacity brownSurface="light"
                  style={styles.addKeyBtn}
                  onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, openai: true }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addKeyBtnText}>{cloudConnected.openai ? 'Update Key' : '+ Add Key'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.geminiKeyForm}>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={cloudKeys.openai}
                    onChangeText={(val: string) => setCloudKeys((prev) => ({ ...prev, openai: val }))}
                    placeholder="Paste OpenAI API Key (sk-proj-...)"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.geminiKeyActions}>
                    <TouchableOpacity brownSurface="light"
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, openai: false }))}
                      activeOpacity={0.7}
                      disabled={cloudDiscovering.openai}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity brownSurface="light"
                      style={[styles.saveKeyBtn, cloudDiscovering.openai && { opacity: 0.6 }]}
                      onPress={() => saveCloudProviderKey('openai')}
                      activeOpacity={0.8}
                      disabled={cloudDiscovering.openai}
                    >
                      <Text style={styles.saveKeyBtnText}>
                        {cloudDiscovering.openai ? 'Checking models…' : 'Save Key'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {cloudConnected.openai && (liveCloudModels.openai?.length > 0 || CLOUD_PROVIDERS.openai.models.length > 0) && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {(liveCloudModels.openai.length ? liveCloudModels.openai : CLOUD_PROVIDERS.openai.models).slice(0, 5).map((m: any) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.connectorDesc}>{m.name || m.id}</Text>
                      <View style={styles.offlineTypePill}>
                        <Text style={styles.offlineTypePillText}>{m.speed || 'GPT'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Connector Card 3: Anthropic Claude */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 4, alignItems: 'center', justifyContent: 'center' }]}>
                    <Image
                      source={require('../../Assets/claude-logo.png')}
                      style={{ width: 26, height: 26 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>Anthropic Claude</Text>
                      <View style={[styles.statusBadge, cloudConnected.anthropic && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, cloudConnected.anthropic && styles.statusBadgeTextConnected]}>
                          {cloudConnected.anthropic ? 'Connected' : 'Not configured'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>Endpoint: https://api.anthropic.com/v1</Text>
                  </View>
                </View>
                {cloudConnected.anthropic && (
                  <TouchableOpacity brownSurface="light" onPress={() => disconnectCloudProvider('anthropic')} activeOpacity={0.7} style={{ padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Disconnect</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.connectorDesc}>
                Premier hybrid reasoning and coding models (Claude 3.7 & 3.5 Sonnet). Get a key at{' '}
                <Text style={{ color: '#d97706', textDecorationLine: 'underline' }}>console.anthropic.com</Text>.
              </Text>

              {!showCloudKeyInput.anthropic ? (
                <TouchableOpacity brownSurface="light"
                  style={styles.addKeyBtn}
                  onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, anthropic: true }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addKeyBtnText}>{cloudConnected.anthropic ? 'Update Key' : '+ Add Key'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.geminiKeyForm}>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={cloudKeys.anthropic}
                    onChangeText={(val: string) => setCloudKeys((prev) => ({ ...prev, anthropic: val }))}
                    placeholder="Paste Anthropic API Key (sk-ant-...)"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.geminiKeyActions}>
                    <TouchableOpacity brownSurface="light"
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, anthropic: false }))}
                      activeOpacity={0.7}
                      disabled={cloudDiscovering.anthropic}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity brownSurface="light"
                      style={[styles.saveKeyBtn, cloudDiscovering.anthropic && { opacity: 0.6 }]}
                      onPress={() => saveCloudProviderKey('anthropic')}
                      activeOpacity={0.8}
                      disabled={cloudDiscovering.anthropic}
                    >
                      <Text style={styles.saveKeyBtnText}>
                        {cloudDiscovering.anthropic ? 'Checking models…' : 'Save Key'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {cloudConnected.anthropic && (liveCloudModels.anthropic?.length > 0 || CLOUD_PROVIDERS.anthropic.models.length > 0) && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {(liveCloudModels.anthropic.length ? liveCloudModels.anthropic : CLOUD_PROVIDERS.anthropic.models).map((m: any) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.connectorDesc}>{m.name || m.id}</Text>
                      <View style={styles.offlineTypePill}>
                        <Text style={styles.offlineTypePillText}>{m.speed || 'CLAUDE'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Connector Card 4: DeepSeek API */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 4, alignItems: 'center', justifyContent: 'center' }]}>
                    <Image
                      source={require('../../Assets/deepseek-blue-logo.png')}
                      style={{ width: 26, height: 26 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>DeepSeek API</Text>
                      <View style={[styles.statusBadge, cloudConnected.deepseek && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, cloudConnected.deepseek && styles.statusBadgeTextConnected]}>
                          {cloudConnected.deepseek ? 'Connected' : 'Not configured'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>Endpoint: https://api.deepseek.com</Text>
                  </View>
                </View>
                {cloudConnected.deepseek && (
                  <TouchableOpacity brownSurface="light" onPress={() => disconnectCloudProvider('deepseek')} activeOpacity={0.7} style={{ padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Disconnect</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.connectorDesc}>
                Full chain-of-thought frontier reasoning R1 & V3 models. Get a key at{' '}
                <Text style={{ color: '#3b82f6', textDecorationLine: 'underline' }}>platform.deepseek.com</Text>.
              </Text>

              {!showCloudKeyInput.deepseek ? (
                <TouchableOpacity brownSurface="light"
                  style={styles.addKeyBtn}
                  onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, deepseek: true }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addKeyBtnText}>{cloudConnected.deepseek ? 'Update Key' : '+ Add Key'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.geminiKeyForm}>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={cloudKeys.deepseek}
                    onChangeText={(val: string) => setCloudKeys((prev) => ({ ...prev, deepseek: val }))}
                    placeholder="Paste DeepSeek API Key (sk-...)"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.geminiKeyActions}>
                    <TouchableOpacity brownSurface="light"
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, deepseek: false }))}
                      activeOpacity={0.7}
                      disabled={cloudDiscovering.deepseek}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity brownSurface="light"
                      style={[styles.saveKeyBtn, cloudDiscovering.deepseek && { opacity: 0.6 }]}
                      onPress={() => saveCloudProviderKey('deepseek')}
                      activeOpacity={0.8}
                      disabled={cloudDiscovering.deepseek}
                    >
                      <Text style={styles.saveKeyBtnText}>
                        {cloudDiscovering.deepseek ? 'Checking models…' : 'Save Key'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {cloudConnected.deepseek && (liveCloudModels.deepseek?.length > 0 || CLOUD_PROVIDERS.deepseek.models.length > 0) && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {(liveCloudModels.deepseek.length ? liveCloudModels.deepseek : CLOUD_PROVIDERS.deepseek.models).map((m: any) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.connectorDesc}>{m.name || m.id}</Text>
                      <View style={styles.offlineTypePill}>
                        <Text style={styles.offlineTypePillText}>{m.speed || 'REASONING'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Connector Card 5: Groq Cloud */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 4, alignItems: 'center', justifyContent: 'center' }]}>
                    <Image
                      source={require('../../Assets/groq-black-logo.png')}
                      style={{ width: 26, height: 26 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>Groq Cloud</Text>
                      <View style={[styles.statusBadge, cloudConnected.groq && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, cloudConnected.groq && styles.statusBadgeTextConnected]}>
                          {cloudConnected.groq ? 'Connected' : 'Not configured'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>Endpoint: https://api.groq.com/openai/v1</Text>
                  </View>
                </View>
                {cloudConnected.groq && (
                  <TouchableOpacity brownSurface="light" onPress={() => disconnectCloudProvider('groq')} activeOpacity={0.7} style={{ padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Disconnect</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.connectorDesc}>
                Ultra-fast 300+ tok/sec LPU inference for Llama 3.3 70B & DeepSeek-R1 Distill. Get a free key at{' '}
                <Text style={{ color: '#f97316', textDecorationLine: 'underline' }}>console.groq.com</Text>.
              </Text>

              {!showCloudKeyInput.groq ? (
                <TouchableOpacity brownSurface="light"
                  style={styles.addKeyBtn}
                  onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, groq: true }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addKeyBtnText}>{cloudConnected.groq ? 'Update Key' : '+ Add Key'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.geminiKeyForm}>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={cloudKeys.groq}
                    onChangeText={(val: string) => setCloudKeys((prev) => ({ ...prev, groq: val }))}
                    placeholder="Paste Groq API Key (gsk_...)"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.geminiKeyActions}>
                    <TouchableOpacity brownSurface="light"
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, groq: false }))}
                      activeOpacity={0.7}
                      disabled={cloudDiscovering.groq}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity brownSurface="light"
                      style={[styles.saveKeyBtn, cloudDiscovering.groq && { opacity: 0.6 }]}
                      onPress={() => saveCloudProviderKey('groq')}
                      activeOpacity={0.8}
                      disabled={cloudDiscovering.groq}
                    >
                      <Text style={styles.saveKeyBtnText}>
                        {cloudDiscovering.groq ? 'Checking models…' : 'Save Key'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {cloudConnected.groq && (liveCloudModels.groq?.length > 0 || CLOUD_PROVIDERS.groq.models.length > 0) && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {(liveCloudModels.groq.length ? liveCloudModels.groq : CLOUD_PROVIDERS.groq.models).map((m: any) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.connectorDesc}>{m.name || m.id}</Text>
                      <View style={styles.offlineTypePill}>
                        <Text style={styles.offlineTypePillText}>{m.speed || '300+ tok/s'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Connector Card 6: Custom Models (LM Studio / vLLM / OpenRouter / xAI) */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 3, borderWidth: 1.5, borderColor: '#1A1A1A', zIndex: 3 }]}>
                      <Image source={require('../../Assets/vllm-color.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </View>
                    <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 3, marginLeft: -14, borderWidth: 1.5, borderColor: '#1A1A1A', zIndex: 2 }]}>
                      <Image source={require('../../Assets/openrouter-black-logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </View>
                    <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 3, marginLeft: -14, borderWidth: 1.5, borderColor: '#1A1A1A', zIndex: 1 }]}>
                      <Image source={require('../../Assets/lm-studio.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </View>
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>Custom Models</Text>
                      <View style={[styles.statusBadge, cloudConnected.custom && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, cloudConnected.custom && styles.statusBadgeTextConnected]}>
                          {cloudConnected.custom ? 'Connected' : 'Not configured'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>
                      {customEndpointUrlInput ? `Endpoint: ${customEndpointUrlInput}` : 'LM Studio / vLLM / OpenRouter / xAI'}
                    </Text>
                  </View>
                </View>
                {cloudConnected.custom && (
                  <TouchableOpacity brownSurface="light" onPress={() => disconnectCloudProvider('custom')} activeOpacity={0.7} style={{ padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Disconnect</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.connectorDesc}>
                Connect to any custom OpenAI-compatible server or proxy (LM Studio, vLLM, OpenRouter, xAI Grok).
              </Text>

              {!showCloudKeyInput.custom ? (
                <TouchableOpacity brownSurface="light"
                  style={styles.addKeyBtn}
                  onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, custom: true }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addKeyBtnText}>{cloudConnected.custom ? 'Update Server' : '+ Configure Server'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.geminiKeyForm}>
                  <Text style={[styles.connectorDesc, { color: '#ffffff', marginBottom: 4 }]}>Server URL</Text>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}, { marginBottom: 8 }]}
                    value={customEndpointUrlInput}
                    onChangeText={(val: string) => setCustomEndpointUrlInput(val)}
                    placeholder="http://localhost:1234/v1 or https://openrouter.ai/api/v1"
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.connectorDesc, { color: '#ffffff', marginBottom: 4 }]}>API Key (Optional)</Text>
                  <TextInput
                    style={[styles.geminiKeyInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={cloudKeys.custom}
                    onChangeText={(val: string) => setCloudKeys((prev) => ({ ...prev, custom: val }))}
                    placeholder="Optional Authorization Bearer token"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.geminiKeyActions}>
                    <TouchableOpacity brownSurface="light"
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowCloudKeyInput((prev) => ({ ...prev, custom: false }))}
                      activeOpacity={0.7}
                      disabled={cloudDiscovering.custom}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity brownSurface="light"
                      style={[styles.saveKeyBtn, cloudDiscovering.custom && { opacity: 0.6 }]}
                      onPress={() => saveCloudProviderKey('custom')}
                      activeOpacity={0.8}
                      disabled={cloudDiscovering.custom}
                    >
                      <Text style={styles.saveKeyBtnText}>
                        {cloudDiscovering.custom ? 'Checking…' : 'Save & Test'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {cloudConnected.custom && (liveCloudModels.custom?.length > 0 || CLOUD_PROVIDERS.custom.models.length > 0) && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {(liveCloudModels.custom.length ? liveCloudModels.custom : CLOUD_PROVIDERS.custom.models).map((m: any) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.connectorDesc}>{m.name || m.id}</Text>
                      <View style={styles.offlineTypePill}>
                        <Text style={styles.offlineTypePillText}>CUSTOM</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Connector Card 7: Hugging Face */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <View style={[styles.connectorLogoImg, { backgroundColor: '#ffffff', padding: 3, alignItems: 'center', justifyContent: 'center' }]}>
                    <HuggingFaceLogo size={24} />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>Hugging Face</Text>
                      <View style={styles.statusBadgeConnected}>
                        <Text style={styles.statusBadgeTextConnected}>Catalog</Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>
                      GGUF weights for this phone
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.connectorDesc}>
                Search and download open-source GGUFs from Hugging Face in Model Store. Pair Desktop Sync if you also want models already on your PC.
              </Text>
            </View>

            {/* Section 2: Installed & Configured Models Header with Fully Rounded + Add Models */}
            <View style={styles.installedModelsHeaderRow}>
              <Text style={styles.desktopSectionHeading}>Installed & Configured Models</Text>
              <TouchableOpacity brownSurface="light"
                style={styles.addModelsTriggerBtn}
                onPress={() => {
                  if (onOpenModelStore) onOpenModelStore();
                  else Alert.alert('Model Store', 'Open Model Store from chat to download GGUF models.');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.addModelsTriggerBtnText}>+ Add Models</Text>
              </TouchableOpacity>
            </View>

            {/* Model Tag Filter Pills without Visible Scrollbar */}
            <ScrollView
              keyboardShouldPersistTaps="handled" horizontal
              showsHorizontalScrollIndicator={false}
              style={[
                styles.tagFiltersRow,
                Platform.OS === 'web' ? ({ scrollbarWidth: 'none', msOverflowStyle: 'none' } as any) : {},
              ]}
              contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
            >
              {MODEL_TAG_FILTERS.map((tag) => {
                const isActive = activeModelFilter === tag;
                return (
                  <TouchableOpacity brownSurface="light"
                    key={tag}
                    style={[styles.tagFilterPill, isActive && styles.tagFilterPillActive]}
                    onPress={() => setActiveModelFilter(tag)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tagFilterPillText, isActive && styles.tagFilterPillTextActive]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Installed Models List Cards */}
            <View style={styles.modelsFullList}>
              {allAvailableModelsList.length === 0 ? (
                <EmptyState
                  title="No models installed"
                  description={
                    'No data here yet. Add an API key\nin Connectors above, or download an\noffline GGUF from the Model Store.'
                  }
                />
              ) : filteredModels.length === 0 ? (
                <Text style={styles.connectorDesc}>
                  No models match this filter. Add API keys in Connectors above or download GGUFs in Model Store.
                </Text>
              ) : filteredModels.map((m) => {
                const isSelected = selectedModelId === m.id || (m.apiModel && selectedModelId === m.apiModel);
                const isDevice = m.provider === 'device';
                return (
                  <View key={m.id} style={[styles.desktopModelRowCard, isSelected && styles.desktopModelRowCardActive]}>
                    <View style={styles.modelRowCardHeader}>
                      <View style={{ width: '100%', minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.modelRowCardTitle}>{m.name}</Text>
                          <View style={[styles.weightsBadge, !isDevice && { borderColor: 'rgba(96, 165, 250, 0.35)', backgroundColor: 'rgba(96, 165, 250, 0.12)' }]}>
                            <Text style={[styles.weightsBadgeText, !isDevice && { color: '#93c5fd' }]}>
                              {isDevice ? 'WEIGHTS' : (m.provider || 'CLOUD').toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.modelSizePill}>{m.sizeFormatted || 'Cloud'}</Text>
                        </View>
                        <Text style={styles.modelRowCardDesc}>{m.description}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <View style={styles.offlineTypePill}>
                            <Text style={styles.offlineTypePillText}>{isDevice ? 'OFFLINE' : 'CLOUD STREAM'}</Text>
                          </View>
                          {m.capabilities?.images && (
                            <View style={styles.visionTypePill}>
                              <Text style={styles.visionTypePillText}>VISION</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={styles.modelRowCardActions}>
                        <TouchableOpacity brownSurface="light"
                          style={[styles.modelSelectActionBtn, isSelected && styles.modelSelectActionBtnActive]}
                          onPress={() => handleSelectModelFromSettings(m)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.modelSelectActionBtnText, isSelected && styles.modelSelectActionBtnTextActive]}>
                            {isSelected ? 'Active' : 'Select'}
                          </Text>
                        </TouchableOpacity>

                        {isDevice && (
                          <TouchableOpacity brownSurface="light"
                            style={styles.modelDeleteActionBtn}
                            onPress={() => {
                              Alert.alert('Delete Model', `Remove ${m.name} from this device?`, [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: async () => {
                                    try {
                                      await ModelDownloader.getInstance().deleteModel(m.id);
                                      setModelsRevision((n) => n + 1);
                                    } catch (err: any) {
                                      Alert.alert('Could not delete', err?.message || 'Try again.');
                                    }
                                  },
                                },
                              ]);
                            }}
                            activeOpacity={0.7}
                          >
                            <TrashIcon size={16} color="#ffffff" />
                            <Text style={styles.modelDeleteActionBtnText}>Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 3: AGENT SOUNDS (Desktop Parity)
  // ==========================================
  if (currentView === 'sounds') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Sound')}
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={styles.fullPageScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            {/* 1. Voice Input Section */}
            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>Voice input</Text>
              <Text style={styles.sectionCardSubtitle}>
                {nativeSpeech
                  ? 'The mic button dictates with this phone’s own speech recognition. Nothing is recorded to disk and no audio is uploaded.'
                  : 'The mic button records on this phone and transcribes with Whisper on your paired Brown PC — audio stays on your Wi-Fi network.'}
              </Text>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>On-device dictation</Text>
                <Text style={styles.fullPageRowValue}>
                  {nativeSpeech ? 'Active' : 'Not in use'}
                </Text>
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Whisper engine</Text>
                <Text style={styles.fullPageRowValue}>
                  {nativeSpeech
                    ? 'Not needed'
                    : !desktopSyncStatus.isConnected
                      ? 'Pair Brown Desktop'
                      : whisperStatus.ready
                        ? 'Ready on your PC'
                        : whisperStatus.checked
                          ? 'Warming up on your PC…'
                          : 'Checking…'}
                </Text>
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Voice sensitivity</Text>
                <Text style={styles.fullPageRowValue}>{voiceSensitivity}</Text>
              </View>
            </View>

            {/* 2. Notification Chimes Section */}
            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>Notification Chimes</Text>
              <Text style={styles.sectionCardSubtitle}>
                Acoustic and tactile feedback for autonomous agent events.
              </Text>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullPageRowLabel}>Task Completion Chime</Text>
                  <Text style={styles.toggleDesc}>Play chime when response generation finishes</Text>
                </View>
                <ToggleSwitch
                  value={completionSound}
                  onValueChange={(v) => {
                    setCompletionSound(v);
                    SoundService.setSoundEnabled('task-complete', v);
                    if (v) SoundService.playCompletion();
                  }}
                />
              </View>

              <View style={[styles.toggleRow, styles.chimeOptionSeparator]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullPageRowLabel}>Tool Permission Chime</Text>
                  <Text style={styles.toggleDesc}>Play chime when confirmation is prompted</Text>
                </View>
                <ToggleSwitch
                  value={permissionSound}
                  onValueChange={(v) => {
                    setPermissionSound(v);
                    SoundService.setSoundEnabled('permission', v);
                    if (v) SoundService.playPermission();
                  }}
                />
              </View>

              <View style={[styles.toggleRow, styles.chimeOptionSeparator]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullPageRowLabel}>Question Prompt Chime</Text>
                  <Text style={styles.toggleDesc}>Play tone when assistant asks a clarifying question</Text>
                </View>
                <ToggleSwitch
                  value={questionSound}
                  onValueChange={(v) => {
                    setQuestionSound(v);
                    SoundService.setSoundEnabled('question', v);
                    if (v) SoundService.playQuestion();
                  }}
                />
              </View>

              {!notifGranted && (
                <View style={styles.notifPermissionRow}>
                  <Text style={styles.toggleDesc}>
                    Chimes sound while Brown is open. Allow notifications so a finished answer
                    still reaches you when the app is in the background.
                  </Text>
                  <TouchableOpacity brownSurface="light"
                    style={styles.notifPermissionBtn}
                    activeOpacity={0.8}
                    disabled={requestingNotif}
                    onPress={() => {
                      setRequestingNotif(true);
                      requestNotificationPermission()
                        .then(setNotifGranted)
                        .catch(() => setNotifGranted(false))
                        .finally(() => setRequestingNotif(false));
                    }}
                  >
                    <Text style={styles.notifPermissionBtnText}>
                      {requestingNotif ? 'Asking…' : 'Allow Notifications'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.notifPermissionRow}>
                <Text style={styles.toggleDesc}>
                  A finished answer notifies you only while Brown is still running in the
                  background. Check the whole path with a test notification.
                </Text>
                <TouchableOpacity brownSurface="light"
                  style={styles.notifPermissionBtn}
                  activeOpacity={0.8}
                  disabled={testingNotif}
                  onPress={() => {
                    setTestingNotif(true);
                    sendTestNotification()
                      .then((ok) => setTestNotifResult(ok ? 'Sent' : 'Blocked by Android'))
                      .catch(() => setTestNotifResult('Blocked by Android'))
                      .finally(() => setTestingNotif(false));
                  }}
                >
                  <Text style={styles.notifPermissionBtnText}>
                    {testingNotif ? 'Sending…' : 'Send Test Notification'}
                  </Text>
                </TouchableOpacity>
                {!!testNotifResult && (
                  <Text style={styles.toggleDesc}>{testNotifResult}</Text>
                )}
              </View>
            </View>

            {/* Test Play Buttons (Fully Rounded) */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity brownSurface="light"
                style={[styles.secondaryFullBtn, { flex: 1 }]}
                onPress={() => SoundService.playCompletion()}
                activeOpacity={0.8}
              >
                <VolumeIcon size={16} color="#ffffff" />
                <Text style={styles.secondaryFullBtnText}>Play Completion</Text>
              </TouchableOpacity>

              <TouchableOpacity brownSurface="light"
                style={[styles.secondaryFullBtn, { flex: 1 }]}
                onPress={() => SoundService.playPermission()}
                activeOpacity={0.8}
              >
                <VolumeIcon size={16} color="#ffffff" />
                <Text style={styles.secondaryFullBtnText}>Play Permission</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity brownSurface="light" style={styles.primaryFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
              <Text style={styles.primaryFullBtnText}>Save Preferences</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW: VOICE (Kokoro neural personas)
  // ==========================================
  if (currentView === 'voice') {
    const voiceColumns = voiceGridWidth >= 760 ? 4 : 2;
    const voiceRows = Array.from({ length: Math.ceil(KOKORO_VOICES.length / voiceColumns) }, (_, index) =>
      KOKORO_VOICES.slice(index * voiceColumns, (index + 1) * voiceColumns)
    );
    const handlePreview = async (voiceId: KokoroVoiceId) => {
      if (!kokoroStatus || !isKokoroVoiceInstalled(kokoroStatus, voiceId)) {
        Alert.alert('Download first', 'Download the Kokoro voices before previewing.');
        return;
      }
      if (previewingVoice === voiceId) {
        TextToSpeechService.stop();
        setPreviewingVoice(null);
        return;
      }
      TextToSpeechService.setRate(speechRate);
      setPreviewingVoice(voiceId);
      try {
        await TextToSpeechService.previewVoice(voiceId);
      } catch (err: any) {
        Alert.alert('Preview failed', String(err?.message || err));
      } finally {
        setPreviewingVoice((cur) => (cur === voiceId ? null : cur));
      }
    };

    const handleSelect = async (voiceId: KokoroVoiceId) => {
      setKokoroVoice(voiceId);
      await setActiveKokoroVoice(voiceId);
    };

    const handleDownload = async (voiceId?: KokoroVoiceId) => {
      if (kokoroBusy) return;
      const task = voiceId || 'engine';
      setKokoroBusy(true);
      setActiveVoiceDownload(task);
      setKokoroProgress('Starting download…');
      const onProgress = (p: KokoroDownloadProgress) => {
        setVoiceDownloads(previous => ({ ...previous, [task]: { ...previous[task], ...p, ...(task === 'engine' && p.fileLabel?.toLowerCase().includes('tokenizer') ? { downloaded: previous[task]?.downloaded, total: previous[task]?.total } : {}) } }));
        setKokoroProgress(`${p.status} ${p.percent}%${p.downloaded ? ` · ${p.downloaded}${p.total ? ` / ${p.total}` : ''}` : ''}`);
      };
      const result = await (voiceId ? downloadKokoroVoice(voiceId, onProgress) : downloadKokoroEngine(onProgress)).catch((error: any) => ({ success: false, error: error?.message || 'Could not start voice download.', cancelled: false }));
      setKokoroBusy(false);
      setActiveVoiceDownload(null);
      if (result.success) {
        const status = await getKokoroInstallStatus();
        setKokoroStatus(status);
        setKokoroInstalled(KOKORO_VOICES.some(v => isKokoroVoiceInstalled(status, v.voiceId)));
        setKokoroProgress('');
        if (voiceId) {
          if (!isKokoroVoiceInstalled(status, kokoroVoice)) await handleSelect(voiceId);
        } else {
          setEngineDownloadedBanner(true);
          if (engineBannerTimer.current) clearTimeout(engineBannerTimer.current);
          engineBannerTimer.current = setTimeout(() => setEngineDownloadedBanner(false), 10000);
        }
      } else if (!result.cancelled) {
        setVoiceDownloads(previous => ({ ...previous, [task]: { ...previous[task], phase: 'error', percent: previous[task]?.percent || 0, status: result.error || 'Download failed. Retry.' } }));
        setKokoroProgress(result.error || 'Download failed. Please retry.');
        Alert.alert('Download Failed', result.error || 'Could not download Kokoro.');
      } else {
        setVoiceDownloads(previous => ({ ...previous, [task]: { ...previous[task], phase: 'error', percent: previous[task]?.percent || 0, status: 'Cancelled. Tap Download to retry.' } }));
        setKokoroProgress('Download cancelled. Tap Download to retry.');
      }
    };

    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          <ScreenHeader overlay centered title="Voice" onBack={handleSmoothBack} scrolled={settingsScrolled} right={<TouchableOpacity brownSurface style={styles.voiceDownloadsButton} onPress={() => setShowVoiceDownloads(true)} accessibilityLabel="Show voice model downloads and progress" accessibilityState={{ busy: kokoroBusy }}><VoiceDownloadIcon busy={kokoroBusy} /></TouchableOpacity>} />
          <Modal visible={showVoiceDownloads} transparent animationType="fade" onRequestClose={() => setShowVoiceDownloads(false)}>
            <View style={styles.voiceDownloadsBackdrop}>
              <ScrollView style={styles.voiceDownloadsPanel} contentContainerStyle={{ padding: 18 }}>
                <View style={styles.voiceIntroRow}><Text style={styles.voiceIntroTitle}>Voice downloads</Text><TouchableOpacity brownSurface onPress={() => setShowVoiceDownloads(false)} accessibilityLabel="Close voice downloads"><Text style={styles.voiceDownloadClose}>×</Text></TouchableOpacity></View>
                {['engine', ...KOKORO_VOICES.map(v => v.voiceId)].map(task => {
                  const progress = voiceDownloads[task];
                  const ready = task === 'engine' ? kokoroStatus?.engineInstalled : !!kokoroStatus && isKokoroVoiceInstalled(kokoroStatus, task as KokoroVoiceId);
                  const active = kokoroBusy && activeVoiceDownload === task;
                  const percent = ready ? 100 : Math.max(0, Math.min(100, progress?.percent || 0));
                  const canDownload = !ready && !kokoroBusy && (task === 'engine' || !!kokoroStatus?.engineInstalled);
                  return <View key={task} style={styles.voiceDownloadItem}>
                    <View style={styles.voiceDownloadCopy}>
                    <Text style={styles.voiceDownloadName}>{task === 'engine' ? 'Kokoro engine · 88.1 MB' : `${kokoroLabel(task as KokoroVoiceId)} voice · 510 KB`}</Text>
                    <Text style={styles.voiceDownloadDetail}>{ready ? 'Downloaded · 100%' : progress ? `${progress.status} · ${progress.percent}%` : task !== 'engine' && !kokoroStatus?.engineInstalled ? 'Download the engine first' : 'Not downloaded · 0%'}</Text>
                    {!!progress?.downloaded && <Text style={styles.voiceDownloadDetail}>{progress.downloaded}{progress.total ? ` / ${progress.total}` : ''}</Text>}
                    </View>
                    <View style={styles.voiceDownloadControls}>
                      <TouchableOpacity disabled={!canDownload} onPress={() => handleDownload(task === 'engine' ? undefined : task as KokoroVoiceId)} accessibilityRole="button" accessibilityLabel={`${ready ? 'Downloaded' : active ? 'Downloading' : 'Download'} ${task === 'engine' ? 'Kokoro engine' : kokoroLabel(task as KokoroVoiceId)} · ${Math.round(percent)} percent`}>
                        <Svg width={44} height={44} viewBox="0 0 44 44">
                          <Circle cx={22} cy={22} r={19} fill="none" stroke="#3d3d42" strokeWidth={2.5} />
                          <Circle cx={22} cy={22} r={19} fill="none" stroke={ready ? '#86d6ad' : '#f4f4f5'} strokeWidth={2.5} strokeDasharray={`${2 * Math.PI * 19}`} strokeDashoffset={2 * Math.PI * 19 * (1 - percent / 100)} strokeLinecap="round" rotation={-90} origin="22,22" />
                          <Path d="M22 13v13m-5-5 5 5 5-5M14 28v4h16v-4" fill="none" stroke={canDownload || active || ready ? '#f4f4f5' : '#71717a'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                      </TouchableOpacity>
                      {active && <TouchableOpacity brownSurface onPress={() => cancelKokoroDownload(task).catch(err => Alert.alert('Download', err.message))} style={styles.voiceDownloadCancel} accessibilityRole="button" accessibilityLabel={`Cancel ${task === 'engine' ? 'Kokoro engine' : kokoroLabel(task as KokoroVoiceId)} download`}>
                        <Text style={{ color: '#fafafa', fontSize: 22, lineHeight: 24 }}>×</Text>
                      </TouchableOpacity>}
                    </View>
                  </View>;
                })}
                {kokoroBusy && <TouchableOpacity brownSurface onPress={() => cancelKokoroDownload().catch(err => Alert.alert('Download', err.message))} style={[styles.secondaryFullBtn, { marginTop: 24, marginBottom: 4 }]}><Text style={styles.voiceDownloadName}>Cancel download</Text></TouchableOpacity>}
              </ScrollView>
            </View>
          </Modal>
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={styles.fullPageScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            {/* 1. Neural persona cards */}
            <View style={styles.voiceSection}>
              <View style={[styles.voiceIntroRow, { justifyContent: 'center' }]}>
                <Text style={[styles.voiceIntroTitle, { textAlign: 'center' }]}>Neural personas</Text>

              </View>
              <Text style={[styles.voiceIntroDescription, { textAlign: 'center' }]} textBreakStrategy="balanced">
                Install Kokoro once for offline speech. Then choose the voices you want to use.
              </Text>

              {(!kokoroStatus?.engineInstalled || engineDownloadedBanner) && (
                <TouchableOpacity brownSurface
                  style={[styles.primaryFullBtn, kokoroBusy && styles.voicePillDisabled]}
                  disabled={kokoroBusy || engineDownloadedBanner}
                  onPress={() => handleDownload()}
                  accessibilityLabel="Download shared Kokoro engine"
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryFullBtnText}>{engineDownloadedBanner ? 'Kokoro Engine Downloaded' : activeVoiceDownload === 'engine' ? `Downloading Kokoro engine · ${voiceDownloads.engine?.percent || 0}%` : 'Download Kokoro engine · 88.1 MB'}</Text>
                </TouchableOpacity>
              )}
              {!!kokoroProgress && <Text style={styles.sectionCardSubtitle} accessibilityLiveRegion="polite">{kokoroProgress}</Text>}

              <View style={styles.voiceGrid} onLayout={(event: { nativeEvent: { layout: { width: number } } }) => setVoiceGridWidth(event.nativeEvent.layout.width)}>
                {voiceRows.map((row) => (
                  <View key={row[0].key} style={styles.voiceGridRow}>
                  {row.map((v) => {
                  const isActive = kokoroVoice === v.voiceId;
                  const isPreviewing = previewingVoice === v.voiceId;
                  const voiceInstalled = !!kokoroStatus && isKokoroVoiceInstalled(kokoroStatus, v.voiceId);
                  const cardWidth = (voiceGridWidth - 10 * (voiceColumns - 1)) / voiceColumns;
                  return (
                    <View key={v.key} style={[styles.voiceCard, voiceGridWidth > 0 && { height: Math.max(240, cardWidth * 4 / 3) }, isActive && styles.voiceCardActive]}>
                      <Image source={PERSONA_IMAGES[v.voiceId]} style={styles.voiceCardImg} resizeMode="cover" />
                      <LinearGradient
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)', '#000000']}
                        locations={[0, 0.4, 0.7, 1]}
                        style={StyleSheet.absoluteFillObject}
                      >
                        <View style={styles.voiceCardInfo}>
                          <View style={styles.voiceCardTitleRow}>
                            <Text style={styles.voiceCardName}>{v.label}</Text>
                            {isActive && <View style={styles.voiceCardTick}><Text style={styles.voiceCardTickText}>✓</Text></View>}
                          </View>
                          <Text style={styles.voiceCardDesc} numberOfLines={3}>{v.description}</Text>
                          <View style={styles.voiceCardFoot}>
                            <TouchableOpacity brownSurface="light"
                              style={[styles.voicePlayPill, !voiceInstalled && styles.voicePillDisabled]}
                              disabled={!voiceInstalled}
                              onPress={() => handlePreview(v.voiceId)}
                              accessibilityLabel={`${isPreviewing ? 'Stop' : 'Play'} ${v.label} voice preview`}
                              activeOpacity={0.8}
                            >
                              <VoiceCardIcon kind={isPreviewing ? 'stop' : 'play'} />
                            </TouchableOpacity>

                            {isActive && voiceInstalled ? (
                              <View style={styles.voiceSelectPillSelected}>
                                <VoiceCardIcon kind="check" />
                                <Text style={styles.voiceSelectPillSelectedText}>Selected</Text>
                              </View>
                            ) : voiceInstalled ? (
                              <TouchableOpacity brownSurface="light" style={styles.voiceSelectPill} onPress={() => handleSelect(v.voiceId)} activeOpacity={0.8}>
                                <VoiceCardIcon kind="star" />
                                <Text numberOfLines={1} style={styles.voiceSelectPillText}>Select</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity brownSurface="light"
                                style={[styles.voiceSelectPill, (kokoroBusy || !kokoroStatus?.engineInstalled) && styles.voicePillDisabled]}
                                disabled={kokoroBusy || !kokoroStatus?.engineInstalled}
                                onPress={() => handleDownload(v.voiceId)}
                                accessibilityLabel={activeVoiceDownload === v.voiceId ? `Downloading ${v.label}` : `Download ${v.label} voice`}
                                activeOpacity={0.8}
                              >
                                {activeVoiceDownload === v.voiceId ? <ActivityIndicator size="small" color="#ffffff" /> : <Text numberOfLines={1} style={styles.voiceSelectPillText}>Download</Text>}
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </LinearGradient>
                    </View>
                  );
                  })}
                  </View>
                ))}
              </View>
            </View>

            {/* 2. Speech settings */}
            <View style={styles.pageCardGroup}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>AI voice output</Text>
                  <Text style={styles.sectionCardSubtitle}>
                    Reads answers aloud with the selected persona. Skips raw code blocks and markdown.
                  </Text>
                </View>
                <ToggleSwitch value={autoSpeakTts} onValueChange={setAutoSpeakTts} />
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Kokoro status</Text>
                <Text style={styles.fullPageRowValue}>{kokoroBusy ? 'Downloading…' : kokoroInstalled ? 'Ready' : kokoroStatus?.engineInstalled ? 'Engine ready' : 'Not installed'}</Text>
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Speech rate</Text>
                <View style={styles.speedPillsRow}>
                  {[0.8, 1.0, 1.2, 1.4].map((spd) => (
                    <TouchableOpacity brownSurface
                      key={spd}
                      style={[styles.speedPill, speechRate === spd && styles.speedPillActive]}
                      onPress={() => {
                        setSpeechRate(spd);
                        TextToSpeechService.setRate(spd);
                      }}
                    >
                      <Text style={[styles.speedPillText, speechRate === spd && styles.speedPillTextActive]}>
                        {spd}×
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {kokoroStatus?.engineInstalled ? (
                <TouchableOpacity brownSurface
                  style={[styles.clearChatsBtn, { marginTop: 12 }]}
                  onPress={() => {
                    Alert.alert('Remove Kokoro?', 'Deletes the on-device engine and voice models.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                          await cancelKokoroDownload();
                          TextToSpeechService.stop();
                          await deleteKokoroAssets();
                          setKokoroInstalled(false);
                          setKokoroStatus(null);
                          setVoiceDownloads({});
                          setEngineDownloadedBanner(false);
                          setKokoroProgress('');
                          } catch (err: any) { Alert.alert('Remove Kokoro', err.message || 'Could not remove voice files. Please retry.'); }
                        },
                      },
                    ]);
                  }}
                  activeOpacity={0.8}
                >
                  <TrashIcon size={16} color="#ffffff" />
                  <Text style={styles.clearChatsBtnText}>Remove Kokoro assets</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 4: STORAGE & MEMORY (Desktop Parity)
  // ==========================================
  if (currentView === 'preferences') return <PreferencesScreen onBack={handleSmoothBack} />;

  if (currentView === 'storage') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Storage & Memory')}
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={styles.fullPageScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            {/* Storage Locations Header with Memory Toggle */}
            <View style={styles.pageCardGroup}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>Storage Locations</Text>
                  <Text style={styles.sectionCardSubtitle}>
                    Downloads, chats, and model files are stored on this device.
                  </Text>
                </View>

              </View>

              <StorageLocationControl label="Agent Storage & Memory" address={customDataDir} hint="Conversation storage on this device. Saved preferences stay in private app storage."
                onChoose={() => chooseStorageFolder('data')} onDefault={async () => {
                  await StoragePaths.resetDataDir(); const data = await StoragePaths.getDataDir(); setCustomDataDir(StoragePaths.displayPath(data));
                  Alert.alert('Storage Location', `Using ${StoragePaths.displayPath(data)}`);
                }} />
              <StorageLocationControl label="Connectors & Downloads" address={customConnectorsDir} hint="Downloaded model files."
                onChoose={() => chooseStorageFolder('models')} onDefault={async () => {
                  await StoragePaths.resetModelsDir(); const models = await StoragePaths.getModelsDir(); setCustomConnectorsDir(StoragePaths.displayPath(models));
                  Alert.alert('Download Location', `Using ${StoragePaths.displayPath(models)}`);
                }} />
            </View>

            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>AI Memory</Text>
              <Text style={styles.sectionCardSubtitle}>Say “Remember that I prefer brief answers” to save a preference across chats. Saved preferences are included when you chat, including with a cloud model. Turning memory off keeps them saved but stops using them.</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <Text style={styles.inputFieldLabel}>Use saved preferences</Text>
                <ToggleSwitch value={memoryPersistence} onValueChange={async value => { await AssistantMemory.setEnabled(value); setMemoryPersistence(value); }} />
              </View>
              <TouchableOpacity brownSurface="light" accessibilityLabel="View preferences" style={[styles.exportBackupBtn, { marginTop: 14 }]} onPress={() => navigateToView('preferences')}><SlidersIcon size={18} color="#ffffff" /><Text style={styles.exportBackupBtnText}>View preferences</Text></TouchableOpacity>
            </View>

            {/* Clear Data Section */}
            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>Backup & Data</Text>
              <Text style={styles.sectionCardSubtitle}>
                Save or restore conversations and preferences. Erase history separately.
              </Text>
              <View style={styles.storageActionColumn}>
                <TouchableOpacity brownSurface="light" style={styles.exportBackupBtn} onPress={handleExportData} disabled={exporting || importing} activeOpacity={0.8}>
                  <DownloadIcon size={16} color="#ffffff" />
                  <Text style={styles.exportBackupBtnText}>{exporting ? 'Exporting…' : 'Export Backup'}</Text>
                </TouchableOpacity>
                <TouchableOpacity brownSurface="light" style={styles.exportBackupBtn} onPress={handleImportData} disabled={importing || exporting} activeOpacity={0.8} accessibilityLabel="Import backup">
                  <DownloadIcon size={16} color="#ffffff" />
                  <Text style={styles.exportBackupBtnText}>{importing ? 'Importing…' : 'Import Backup'}</Text>
                </TouchableOpacity>

                <TouchableOpacity brownSurface="light" style={styles.clearChatsBtn} onPress={handleClearHistory} activeOpacity={0.8}>
                  <TrashIcon size={16} color="#ffffff" />
                  <Text style={styles.clearChatsBtnText}>Erase All Chat History</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity brownSurface="light" style={styles.secondaryFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
              <Text style={styles.secondaryFullBtnText}>Back to Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 5: SOFTWARE UPDATE (One UI layout, Brown palette)
  // ==========================================
  if (currentView === 'updates') {
    const hasUpdate = updateStatus === 'available' && !!latestUpdateInfo?.available;
    const notes = parseReleaseNotes(latestUpdateInfo?.releaseNotes);
    const shownNotes = showAllUpdateNotes ? notes : notes.slice(0, 3);
    const released = formatReleaseDate(latestUpdateInfo?.publishedAt);
    const sizeLabel = formatBytes(latestUpdateInfo?.apkSizeBytes || 0);
    const kickerText =
      updateStatus === 'checking'
        ? 'Checking for updates'
        : updateStatus === 'error'
          ? 'Update check failed'
          : hasUpdate
            ? 'Update your phone'
            : 'Your phone is up to date';
    const headlineText = `Brown ${stripV(hasUpdate ? latestUpdateInfo?.latestVersion : currentAppVersion)}`;
    const statusText =
      updateStatus === 'checking'
        ? 'Looking for the newest Mobile Edition release…'
        : updateStatus === 'error'
          ? updateError || 'Could not reach the update service. Check your connection and try again.'
          : hasUpdate
            ? `${sizeLabel}${released ? ` · Released ${released}` : ''}`
            : `v${stripV(currentAppVersion)} · Nothing left to download`;

    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Software update')}
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={styles.fullPageScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            <View>
              <Text style={styles.updateKicker}>{kickerText}</Text>
              <Text style={styles.updateHeadline}>{headlineText}</Text>
              <Text style={styles.updateStatusText}>{statusText}</Text>
              {hasUpdate ? (
                <Text style={styles.updateLegal}>
                  Downloading over mobile data may result in additional charges. Using Wi-Fi is
                  recommended.
                </Text>
              ) : null}
            </View>

            <UpdateHero height={168} />

            {hasUpdate && notes.length > 0 ? (
              <View>
                <Text style={styles.updateSectionTitle}>What's new in this update</Text>
                {shownNotes.map((line, i) => (
                  <View key={`${i}-${line.slice(0, 12)}`} style={styles.updateNoteRow}>
                    <View style={styles.updateNoteBullet} />
                    <Text style={styles.updateNoteText}>{line}</Text>
                  </View>
                ))}
                {notes.length > 3 ? (
                  <TouchableOpacity brownSurface
                    style={styles.updateLinkRow}
                    onPress={() => setShowAllUpdateNotes((open) => !open)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.updateLinkText}>
                      {showAllUpdateNotes ? 'Show less' : `View all changes (${notes.length})`}
                    </Text>
                    <View style={showAllUpdateNotes ? styles.updateLinkChevronOpen : styles.updateLinkChevron}>
                      <ChevronRightIcon size={13} color="#93c5fd" />
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <View>
              <Text style={styles.updateGroupLabel}>App update information</Text>
              <View style={styles.updateInfoCard}>
                <View style={styles.updateInfoRow}>
                  <Text style={styles.updateSettingLabel}>Current version</Text>
                  <Text style={styles.updateSettingValue}>v{stripV(currentAppVersion)}</Text>
                </View>
                <View style={[styles.updateInfoRow, styles.updateInfoRowDivider]}>
                  <Text style={styles.updateSettingLabel}>Latest version</Text>
                  <Text style={styles.updateSettingValue}>
                    {latestUpdateInfo?.latestVersion ? `v${stripV(latestUpdateInfo.latestVersion)}` : '—'}
                  </Text>
                </View>
                <View style={[styles.updateInfoRow, styles.updateInfoRowDivider]}>
                  <Text style={styles.updateSettingLabel}>Download size</Text>
                  <Text style={styles.updateSettingValue}>{sizeLabel}</Text>
                </View>
                <View style={[styles.updateInfoRow, styles.updateInfoRowDivider]}>
                  <Text style={styles.updateSettingLabel}>Released</Text>
                  <Text style={styles.updateSettingValue}>{released || '—'}</Text>
                </View>
                <View style={[styles.updateInfoRow, styles.updateInfoRowDivider]}>
                  <Text style={styles.updateSettingLabel}>Channel</Text>
                  <Text style={styles.updateSettingValue}>Stable (Mobile Edition)</Text>
                </View>
              </View>
            </View>

            <View>
              <Text style={styles.updateGroupLabel}>Update settings</Text>
              <View style={styles.pageCardGroup}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.updateSettingLabel}>Auto-check on launch</Text>
                    <Text style={styles.updateSettingDesc}>Check the update service when starting the app</Text>
                  </View>
                  <ToggleSwitch
                    value={autoCheckUpdates}
                    onValueChange={handleAutoCheckToggle}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity brownSurface
              style={[styles.updatePrimaryBtn, updateStatus === 'checking' && styles.updatePrimaryBtnDisabled]}
              onPress={() => (hasUpdate ? setShowUpdateModal(true) : handleCheckUpdates())}
              disabled={updateStatus === 'checking'}
              activeOpacity={0.85}
            >
              <Text style={styles.updatePrimaryBtnText}>
                {updateStatus === 'checking'
                  ? 'Checking…'
                  : hasUpdate
                    ? `Download update${latestUpdateInfo?.apkSizeBytes ? ` (${sizeLabel})` : ''}`
                    : 'Check for updates'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.updateFootnote}>
              Only the app is replaced — your chats, models and settings stay on this device.
            </Text>
          </ScrollView>
          <UpdatePromptModal
            visible={showUpdateModal && !!latestUpdateInfo?.available}
            update={latestUpdateInfo}
            onDismiss={() => setShowUpdateModal(false)}
            onUpdated={() => {
              setShowUpdateModal(false);
              setUpdateStatus('up-to-date');
            }}
          />
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 6: ABOUT (Desktop Parity)
  // ==========================================
  if (currentView === 'about') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('About')}
          <ScrollView
            key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
            contentContainerStyle={styles.fullPageScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={settingsScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.aboutCard}>
              <View style={styles.aboutBrandHeader}>
                <Image
                  source={require('../../Assets/browny_white.png')}
                  style={styles.aboutAppLogo}
                  resizeMode="contain"
                />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.aboutAppTitle}>Brown</Text>
                    <View style={styles.aboutVersionBadge}>
                      <Text style={styles.aboutVersionBadgeText}>v{currentAppVersion}</Text>
                    </View>
                  </View>
                  <Text style={styles.aboutTagline}>{'Local & Offline Mobile AI Companion'}</Text>
                </View>
              </View>

              <Text style={styles.aboutSectionTitle}>About Brown</Text>
              <Text style={styles.aboutParagraph}>
                Brown is an advanced, sovereign conversational AI companion built to run directly on smartphone hardware. All SLM neural model inference, prompt executions, and chat histories operate locally inside a 100% private on-device sandbox. No personal data, chat context, or telemetry is ever transmitted to remote servers.
              </Text>
              <Text style={[styles.aboutParagraph, { marginTop: 8 }]}>
                Powered by quantized GGUF neural models with optional fallback to Google Gemini cloud intelligence when requested, Brown delivers fast, autonomous capability while keeping you in complete sovereign control.
              </Text>

              {/* Specs Grid (Desktop Parity) */}
              <View style={styles.aboutSpecsGrid}>
                <View style={styles.aboutSpecItem}>
                  <Text style={styles.aboutSpecLabel}>VERSION</Text>
                  <Text style={styles.aboutSpecValue}>v{currentAppVersion} Mobile</Text>
                </View>
                <View style={styles.aboutSpecItem}>
                  <Text style={styles.aboutSpecLabel}>PLATFORM</Text>
                  <Text style={styles.aboutSpecValue}>{Platform.OS.toUpperCase()}</Text>
                </View>
                <View style={styles.aboutSpecItem}>
                  <Text style={styles.aboutSpecLabel}>NEURAL ENGINE</Text>
                  <Text style={styles.aboutSpecValue}>ANE / Vulkan / NPU</Text>
                </View>
              </View>

              {/* Social Media Links (Only icons without bg, center-aligned in a single row) */}
              <View style={styles.aboutSocialIconsRow}>

                <TouchableOpacity brownSurface
                  style={styles.aboutSocialIconBtn}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open('https://www.instagram.com/ultron_offline', '_blank');
                    } else {
                      Alert.alert('Instagram', 'https://www.instagram.com/ultron_offline');
                    }
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Instagram"
                >
                  <InstagramIcon size={24} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity brownSurface
                  style={styles.aboutSocialIconBtn}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open('mailto:contact@usebrown.online', '_blank');
                    } else {
                      Alert.alert('Email Developer', 'contact@usebrown.online');
                    }
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Email"
                >
                  <MailIcon size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Also Available On */}
              <View style={styles.alsoAvailableContainer}>
                <Text style={styles.alsoAvailableTitle}>Also Available On</Text>
                <View style={styles.platformButtonsGrid}>
                  {otherPlatforms.map((platform) => (
                    <TouchableOpacity brownSurface
                      key={platform.id}
                      style={[styles.platformButton, platform.disabled && { opacity: 0.45 }]}
                      onPress={() => {
                        if (platform.disabled) {
                          Alert.alert('In Development', `${platform.label.replace('Download for ', '')} build is currently in development.`);
                          return;
                        }
                        handleOpenDownloadLink(platform.url);
                      }}
                      disabled={platform.disabled}
                      activeOpacity={platform.disabled ? 1 : 0.8}
                    >
                      {renderPlatformIcon(platform, 18)}
                      <Text style={styles.platformButtonText}>{platform.label}</Text>
                      <Text style={styles.platformButtonArrow}>{platform.disabled ? '🔒' : '↗'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // VIEW: MAIN SETTINGS MENU
  // ==========================================
  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: screenFadeAnim,
          transform: [{ translateY: screenSlideAnim }],
        },
      ]}
    >
      <SafeAreaView style={styles.container}>
        {/* Top Header Row: Transitions into Search Field in the exact same row when search is active */}
        {isSpotlightOpen ? (
          <View style={[styles.mainHeaderRow, styles.mainHeaderSearchActive, settingsScrolled && styles.mainHeaderRowScrolled]}>
            <HeaderFade />
            <View style={styles.headerSearchBar}>
              <SearchIcon size={17} color="#9ca3af" />
              <TextInput
                style={[
                  styles.headerSearchInput,
                  Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {},
                ]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search settings…"
                placeholderTextColor="#a8adb5"
                accessibilityLabel="Search settings, models, audio, and storage"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity brownSurface
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  accessibilityLabel="Clear search"
                >
                  <CloseIcon size={16} color="#a1a1aa" />
                </TouchableOpacity>
              )}
            </View>
            <GlassControl radius={22} active={true}
              style={styles.searchCloseBtn}
              onPress={() => {
                setIsSpotlightOpen(false);
                setSearchQuery('');
              }}
              activeOpacity={0.7}
              accessibilityLabel="Close Search"
            >
              <CloseIcon size={20} color="#e4e4e7" />
            </GlassControl>
          </View>
        ) : (
          <View style={[styles.mainHeaderRow, settingsScrolled && styles.mainHeaderRowScrolled]}>
            <HeaderFade />
            <GlassControl radius={22} active={true}
              style={styles.settingsBackBtn}
              onPress={handleSmoothBack}
              activeOpacity={0.7}
              accessibilityLabel="Back to Chat"
            >
              <BackArrowIcon size={22} color="#ffffff" strokeWidth={2.2} />
            </GlassControl>
            <HeaderTitle title="Settings" style={{ position: 'absolute', left: 112, right: 112 }} />
            <View style={{ flex: 1 }} />
            <View style={styles.headerRightGroup}>
              <GlassControl radius={22} active={true}
                style={styles.headerIconBtn}
                onPress={() => setIsSpotlightOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="Spotlight Search"
              >
                <SearchIcon size={20} color="#e4e4e7" />
              </GlassControl>
              <GlassControl radius={22} active={true}
                style={styles.headerIconBtn}
                onPress={() => navigateToView('about')}
                activeOpacity={0.7}
                accessibilityLabel="About Brown"
              >
                <HelpCircleIcon size={20} color="#e4e4e7" />
              </GlassControl>
            </View>
          </View>
        )}

        {/* Main Settings Scroll Container */}
        <ScrollView
          key={currentView} keyboardShouldPersistTaps="handled" style={scrollStyle}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={settingsScroll}
          scrollEventThrottle={16}
        >

          {/* One-UI profile card */}
          {(!searchQuery.trim() ||
            'account'.includes(searchQuery.toLowerCase()) ||
            'profile'.includes(searchQuery.toLowerCase()) ||
            userName.toLowerCase().includes(searchQuery.toLowerCase())) && (
            <TouchableOpacity
              style={styles.iosProfileCard}
              onPress={() => navigateToView('account')}
              activeOpacity={0.7}
            >
              <View style={styles.iosAvatarCircle}>
                <Text style={styles.iosAvatarText}>{userInitial}</Text>
              </View>
              <View style={styles.iosProfileInfo}>
                <Text style={styles.iosProfileName}>{userName}</Text>
                <Text style={styles.iosProfileSubtitle}>{userEmail || 'Add your details'}</Text>
              </View>
              <ChevronRightIcon size={18} color="#5c5c66" />
            </TouchableOpacity>
          )}

          {/* No Search Results Empty State */}
          {searchQuery.trim().length > 0 &&
            settingsGroups.every((g) =>
              g.items.every((it) => !it.title.toLowerCase().includes(searchQuery.toLowerCase()))
            ) &&
            !('account'.includes(searchQuery.toLowerCase()) ||
              'profile'.includes(searchQuery.toLowerCase()) ||
              userName.toLowerCase().includes(searchQuery.toLowerCase())) && (
              <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                <SearchIcon size={32} color="#52525b" />
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600', marginTop: 14 }}>
                  No settings found
                </Text>
                <Text style={{ color: '#71717a', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                  No results matching "{searchQuery}". Try searching for models, sync, voice, or storage.
                </Text>
              </View>
            )}

          {/* One-UI option cards — one flat card per section, full-bleed hairline dividers */}
          {(() => {
            const query = searchQuery.trim().toLowerCase();
            const visibleGroups = settingsGroups
              .map((group) => ({
                ...group,
                items: query
                  ? group.items.filter((it) => it.title.toLowerCase().includes(query))
                  : group.items,
              }))
              .filter((group) => group.items.length > 0);

            return visibleGroups.map((group) => (
              <View key={group.id} style={styles.optionCard}>
                {group.items.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 ? <View style={styles.optionDivider} /> : null}
                    <HoverableSettingsRow onPress={item.action}>
                      <View style={styles.cleanMenuLeft}>
                        <View style={[styles.settingsColorIcon, { backgroundColor: item.iconColor }]}>{renderItemIcon(item.iconType, '#ffffff')}</View>
                        <Text style={styles.cleanMenuTitle}>{item.title}</Text>
                      </View>

                      <View style={styles.cleanMenuRight}>
                        {/* Stacked Hugging Face + Gemini logos for Models */}
                        {item.id === 'models' && (
                          <View style={styles.modelsLogoStack}>
                            <View style={styles.modelsStackedLogo1}>
                              <HuggingFaceLogo size={15} />
                            </View>
                            <View style={styles.modelsStackedLogo2}>
                              <Image
                                source={require('../../Assets/gemini-logo.png')}
                                style={styles.geminiStackedImage}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                        )}
                        {item.detail ? (
                          <Text style={styles.iosRowDetailText} numberOfLines={1}>
                            {item.detail}
                          </Text>
                        ) : null}
                        <ChevronRightIcon size={17} color="#5c5c66" />
                      </View>
                    </HoverableSettingsRow>
                  </React.Fragment>
                ))}
              </View>
            ));
          })()}

          {/* Platform download links */}
          <View style={styles.alsoAvailableGroup}>
            <View style={[styles.optionCard, otherPlatforms.length === 1 && styles.downloadCardPill]}>
              {otherPlatforms.map((platform, index) => (
                <React.Fragment key={platform.id}>
                  {index > 0 ? <View style={styles.optionDivider} /> : null}
                  <TouchableOpacity
                    style={[styles.optionRow, platform.disabled && styles.optionRowDisabled]}
                    onPress={() => {
                      if (platform.disabled) {
                        Alert.alert('In Development', `${platform.label.replace('Download for ', '')} build is currently in development.`);
                        return;
                      }
                      handleOpenDownloadLink(platform.url);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cleanMenuLeft}>
                      <View style={styles.cleanMenuIconBox}>
                        {renderPlatformIcon(platform, 20)}
                      </View>
                      <Text style={styles.cleanMenuTitle}>{platform.label}</Text>
                    </View>
                    <View style={styles.downloadArrowCircle}>
                      <ArrowUpRightIcon size={14} color="#111111" />
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
            <Text style={styles.bottomVersionLabel}>V{currentAppVersion}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  accountScrollContent: { flexGrow: 1 },
  accountDeleteFooter: { marginTop: 'auto', paddingTop: 24 },
  deleteAccountButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F5B6BD', borderRadius: 9999, paddingHorizontal: 18, paddingVertical: 14, minHeight: 48, marginTop: 18 },
  deleteAccountText: { color: '#70232E', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  screenTitle: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: { ...headerButtonStyle },
  mainHeaderRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'visible',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    minHeight: 58,
    width: '100%',
    alignSelf: 'center',
  },
  mainHeaderRowScrolled: {
    backgroundColor: 'transparent',
  },
  mainHeaderSearchActive: {
    paddingLeft: 14,
    paddingRight: 10,
    gap: 10,
  },
  headerSearchBar: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#373737',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  headerSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    textAlign: 'left',
    textAlignVertical: 'center',
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  searchCloseBtn: { ...headerButtonStyle },
  settingsBackBtn: { ...headerButtonStyle },
  settingsTitleText: {
    position: 'absolute',
    left: 112,
    right: 112,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  fullscreenBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: 'transparent',
  },
  spotlightContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#000000',
  },
  spotlightBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 9999,
    paddingHorizontal: 14,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  spotlightInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    marginLeft: 8,
    paddingVertical: 0,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 76,
    paddingBottom: 44,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  fullPageScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 82,
    paddingBottom: 50,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  alsoAvailableGroup: {
    marginTop: 6,
    gap: 8,
  },
  menuGroupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
    gap: 8,
  },
  menuGroupBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  menuGroupBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  iosProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 36,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iosAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#295294',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iosAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  iosProfileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  iosProfileName: {
    color: '#ffffff',
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  iosProfileSubtitle: {
    color: '#8e8e93',
    fontSize: 13,
    marginTop: 3,
  },
  optionCard: {
    backgroundColor: '#161719',
    borderRadius: 28,
    overflow: 'hidden',
  },
  optionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 74,
    marginRight: 18,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionRowDisabled: {
    opacity: 0.5,
  },
  /* Only the download card is a single row, so it can go full pill like the profile card */
  downloadCardPill: {
    borderRadius: 28,
  },
  downloadArrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanMenuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  settingsColorIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cleanMenuIconBox: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  cleanMenuTitle: {
    flex: 1,
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  cleanMenuRight: {
    maxWidth: '40%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iosRowDetailText: {
    flexShrink: 1,
    color: '#8e8e93',
    fontSize: 13.5,
    fontWeight: '400',
  },
  modelsLogoStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  modelsStackedLogo1: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1c1c1e',
    zIndex: 2,
  },
  modelsStackedLogo2: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1c1c1e',
    marginLeft: -8,
    zIndex: 1,
  },
  geminiStackedImage: {
    width: 15,
    height: 15,
  },
  pageCardGroup: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  voiceSection: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  voiceIntroTitle: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '500',
  },
  voiceIntroDescription: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    marginTop: 5,
  },
  sectionCardTitle: {
    textAlign: 'left',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionCardSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  desktopSectionHeading: {
    textAlign: 'left',
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  centerSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  editAvatarBigCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 12,
  },
  editAvatarInitialText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
  },
  pageMainHeading: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pageSubHeading: {
    color: '#9ca3af',
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 18,
  },
  transparentFormContainer: {
    gap: 20,
    marginTop: 6,
  },
  floatingBorderField: {
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 14,
    backgroundColor: 'transparent',
    height: 52,
    justifyContent: 'center',
  },
  floatingBorderLabelBadge: {
    position: 'absolute',
    top: -9,
    left: 14,
    backgroundColor: '#111111',
    paddingHorizontal: 6,
    zIndex: 10,
  },
  floatingBorderLabelText: {
    color: '#a1a1aa',
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  floatingBorderInput: {
    color: '#ffffff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 48,
  },
  calendarToggleBtn: {
    position: 'absolute',
    right: 12,
    top: 15,
    padding: 2,
  },
  customDatepickerPopover: {
    backgroundColor: '#212121',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 50,
  },
  datepickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 4,
  },
  datepickerMonthYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  datepickerMonthYearText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  datepickerNavArrows: {
    flexDirection: 'row',
    gap: 4,
  },
  datepickerArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datepickerDaysSection: {
    width: '100%',
  },
  datepickerWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  datepickerWeekDayText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    width: 32,
    textAlign: 'center',
  },
  datepickerDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 6,
  },
  datepickerDayCell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  datepickerDayCellSelected: {
    backgroundColor: '#3b82f6',
  },
  datepickerDayText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  datepickerDayTextSelected: {
    fontWeight: '700',
    color: '#ffffff',
  },
  verticalSelectionList: {
    maxHeight: 180,
  },
  verticalListItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 3,
    backgroundColor: 'transparent',
  },
  verticalListItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  verticalListText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '500',
  },
  verticalListTextSelected: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  fullPageActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  cancelFullBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 9999,
    backgroundColor: '#27272a',
  },
  cancelFullBtnText: {
    color: '#d4d4d8',
    fontSize: 14,
    fontWeight: '600',
  },
  saveFullBtn: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 9999,
    backgroundColor: '#3b82f6',
  },
  saveFullBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryFullBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryFullBtnText: {
    color: '#000000',
    fontSize: 14.5,
    fontWeight: '700',
  },
  secondaryFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingVertical: 12,
  },
  secondaryFullBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  notifPermissionRow: {
    marginTop: 14,
    gap: 12,
  },
  notifPermissionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#295294',
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  notifPermissionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  fullPageDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  fullPageRowLabel: {
    color: '#d4d4d8',
    fontSize: 14,
    fontWeight: '500',
  },
  fullPageRowValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  chimeOptionSeparator: { borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.45)' },
  toggleDesc: {
    color: '#71717a',
    fontSize: 11.5,
    marginTop: 3,
    maxWidth: '85%',
  },
  speedPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  speedPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  speedPillActive: {
    backgroundColor: '#ffffff',
  },
  speedPillText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  speedPillTextActive: {
    color: '#000000',
  },
  // Voice persona cards (mirrors the desktop Voice tab overlay design)
  voiceGrid: {
    gap: 10,
    marginTop: 12,
    alignSelf: 'stretch',
  },
  voiceGridRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  voiceCard: {
    flex: 1,
    minWidth: 0,
    // Explicit height prevents absolutely positioned content collapsing in a wrapped grid.
    height: 240,
    flexShrink: 0,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#242428',
  },
  voiceCardActive: {
    borderColor: '#166534',
    borderWidth: 2,
  },
  voiceCardImg: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  voiceCardInfo: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 11,
    gap: 3,
  },
  voiceCardName: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
  },
  voiceCardTick: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  voiceCardTickText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  voiceCardDesc: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.regular,
    fontSize: 11.5,
    lineHeight: 15,
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  voiceCardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
    gap: 6,
  },
  voicePlayPill: {
    width: 36,
    height: 36,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  voicePlayPillText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '600',
  },
  voicePillDisabled: {
    opacity: 0.45,
  },
  voiceSelectPill: {
    flex: 1,
    minWidth: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#303034',
  },
  voiceSelectPillText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  voiceSelectPillSelected: {
    flex: 1,
    minWidth: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#303034',
  },
  voiceSelectPillSelectedText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  voiceIntroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  voiceDownloadsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', padding: 2, borderRadius: 22, backgroundColor: '#242424' },
  voiceDownloadsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
  voiceDownloadsPanel: { backgroundColor: '#202020', borderRadius: 22, maxHeight: '90%', flexGrow: 0 },
  voiceDownloadClose: { color: '#ffffff', fontSize: 28, paddingHorizontal: 8 },
  voiceDownloadItem: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  voiceDownloadCopy: { flex: 1, minWidth: 0 },
  voiceDownloadControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceDownloadCancel: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  voiceDownloadName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  voiceDownloadDetail: { color: '#d4d4d4', fontSize: 12, lineHeight: 17, marginTop: 3 },
  voiceDownloadTrack: { height: 4, backgroundColor: '#444444', borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  voiceDownloadFill: { height: '100%', backgroundColor: '#ffffff' },
  modelsFullList: {
    gap: 10,
    marginTop: 8,
  },
  storageActionColumn: {
    gap: 10,
    marginTop: 12,
  },
  exportBackupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingVertical: 12,
  },
  exportBackupBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  clearChatsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    borderRadius: 9999,
    paddingVertical: 12,
  },
  clearChatsBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  connectWorkstationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 12,
    marginTop: 10,
  },
  connectWorkstationBtnText: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '700',
  },
  syncStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  syncStatusPillConnected: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  syncStatusPillDisconnected: {
    backgroundColor: 'rgba(161, 161, 170, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(161, 161, 170, 0.25)',
  },
  syncStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncStatusDotConnected: {
    backgroundColor: '#22c55e',
  },
  syncStatusDotDisconnected: {
    backgroundColor: '#a1a1aa',
  },
  syncStatusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncStatusPillTextConnected: {
    color: '#22c55e',
  },
  syncStatusPillTextDisconnected: {
    color: '#a1a1aa',
  },

  /* Desktop Connectors & Models Styles */
  connectorCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  connectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  connectorTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectorLogoImg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 4,
  },
  connectorName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  connectorEndpoint: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: 'rgba(161, 161, 170, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(161, 161, 170, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusBadgeText: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadgeConnected: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusBadgeTextConnected: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '600',
  },
  connectorDesc: {
    color: '#a1a1aa',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  addKeyBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  addKeyBtnText: {
    color: '#000000',
    fontSize: 12.5,
    fontWeight: '700',
  },
  geminiKeyForm: {
    marginTop: 12,
    width: '100%',
  },
  geminiKeyInput: {
    width: '100%',
    backgroundColor: '#111113',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  geminiKeyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  saveKeyBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveKeyBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelKeyBtn: {
    backgroundColor: 'transparent',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelKeyBtnText: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  ollamaCloudAuthCard: {
    backgroundColor: '#121214',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  ollamaCloudTitle: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  ollamaCloudDesc: {
    color: '#71717a',
    fontSize: 11.5,
    marginTop: 3,
    lineHeight: 15,
  },
  codeSnippet: {
    color: '#38bdf8',
    fontFamily: typography.fontFamily.mono,
  },
  ollamaSignOutBtn: {
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 10,
  },
  ollamaSignOutBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  installedModelsHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  addModelsTriggerBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addModelsTriggerBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  tagFiltersRow: {
    marginVertical: 4,
  },
  tagFilterPill: {
    backgroundColor: '#1A1A1A',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tagFilterPillActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  tagFilterPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  tagFilterPillTextActive: {
    color: '#ffffff',
  },
  desktopModelRowCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  desktopModelRowCardActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  modelRowCardHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modelRowCardTitle: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700',
  },
  weightsBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  weightsBadgeText: {
    color: '#d4d4d8',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modelSizePill: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '500',
  },
  modelRowCardDesc: {
    color: '#a1a1aa',
    fontSize: 11.5,
    marginTop: 4,
    lineHeight: 16,
  },
  offlineTypePill: {
    backgroundColor: 'rgba(96, 165, 250, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  offlineTypePillText: {
    color: '#60a5fa',
    fontSize: 9.5,
    fontWeight: '700',
  },
  visionTypePill: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  visionTypePillText: {
    color: '#34d399',
    fontSize: 9.5,
    fontWeight: '700',
  },
  modelRowCardActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
  },
  modelSelectActionBtn: {
    flex: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  modelSelectActionBtnActive: {
    backgroundColor: '#3b82f6',
  },
  modelSelectActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  modelSelectActionBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modelDeleteActionBtn: {
    flex: 1,
    minWidth: 0,
    height: 44,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  modelDeleteActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Account Screen Styles */
  accountProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B1B1B',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  accountAvatarLarge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarBigText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  accountNameText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  accountEmailText: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 2,
  },
  accountEditHeaderBtn: {
    width: 80,
    height: 40,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#27272a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  accountEditHeaderBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '600',
  },
  /* Storage Screen Styles */
  inputFieldLabel: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  storageInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storageTextInput: {
    flex: 1,
    backgroundColor: '#111113',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 12.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  storagePathText: { color: '#ffffff', fontSize: 12.5 },
  storageChooseLabel: { color: '#60a5fa', fontSize: 12, marginTop: 4 },
  browseStorageBtn: {
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  browseStorageBtnText: {
    color: '#000000',
    fontSize: 12.5,
    fontWeight: '700',
  },
  storageHintText: {
    color: '#71717a',
    fontSize: 11.5,
    marginTop: 6,
    lineHeight: 15,
  },

  /* Software Updates Styles */
  /* Software update screen — One UI layout in the Brown dark palette.
     Text blocks are wrapped in Views so the scroll container's 14pt gap only
     lands between blocks, never inside the headline stack. */
  updateKicker: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.medium,
    fontSize: 13.5,
    letterSpacing: 0.1,
  },
  updateHeadline: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1,
    marginTop: 2,
  },
  updateStatusText: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.medium,
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 5,
  },
  updateLegal: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: typography.fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
  },
  updateSectionTitle: {
    textAlign: 'left',
    color: '#ffffff',
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 17,
    letterSpacing: -0.3,
    marginTop: 0,
    marginBottom: 2,
  },
  updateNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 7,
  },
  updateNoteBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#60a5fa',
    marginTop: 7,
  },
  updateNoteText: {
    flex: 1,
    color: '#ffffff',
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    lineHeight: 19,
  },
  updateLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  updateLinkText: {
    color: '#93c5fd',
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    flex: 1,
  },
  updateLinkChevron: {
    transform: [{ rotate: '0deg' }],
  },
  updateLinkChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  updateGroupLabel: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.medium,
    fontSize: 12.5,
    letterSpacing: 0.2,
    marginTop: 0,
    marginBottom: 6,
  },
  updateInfoCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
  },
  updateInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    gap: 14,
  },
  updateInfoRowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  updateSettingLabel: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
  },
  updateSettingValue: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    textAlign: 'right',
    flexShrink: 1,
  },
  updateSettingDesc: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
    maxWidth: '85%',
  },
  updatePrimaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#295294',
    borderRadius: 9999,
    paddingVertical: 14,
    marginTop: 0,
  },
  updatePrimaryBtnDisabled: {
    opacity: 0.6,
  },
  updatePrimaryBtnText: {
    color: '#ffffff',
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  updateFootnote: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 0,
  },

  /* About Screen Styles */
  aboutCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  aboutBrandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    paddingBottom: 4,
  },
  aboutAppLogo: {
    width: 46,
    height: 46,
  },
  aboutAppTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
  },
  aboutVersionBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  aboutVersionBadgeText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '700',
  },
  aboutTagline: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  aboutSectionTitle: {
    textAlign: 'left',
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  aboutParagraph: {
    color: '#a1a1aa',
    fontSize: 12.5,
    lineHeight: 18,
  },
  aboutSpecsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  aboutSpecItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  aboutSpecLabel: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  aboutSpecValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  aboutSocialIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginTop: 22,
    marginBottom: 6,
  },
  aboutSocialIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  alsoAvailableContainer: {
    marginTop: 20,
  },
  alsoAvailableTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  platformButtonsGrid: {
    gap: 10,
  },
  platformButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  platformButtonText: {
    color: '#000000',
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  platformButtonArrow: {
    color: '#71717a',
    fontSize: 13,
    fontWeight: '500',
  },
  bottomVersionLabel: {
    marginTop: 4,
    textAlign: 'center',
    color: '#71717a',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
});
