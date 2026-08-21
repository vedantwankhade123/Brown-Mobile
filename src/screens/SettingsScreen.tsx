import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  Platform,
  Animated,
  Image,
} from 'react-native';
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService, ConsentRecord } from '../services/storage/ConsentService';
import { SoundService } from '../services/sound/SoundService';
import { saveGeminiApiKey, getGeminiApiKey, discoverGeminiModels, getCachedGeminiModels } from '../services/inference/GeminiClient';
import { ScreenHeader } from '../components/ScreenHeader';
import { HuggingFaceLogo } from '../components/HuggingFaceLogo';
import { typography, spacing, borderRadius } from '../theme/typography';
import {
  SearchIcon,
  CloseIcon,
  ShieldCheckIcon,
  CpuIcon,
  TrashIcon,
  LaptopIcon,
  UserIcon,
  MicIcon,
  CheckIcon,
  SparklesIcon,
  PencilIcon,
  HelpCircleIcon,
  LockIcon,
  ZapIcon,
  IdCardIcon,
  SlidersIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  VolumeIcon,
  DatabaseIcon,
  DownloadIcon,
  GlobeIcon,
  WifiIcon,
  GithubIcon,
  WindowsIcon,
  AppleIcon,
  AndroidIcon,
  InfoIcon,
  MapPinIcon,
  SyncArrowsIcon,
  SoftwareUpdateIcon,
  AboutUltronIcon,
} from '../components/Icons';
import { getInstalledDeviceModels } from '../services/modelManager/ModelCatalog';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { ModelMetadata } from '../types/model';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { StoragePaths } from '../services/storage/StoragePaths';
import { ProfileService } from '../services/storage/ProfileService';
import { DesktopSyncService } from '../services/sync/DesktopSync';

export type SettingsView =
  | 'main'
  | 'account'
  | 'edit_profile'
  | 'models'
  | 'sounds'
  | 'storage'
  | 'data_sync'
  | 'updates'
  | 'about';

interface SettingsScreenProps {
  onBack: () => void;
  onClearHistory: () => void;
  onRerunOnboarding?: () => void;
  onOpenModelStore?: () => void;
}

const MONTHS_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MODEL_TAG_FILTERS = ['All', 'Cloud', 'Offline', 'Thinking', 'Vision', 'Code', 'Embedding'];

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
          paddingVertical: 18,
          paddingHorizontal: 16,
          borderRadius: 12,
        },
        isHovered && { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
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
  onBack,
  onClearHistory,
  onOpenModelStore,
}) => {
  const [profile, setProfile] = useState<ConsentRecord | null>(null);
  const [currentView, setCurrentView] = useState<SettingsView>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);

  // Smooth Screen Slide & Fade Animation
  const screenSlideAnim = useRef(new Animated.Value(20)).current;
  const screenFadeAnim = useRef(new Animated.Value(0)).current;

  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBirthdate, setEditBirthdate] = useState('');
  const [homeLocation, setHomeLocation] = useState('Mumbai, India');
  const [locationStatusText, setLocationStatusText] = useState('✓ Location synced with local device GPS.');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [autoDetectLocation, setAutoDetectLocation] = useState(true);

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

  // Agent Sounds & Speech States (Desktop Parity)
  const [autoSpeakTts, setAutoSpeakTts] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voiceSensitivity, setVoiceSensitivity] = useState('Balanced');
  const [completionSound, setCompletionSound] = useState(true);
  const [permissionSound, setPermissionSound] = useState(true);
  const [questionSound, setQuestionSound] = useState(true);

  // Storage & Memory States (Desktop Parity)
  const [memoryPersistence, setMemoryPersistence] = useState(true);
  const [customDataDir, setCustomDataDir] = useState('/data/user/0/com.ultron.mobile/files');
  const [customConnectorsDir, setCustomConnectorsDir] = useState('/data/user/0/com.ultron.mobile/models');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [autoConnectWifi, setAutoConnectWifi] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);

  // Software Updates State (Desktop Parity)
  const [updateStatus, setUpdateStatus] = useState<'up-to-date' | 'checking' | 'available'>('up-to-date');
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);

  const chatRepo = new ChatRepository();

  // Trigger smooth enter animation on screen change
  useEffect(() => {
    screenSlideAnim.setValue(20);
    screenFadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(screenSlideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(screenFadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentView]);

  useEffect(() => {
    loadConsentProfile();
    loadGeminiKey();
    loadStorageAndSyncPrefs();
    if (autoDetectLocation) {
      performRealLocationDetection();
    }
    const downloader = ModelDownloader.getInstance();
    downloader.whenReady().then(() => setModelsRevision((n) => n + 1));
    return downloader.subscribe(() => {
      setModelsRevision((n) => n + 1);
    });
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
        setEditName('Vedant Wankhade');
        setEditEmail('vedantwankhade47@gmail.com');
        setEditBirthdate('14/01/2005');
        parseDateToCalendar('14/01/2005');
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

  // Real high-accuracy location detection service
  const performRealLocationDetection = async () => {
    setIsDetectingLocation(true);
    setLocationStatusText('Detecting real-time device location…');

    // 1. Prioritize precise GPS / Device Geolocation first (highest accuracy)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const gpsSuccess = await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              
              // A. Query OpenStreetMap Nominatim reverse geocoder
              const osmRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`,
                { headers: { 'User-Agent': 'UltronMobile/1.0' } }
              );
              if (osmRes.ok) {
                const geo = await osmRes.json();
                const addr = geo.address || {};
                const city = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || addr.district || addr.state_district || addr.county;
                const state = addr.state || addr.region;
                const country = addr.country || 'India';
                if (city) {
                  const loc = state && state !== city ? `${city}, ${state}, ${country}` : `${city}, ${country}`;
                  setHomeLocation(loc);
                  setLocationStatusText(`✓ Located (GPS): ${loc}`);
                  setIsDetectingLocation(false);
                  resolve(true);
                  return;
                }
              }

              // B. Fallback to BigDataCloud client reverse geocode
              const bdcRes = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
              );
              if (bdcRes.ok) {
                const bdc = await bdcRes.json();
                const city = bdc.city || bdc.locality || bdc.principalSubdivision;
                const state = bdc.principalSubdivision;
                const country = bdc.countryName || 'India';
                if (city) {
                  const loc = state && state !== city ? `${city}, ${state}, ${country}` : `${city}, ${country}`;
                  setHomeLocation(loc);
                  setLocationStatusText(`✓ Located (GPS): ${loc}`);
                  setIsDetectingLocation(false);
                  resolve(true);
                  return;
                }
              }
            } catch {}
            resolve(false);
          },
          () => resolve(false),
          { timeout: 7000, enableHighAccuracy: true, maximumAge: 10000 }
        );
      });

      if (gpsSuccess) return;
    }

    // 2. Fallback to multi-tier IP Geolocation services if GPS is unavailable
    const ipServices = [
      'https://ipwho.is/',
      'https://ipapi.co/json/',
      'https://freeipapi.com/api/json',
      'https://geolocation-db.com/json/',
    ];

    for (const url of ipServices) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const city = data.cityName || data.city || data.locality || data.region;
          const country = data.countryName || data.country || data.country_name || 'India';
          const region = data.regionName || data.region || data.state;
          if (city) {
            const loc = region && region !== city ? `${city}, ${region}, ${country}` : `${city}, ${country}`;
            setHomeLocation(loc);
            setLocationStatusText(`✓ Located (Network): ${loc}`);
            setIsDetectingLocation(false);
            return;
          }
        }
      } catch {}
    }

    // 3. Fallback to system timezone
    fallbackTimezoneLocation();
  };

  const fallbackTimezoneLocation = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) {
        setHomeLocation('Mumbai, Maharashtra, India');
        setLocationStatusText('✓ Located: Mumbai, Maharashtra, India');
      } else {
        const parts = tz.split('/');
        const city = parts[parts.length - 1].replace(/_/g, ' ');
        const loc = `${city}`;
        setHomeLocation(loc);
        setLocationStatusText(`✓ Detected from system: ${loc}`);
      }
    } catch {
      setHomeLocation('Mumbai, Maharashtra, India');
      setLocationStatusText('✓ Default location: Mumbai, India');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleSmoothBack = () => {
    if (currentView !== 'main') {
      Animated.parallel([
        Animated.timing(screenSlideAnim, {
          toValue: 20,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(screenFadeAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentView('main');
      });
      return;
    }

    Animated.parallel([
      Animated.timing(screenSlideAnim, {
        toValue: 30,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(screenFadeAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onBack();
    });
  };

  const navigateToView = (view: SettingsView) => {
    Animated.parallel([
      Animated.timing(screenSlideAnim, {
        toValue: -15,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(screenFadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentView(view);
    });
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
      email: editEmail.trim() || 'vedantwankhade47@gmail.com',
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
      'This will permanently delete all conversation sessions and messages encrypted in local SQLite on this device.',
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

  const handleExportData = () => {
    Alert.alert(
      'Export Backup',
      'Encrypted JSON backup file generated successfully in local device storage: /Documents/Ultron_Backup.json',
      [{ text: 'OK' }]
    );
  };

  const handleCheckUpdates = () => {
    setUpdateStatus('checking');
    setTimeout(() => {
      setUpdateStatus('up-to-date');
      Alert.alert('Software Update', 'Ultron Mobile BETA v1 is up to date.');
    }, 1200);
  };

  const userName = profile?.fullName || 'Vedant Wankhade';
  const userEmail = profile?.email || 'vedantwankhade47@gmail.com';
  const userInitial = userName.charAt(0).toUpperCase();

  const ULTRON_DOWNLOAD_URL = 'https://ultron.dev/download';

  // Platform-aware "Also Available On" links
  const currentPlatform = Platform.OS; // 'android' | 'ios' | 'web' | 'windows' | 'macos'
  const allPlatforms = [
    { id: 'windows', label: 'Download for Windows', icon: 'windows', color: '#0078D4', branded: true, url: `${ULTRON_DOWNLOAD_URL}?platform=windows`, disabled: false },
    { id: 'macos', label: 'Download for macOS', icon: 'apple', color: '#000000', branded: false, url: `${ULTRON_DOWNLOAD_URL}?platform=macos`, disabled: true },
    { id: 'ios', label: 'Download for iOS', icon: 'apple', color: '#007AFF', branded: false, url: `${ULTRON_DOWNLOAD_URL}?platform=ios`, disabled: true },
    { id: 'android', label: 'Download for Android', icon: 'android', color: '#3DDC84', branded: false, url: `${ULTRON_DOWNLOAD_URL}?platform=android`, disabled: false },
  ];
  // Filter out the current platform
  const otherPlatforms = allPlatforms.filter((p) => {
    if (currentPlatform === 'android') return p.id !== 'android';
    if (currentPlatform === 'ios') return p.id !== 'ios';
    if (currentPlatform === 'web') return true; // show all on web
    return p.id !== currentPlatform;
  });

  const renderPlatformIcon = (platform: { icon: string; color: string; branded?: boolean }, size: number) => {
    switch (platform.icon) {
      case 'windows': return <WindowsIcon size={size} color={platform.color} branded={platform.branded} />;
      case 'apple': return <AppleIcon size={size} color={platform.color} />;
      case 'android': return <Image source={require('../../Assets/android-logo.png')} style={{ width: size + 2, height: size + 2 }} resizeMode="contain" />;
      default: return <GlobeIcon size={size} color={platform.color} />;
    }
  };

  const handleOpenDownloadLink = (url: string) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank');
      } else {
        // For native platforms, use Alert as fallback
        Alert.alert('Download Ultron', url);
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
        {
          id: 'location',
          title: 'Location',
          iconType: 'location',
          iconColor: '#f87171',
          detail: homeLocation ? (homeLocation.length > 18 ? `${homeLocation.slice(0, 18)}…` : homeLocation) : 'Detecting…',
          action: () => navigateToView('account'),
        },
        {
          id: 'data_sync',
          title: 'Desktop Sync',
          iconType: 'sync',
          iconColor: '#38bdf8',
          detail: 'Offline',
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
          id: 'sounds',
          title: 'Voice & Speech',
          iconType: 'volume',
          iconColor: '#fb7185',
          detail: 'Kokoro 82M',
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
          detail: 'BETA v1',
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
          title: 'About Ultron',
          iconType: 'about',
          iconColor: '#e4e4e7',
          detail: 'BETA v1',
          action: () => navigateToView('about'),
        },
      ],
    },
  ];

  const renderItemIcon = (iconType: string, iconColor: string = '#ffffff') => {
    let iconEl = <CpuIcon size={19} color={iconColor} />;
    if (iconType === 'user') iconEl = <UserIcon size={19} color={iconColor} />;
    else if (iconType === 'cpu') iconEl = <CpuIcon size={19} color={iconColor} />;
    else if (iconType === 'location') iconEl = <MapPinIcon size={19} color={iconColor} />;
    else if (iconType === 'sync') iconEl = <SyncArrowsIcon size={19} color={iconColor} />;
    else if (iconType === 'volume') iconEl = <VolumeIcon size={19} color={iconColor} />;
    else if (iconType === 'database') iconEl = <DatabaseIcon size={19} color={iconColor} />;
    else if (iconType === 'update') iconEl = <SoftwareUpdateIcon size={19} color={iconColor} />;
    else if (iconType === 'about') iconEl = <AboutUltronIcon size={19} color={iconColor} />;
    else if (iconType === 'shield') iconEl = <ShieldCheckIcon size={19} color={iconColor} />;

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
  const installedCatalog = getInstalledDeviceModels(downloadedIds);
  const filteredModels = installedCatalog.filter((m) => {
    if (activeModelFilter === 'All') return true;
    if (activeModelFilter === 'Cloud') return false;
    if (activeModelFilter === 'Offline') return m.provider === 'device';
    if (activeModelFilter === 'Thinking') return m.tags.includes('Deep Reasoning') || m.tags.includes('Reasoning Specialist');
    if (activeModelFilter === 'Vision') return m.capabilities?.images === true;
    if (activeModelFilter === 'Code') return m.tags.includes('Code Specialist');
    if (activeModelFilter === 'Embedding') return m.tags.includes('Embedding');
    return true;
  });

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
    <ScreenHeader title={title} onBack={onCustomBack || handleSmoothBack} />
  );

  // ==========================================
  // FULL-PAGE VIEW: EDIT PROFILE DETAILS
  // ==========================================
  if (currentView === 'edit_profile') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Edit Profile', () => navigateToView('account'))}

          {showDatePicker && (
            <TouchableOpacity
              style={styles.fullscreenBackdrop}
              onPress={() => setShowDatePicker(false)}
              activeOpacity={1}
            />
          )}

          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.centerSection}>
              <View style={styles.editAvatarBigCircle}>
                <Text style={styles.editAvatarInitialText}>{userInitial}</Text>
              </View>
              <Text style={styles.pageMainHeading}>Profile Details</Text>
              <Text style={styles.pageSubHeading}>Updates are stored exclusively on your device's encrypted storage.</Text>
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
                <TouchableOpacity
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
                    <TouchableOpacity
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
                      <TouchableOpacity
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
                      <TouchableOpacity
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
                            <TouchableOpacity
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
                    <ScrollView style={styles.verticalSelectionList} showsVerticalScrollIndicator={false}>
                      {MONTHS_LIST.map((mName, idx) => (
                        <TouchableOpacity
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
                    <ScrollView style={styles.verticalSelectionList} showsVerticalScrollIndicator={false}>
                      {yearsList.map((yVal) => (
                        <TouchableOpacity
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
                <TouchableOpacity style={styles.cancelFullBtn} onPress={() => navigateToView('account')} activeOpacity={0.8}>
                  <Text style={styles.cancelFullBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveFullBtn} onPress={handleSaveProfile} activeOpacity={0.8}>
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
  if (currentView === 'account') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('User Account')}
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            {/* User Profile Card without Green Badge */}
            <View style={styles.accountProfileCard}>
              <View style={styles.accountAvatarLarge}>
                <Text style={styles.avatarBigText}>{userInitial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountNameText}>{userName}</Text>
                <Text style={styles.accountEmailText}>{userEmail}</Text>
              </View>
              <TouchableOpacity
                style={styles.accountEditHeaderBtn}
                onPress={() => navigateToView('edit_profile')}
                activeOpacity={0.7}
              >
                <PencilIcon size={14} color="#ffffff" />
                <Text style={styles.accountEditHeaderBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Location Card with Info Tooltip Button and Auto-detect Toggle */}
            <View style={styles.locationCardGroup}>
              <View style={styles.locationHeaderRow}>
                <View style={styles.locationTitleGroup}>
                  <MapPinIcon size={18} color="#f87171" />
                  <Text style={styles.locationSectionTitle}>Location</Text>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        'Location Context',
                        'Your location is used locally by Ultron AI for accurate real-time weather forecasts, time zone synchronization, and local assistant queries. It stays 100% private on your device.'
                      )
                    }
                    activeOpacity={0.7}
                    style={styles.locationInfoBtn}
                    accessibilityLabel="About Location"
                  >
                    <InfoIcon size={15} color="#8e8e93" />
                  </TouchableOpacity>
                </View>
                <View style={styles.autoLocationToggleRow}>
                  <Text style={styles.autoLocationToggleLabel}>Auto-detect</Text>
                  <ToggleSwitch
                    value={autoDetectLocation}
                    onValueChange={(val: boolean) => {
                      setAutoDetectLocation(val);
                      if (val) performRealLocationDetection();
                    }}
                  />
                </View>
              </View>

              <View style={styles.locationInputRow}>
                <View style={styles.locationInputBox}>
                  <MapPinIcon size={16} color="#71717a" />
                  <TextInput
                    style={[styles.locationTextInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={homeLocation}
                    onChangeText={setHomeLocation}
                    placeholder="e.g. Nagpur, Maharashtra, India"
                    placeholderTextColor="#71717a"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.detectLocationBtn, isDetectingLocation && { opacity: 0.7 }]}
                  onPress={performRealLocationDetection}
                  activeOpacity={0.8}
                  disabled={isDetectingLocation}
                >
                  <MapPinIcon size={14} color="#ffffff" />
                  <Text style={styles.detectLocationBtnText}>
                    {isDetectingLocation ? 'Locating…' : 'Detect'}
                  </Text>
                </TouchableOpacity>
              </View>

              {locationStatusText ? (
                <View style={styles.locationStatusRow}>
                  <CheckIcon size={13} color="#34d399" />
                  <Text style={styles.locationStatusHintText}>
                    {locationStatusText.replace(/^✓\s*/, '')}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.accountFooterNote}>
              Google OAuth and local cryptographic keystores operate on-device for secure sovereign execution.
            </Text>
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
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            {/* Section 1: Connectors & Weights Header */}
            <Text style={styles.desktopSectionHeading}>{'Connectors & Weights'}</Text>

            {/* Connector Card 1: Google Gemini */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <Image
                    source={require('../../Assets/gemini-logo.png')}
                    style={styles.connectorLogoImg}
                    resizeMode="contain"
                  />
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.connectorName}>Google Gemini</Text>
                      <View style={[styles.statusBadge, isGeminiConnected && styles.statusBadgeConnected]}>
                        <Text style={[styles.statusBadgeText, isGeminiConnected && styles.statusBadgeTextConnected]}>
                          {isGeminiConnected ? 'Connected' : 'Not connected'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.connectorEndpoint}>Endpoint: https://generativelanguage.googleapis.com</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.connectorDesc}>
                Uses only chat models this API key can actually call. Get a key at{' '}
                <Text style={{ color: '#60a5fa', textDecorationLine: 'underline' }}>aistudio.google.com</Text>.
              </Text>

              {!showGeminiKeyInput ? (
                <TouchableOpacity
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
                    <TouchableOpacity
                      style={styles.cancelKeyBtn}
                      onPress={() => setShowGeminiKeyInput(false)}
                      activeOpacity={0.7}
                      disabled={geminiDiscovering}
                    >
                      <Text style={styles.cancelKeyBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
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

            {/* Connector Card 2: Hugging Face */}
            <View style={styles.connectorCard}>
              <View style={styles.connectorHeaderRow}>
                <View style={styles.connectorTitleGroup}>
                  <HuggingFaceLogo size={28} />
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

            {/* Section 2: Installed Models Header with Fully Rounded + Add Models */}
            <View style={styles.installedModelsHeaderRow}>
              <Text style={styles.desktopSectionHeading}>Installed Models</Text>
              <TouchableOpacity
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
              horizontal
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
                  <TouchableOpacity
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
              {filteredModels.length === 0 ? (
                <Text style={styles.connectorDesc}>
                  No GGUF files on this phone yet. Tap + Add Models to download an open-source weight.
                </Text>
              ) : filteredModels.map((m) => {
                const isSelected = selectedModelId === m.id;
                const isDevice = m.provider === 'device';
                return (
                  <View key={m.id} style={[styles.desktopModelRowCard, isSelected && styles.desktopModelRowCardActive]}>
                    <View style={styles.modelRowCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.modelRowCardTitle}>{m.name}</Text>
                          {isDevice && (
                            <View style={styles.weightsBadge}>
                              <Text style={styles.weightsBadgeText}>WEIGHTS</Text>
                            </View>
                          )}
                          <Text style={styles.modelSizePill}>{m.sizeFormatted}</Text>
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
                        <TouchableOpacity
                          style={[styles.modelSelectActionBtn, isSelected && styles.modelSelectActionBtnActive]}
                          onPress={() => setSelectedModelId(m.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.modelSelectActionBtnText, isSelected && styles.modelSelectActionBtnTextActive]}>
                            {isSelected ? 'Active' : 'Select'}
                          </Text>
                        </TouchableOpacity>

                        {isDevice && (
                          <TouchableOpacity
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
                            <TrashIcon size={14} color="#ef4444" />
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
          {renderFullPageHeader('Agent Sounds')}
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            {/* 1. Voice Input Section */}
            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>Voice input</Text>
              <Text style={styles.sectionCardSubtitle}>
                Built-in on-device neural speech recognition for the mic button. No API key required.
              </Text>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Speech Engine</Text>
                <Text style={styles.fullPageRowValue}>Ultron Whisper.cpp (Local)</Text>
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Voice sensitivity</Text>
                <Text style={styles.fullPageRowValue}>{voiceSensitivity}</Text>
              </View>
            </View>

            {/* 2. AI Voice Output Section */}
            <View style={styles.pageCardGroup}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>AI voice output</Text>
                  <Text style={styles.sectionCardSubtitle}>
                    Natural offline neural voice synthesis. Skips raw code blocks and markdown.
                  </Text>
                </View>
                <ToggleSwitch
                  value={autoSpeakTts}
                  onValueChange={setAutoSpeakTts}
                />
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Voice persona</Text>
                <Text style={styles.fullPageRowValue}>Neutral</Text>
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Speech rate</Text>
                <View style={styles.speedPillsRow}>
                  {[0.8, 1.0, 1.2, 1.4].map((spd) => (
                    <TouchableOpacity
                      key={spd}
                      style={[styles.speedPill, speechRate === spd && styles.speedPillActive]}
                      onPress={() => setSpeechRate(spd)}
                    >
                      <Text style={[styles.speedPillText, speechRate === spd && styles.speedPillTextActive]}>
                        {spd}×
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* 3. Notification Chimes Section */}
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
                  onValueChange={setCompletionSound}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullPageRowLabel}>Tool Permission Chime</Text>
                  <Text style={styles.toggleDesc}>Play chime when confirmation is prompted</Text>
                </View>
                <ToggleSwitch
                  value={permissionSound}
                  onValueChange={setPermissionSound}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullPageRowLabel}>Question Prompt Chime</Text>
                  <Text style={styles.toggleDesc}>Play tone when assistant asks a clarifying question</Text>
                </View>
                <ToggleSwitch
                  value={questionSound}
                  onValueChange={setQuestionSound}
                />
              </View>
            </View>

            {/* Test Play Buttons (Fully Rounded) */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.secondaryFullBtn, { flex: 1 }]}
                onPress={() => SoundService.playCompletion()}
                activeOpacity={0.8}
              >
                <VolumeIcon size={16} color="#ffffff" />
                <Text style={styles.secondaryFullBtnText}>Play Completion</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryFullBtn, { flex: 1 }]}
                onPress={() => SoundService.playPermission()}
                activeOpacity={0.8}
              >
                <VolumeIcon size={16} color="#ffffff" />
                <Text style={styles.secondaryFullBtnText}>Play Permission</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
              <Text style={styles.primaryFullBtnText}>Save Preferences</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 4: STORAGE & MEMORY (Desktop Parity)
  // ==========================================
  if (currentView === 'data_sync') {
    const sync = DesktopSyncService.getInstance();
    const status = sync.getStatus();
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Data & Sync')}
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.pageCardGroup}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>Auto-Connect to Paired PC</Text>
                  <Text style={styles.sectionCardSubtitle}>
                    Silently reconnect on the same Wi-Fi using the saved session token. Unfamiliar networks still ask for the 4-digit code.
                  </Text>
                </View>
                <ToggleSwitch
                  value={autoConnectWifi}
                  onValueChange={async (val: boolean) => {
                    setAutoConnectWifi(val);
                    await sync.setAutoConnect(val);
                  }}
                />
              </View>
              <Text style={[styles.storageHintText, { marginTop: 8 }]}>
                {status.isConnected
                  ? `Connected to ${status.activeDesktop?.name || 'Desktop'}`
                  : status.needsReauth
                    ? status.reauthReason || 'Re-enter the pairing code on your PC.'
                    : 'Not connected. Pair from Desktop Sync first.'}
              </Text>
            </View>

            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>Chat history</Text>
              <Text style={styles.sectionCardSubtitle}>
                Each transfer waits for Accept or Deny on your Windows PC. Nothing is copied until you approve it there.
              </Text>
              <View style={styles.storageActionColumn}>
                <TouchableOpacity
                  style={styles.exportBackupBtn}
                  disabled={syncBusy}
                  onPress={async () => {
                    try {
                      setSyncBusy(true);
                      const result = await sync.fetchDesktopChats();
                      Alert.alert(
                        'Desktop chats imported',
                        `${result.sessions} new threads, ${result.messages} new messages.`
                      );
                    } catch (err: any) {
                      Alert.alert('Sync failed', err?.message || 'Pair with Ultron Desktop first.');
                    } finally {
                      setSyncBusy(false);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <DownloadIcon size={16} color="#ffffff" />
                  <Text style={styles.exportBackupBtnText}>
                    {syncBusy ? 'Waiting for PC…' : 'Fetch Desktop Chats'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.clearChatsBtn}
                  disabled={syncBusy}
                  onPress={async () => {
                    try {
                      setSyncBusy(true);
                      const result = await sync.exportPhoneChats();
                      Alert.alert('Exported to PC', `${result.sessions} conversation(s) saved on the workstation.`);
                    } catch (err: any) {
                      Alert.alert('Export failed', err?.message || 'Pair with Ultron Desktop first.');
                    } finally {
                      setSyncBusy(false);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <LaptopIcon size={16} color="#ffffff" />
                  <Text style={styles.clearChatsBtnText}>Export Phone Chats to PC</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.secondaryFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
              <Text style={styles.secondaryFullBtnText}>Back to Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  if (currentView === 'storage') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Storage & Memory')}
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            {/* Storage Locations Header with Memory Toggle */}
            <View style={styles.pageCardGroup}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>Storage Locations</Text>
                  <Text style={styles.sectionCardSubtitle}>
                    All downloads, persistent memory, and local models are stored securely.
                  </Text>
                </View>
                <ToggleSwitch
                  value={memoryPersistence}
                  onValueChange={setMemoryPersistence}
                />
              </View>

              {/* Data Dir Input */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputFieldLabel}>{'Agent Storage & Memory'}</Text>
                <View style={styles.storageInputRow}>
                  <TextInput
                    style={[styles.storageTextInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={customDataDir}
                    onChangeText={async (v: string) => {
                      setCustomDataDir(v);
                      await StoragePaths.setDataDir(v);
                    }}
                  />
                  <TouchableOpacity
                    style={styles.browseStorageBtn}
                    onPress={async () => {
                      const root = await StoragePaths.defaultRoot();
                      const data = `${root}data/`;
                      setCustomDataDir(StoragePaths.displayPath(data));
                      await StoragePaths.setDataDir(data);
                      Alert.alert('Storage Location', 'Using UltronAI data folder in app storage.');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.browseStorageBtnText}>Browse</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.storageHintText}>
                  Conversations, memory, and session data. Defaults to internal app storage.
                </Text>
              </View>

              {/* Connectors Dir */}
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)', paddingTop: 14 }}>
                <Text style={styles.inputFieldLabel}>{'Connectors & Downloads'}</Text>
                <View style={styles.storageInputRow}>
                  <TextInput
                    style={[styles.storageTextInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
                    value={customConnectorsDir}
                    onChangeText={async (v: string) => {
                      setCustomConnectorsDir(v);
                      await StoragePaths.setModelsDir(v);
                    }}
                  />
                  <TouchableOpacity
                    style={styles.browseStorageBtn}
                    onPress={async () => {
                      const root = await StoragePaths.defaultRoot();
                      const models = `${root}models/`;
                      setCustomConnectorsDir(StoragePaths.displayPath(models));
                      await StoragePaths.setModelsDir(models);
                      Alert.alert('Connectors Location', 'Models will save to /UltronAI/models/.');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.browseStorageBtnText}>Browse</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.storageHintText}>
                  Quantized GGUF neural weights and local embedding files.
                </Text>
              </View>
            </View>

            {/* Clear Data Section */}
            <View style={styles.pageCardGroup}>
              <Text style={styles.sectionCardTitle}>Clear Data</Text>
              <Text style={styles.sectionCardSubtitle}>
                Permanently delete all conversations, chat history, and message logs from storage.
              </Text>
              <View style={styles.storageActionColumn}>
                <TouchableOpacity style={styles.exportBackupBtn} onPress={handleExportData} activeOpacity={0.8}>
                  <DownloadIcon size={16} color="#ffffff" />
                  <Text style={styles.exportBackupBtnText}>Export Backup</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.clearChatsBtn} onPress={handleClearHistory} activeOpacity={0.8}>
                  <TrashIcon size={16} color="#ffffff" />
                  <Text style={styles.clearChatsBtnText}>Erase All Chat History</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.secondaryFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
              <Text style={styles.secondaryFullBtnText}>Back to Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ==========================================
  // FULL-PAGE VIEW 5: SOFTWARE UPDATES (Desktop Parity with Ultron Logo without BG)
  // ==========================================
  if (currentView === 'updates') {
    return (
      <Animated.View style={[styles.container, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
        <SafeAreaView style={styles.container}>
          {renderFullPageHeader('Software Updates')}
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.updateCard}>
              <View style={styles.updateCardHeaderRow}>
                {/* Ultron Logo without Background */}
                <Image
                  source={require('../../Assets/ultron-logo.png')}
                  style={styles.updateLogoImg}
                  resizeMode="contain"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.updateStatusTitle}>
                    {updateStatus === 'checking' ? 'Checking for updates...' : 'Ultron is up to date'}
                  </Text>
                  <Text style={styles.updateStatusSubtitle}>Current Version: v1.0.13 Mobile</Text>
                </View>
                <TouchableOpacity
                  style={styles.checkUpdatesActionBtn}
                  onPress={handleCheckUpdates}
                  activeOpacity={0.8}
                >
                  <Text style={styles.checkUpdatesActionBtnText}>Check for Updates</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.pageCardGroup}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullPageRowLabel}>Auto-Check on Launch</Text>
                  <Text style={styles.toggleDesc}>Check for engine optimization releases when starting app</Text>
                </View>
                <ToggleSwitch
                  value={autoCheckUpdates}
                  onValueChange={setAutoCheckUpdates}
                />
              </View>

              <View style={styles.fullPageDetailRow}>
                <Text style={styles.fullPageRowLabel}>Release Channel</Text>
                <Text style={styles.fullPageRowValue}>Stable (Mobile Edition)</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.primaryFullBtn} onPress={handleSmoothBack} activeOpacity={0.8}>
              <Text style={styles.primaryFullBtnText}>Back to Settings</Text>
            </TouchableOpacity>
          </ScrollView>
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
          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.fullPageScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.aboutCard}>
              <View style={styles.aboutBrandHeader}>
                <Image
                  source={require('../../Assets/ultron-logo.png')}
                  style={styles.aboutAppLogo}
                  resizeMode="contain"
                />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.aboutAppTitle}>Ultron</Text>
                    <View style={styles.aboutVersionBadge}>
                      <Text style={styles.aboutVersionBadgeText}>BETA v1</Text>
                    </View>
                  </View>
                  <Text style={styles.aboutTagline}>{'Local & Offline Mobile AI Companion'}</Text>
                </View>
              </View>

              <Text style={styles.aboutSectionTitle}>About Ultron</Text>
              <Text style={styles.aboutParagraph}>
                Ultron is an advanced, sovereign conversational AI companion built to run directly on smartphone hardware. All SLM neural model inference, prompt executions, and chat histories operate locally inside a 100% private on-device sandbox. No personal data, chat context, or telemetry is ever transmitted to remote servers.
              </Text>
              <Text style={[styles.aboutParagraph, { marginTop: 8 }]}>
                Powered by quantized GGUF neural models with optional fallback to Google Gemini cloud intelligence when requested, Ultron delivers fast, autonomous capability while keeping you in complete sovereign control.
              </Text>

              {/* Specs Grid (Desktop Parity) */}
              <View style={styles.aboutSpecsGrid}>
                <View style={styles.aboutSpecItem}>
                  <Text style={styles.aboutSpecLabel}>VERSION</Text>
                  <Text style={styles.aboutSpecValue}>BETA v1 Mobile</Text>
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

              {/* External Links (Fully Rounded with GitHub Logo) */}
              <View style={styles.aboutLinksContainer}>
                <TouchableOpacity
                  style={styles.aboutLinkBtn}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open('https://github.com/vedantwankhade123', '_blank');
                    } else {
                      Alert.alert('GitHub', 'https://github.com/vedantwankhade123');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <GithubIcon size={16} color="#000000" />
                  <Text style={styles.aboutLinkBtnText}>GitHub</Text>
                  <Text style={styles.platformButtonArrow}>↗</Text>
                </TouchableOpacity>
              </View>

              {/* Also Available On */}
              <View style={styles.alsoAvailableContainer}>
                <Text style={styles.alsoAvailableTitle}>Also Available On</Text>
                <View style={styles.platformButtonsGrid}>
                  {otherPlatforms.map((platform) => (
                    <TouchableOpacity
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
        {/* Top Header with Smooth Back Action */}
        <ScreenHeader
          title="Settings"
          onBack={handleSmoothBack}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => setIsSpotlightOpen(!isSpotlightOpen)}
                activeOpacity={0.7}
                accessibilityLabel="Spotlight Search"
              >
                <SearchIcon size={19} color="#e4e4e7" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => navigateToView('about')}
                activeOpacity={0.7}
                accessibilityLabel="About Ultron"
              >
                <HelpCircleIcon size={20} color="#e4e4e7" />
              </TouchableOpacity>
            </View>
          }
        />

        {/* Spotlight Search Overlay Bar */}
        {isSpotlightOpen && (
          <View style={styles.spotlightContainer}>
            <View style={styles.spotlightBar}>
              <SearchIcon size={16} color="#9ca3af" />
              <TextInput
                style={[
                  styles.spotlightInput,
                  Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {},
                ]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search settings, models, audio, storage..."
                placeholderTextColor="#71717a"
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <CloseIcon size={16} color="#a1a1aa" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Main Settings Scroll Container */}
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* iOS-Style Profile Card */}
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
              <Text style={styles.iosProfileSubtitle}>{userEmail || 'vedantwankhade47@gmail.com'}</Text>
            </View>
            <ChevronRightIcon size={18} color="#8e8e93" />
          </TouchableOpacity>

          {/* Categorized Settings Cards Groups matching iOS Design */}
          {settingsGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) =>
                !searchQuery.trim() ||
                item.title.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (visibleItems.length === 0) return null;

            return (
              <View key={group.id} style={styles.menuGroupContainer}>
                <View style={styles.menuGroupHeaderRow}>
                  <Text style={styles.menuGroupSectionTitle}>{group.title}</Text>
                  {group.badge && (
                    <View style={styles.menuGroupBadge}>
                      <Text style={styles.menuGroupBadgeText}>{group.badge}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.groupCardContainer}>
                  {visibleItems.map((item, idx) => {
                    const isLast = idx === visibleItems.length - 1;
                    return (
                      <React.Fragment key={item.id}>
                        <HoverableSettingsRow onPress={item.action}>
                          <View style={styles.cleanMenuLeft}>
                            {renderItemIcon(item.iconType, item.iconColor)}
                            <Text style={styles.cleanMenuTitle}>{item.title}</Text>
                          </View>

                          <View style={styles.cleanMenuRight}>
                            {/* Stacked Hugging Face + Gemini logos for Models */}
                            {item.id === 'models' && (
                              <View style={styles.modelsLogoStack}>
                                <View style={styles.modelsStackedLogo1}>
                                  <HuggingFaceLogo size={18} />
                                </View>
                                <Image
                                  source={require('../../Assets/gemini-logo.png')}
                                  style={styles.modelsStackedLogo2}
                                  resizeMode="contain"
                                />
                              </View>
                            )}
                            {item.detail ? (
                              <Text style={styles.iosRowDetailText} numberOfLines={1}>
                                {item.detail}
                              </Text>
                            ) : null}
                            <ChevronRightIcon size={16} color="#8e8e93" />
                          </View>
                        </HoverableSettingsRow>

                        {!isLast && <View style={styles.cleanMenuDivider} />}
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Also Available On - Platform Download Links */}
          <View style={styles.menuGroupContainer}>
            <Text style={styles.alsoAvailableHeading}>Also Available On</Text>
            <View style={styles.platformButtonsGrid}>
              {otherPlatforms.map((platform) => (
                <TouchableOpacity
                  key={platform.id}
                  style={styles.platformButton}
                  onPress={() => handleOpenDownloadLink(platform.url)}
                  activeOpacity={0.8}
                >
                  {renderPlatformIcon(platform, 18)}
                  <Text style={styles.platformButtonText}>{platform.label}</Text>
                  <Text style={styles.platformButtonArrow}>↗</Text>
                </TouchableOpacity>
              ))}
            </View>
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerIconBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    gap: 10,
  },
  fullPageScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 50,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  menuGroupContainer: {
    marginBottom: 20,
  },
  menuGroupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
    gap: 8,
  },
  menuGroupSectionTitle: {
    color: '#8e8e93',
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.1,
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
    borderRadius: 22,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iosAvatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#3a3a3c',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iosAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  iosProfileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  iosProfileName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  iosProfileSubtitle: {
    color: '#8e8e93',
    fontSize: 12,
    marginTop: 2,
  },
  groupCardContainer: {
    backgroundColor: '#1c1c1e',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  cleanMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  cleanMenuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  cleanMenuIconBox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cleanMenuTitle: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  cleanMenuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iosRowDetailText: {
    color: '#8e8e93',
    fontSize: 14,
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
    padding: 2,
    borderWidth: 1.5,
    borderColor: '#1c1c1e',
    marginLeft: -9,
    zIndex: 1,
  },
  cleanMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 60,
  },
  pageCardGroup: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionCardTitle: {
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
    backgroundColor: '#000000',
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
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  tagFilterPillTextActive: {
    color: '#000000',
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modelRowCardTitle: {
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
    alignItems: 'center',
    gap: 8,
  },
  modelSelectActionBtn: {
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
    fontSize: 12,
    fontWeight: '600',
  },
  modelSelectActionBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modelDeleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modelDeleteActionBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Account Screen Styles */
  accountProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    padding: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
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
  locationCardGroup: {
    backgroundColor: '#1c1c1e',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  locationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  locationTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationSectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  locationInfoBtn: {
    padding: 4,
    borderRadius: 9999,
  },
  autoLocationToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  autoLocationToggleLabel: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '500',
  },
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  locationTextInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '500',
    paddingVertical: 0,
  },
  detectLocationBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  detectLocationBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  locationStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  locationStatusHintText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '500',
  },
  accountFooterNote: {
    color: '#71717a',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
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
  browseStorageBtn: {
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
  updateCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  updateCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  updateLogoImg: {
    width: 38,
    height: 38,
  },
  updateStatusTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  updateStatusSubtitle: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  checkUpdatesActionBtn: {
    backgroundColor: '#4285f4',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  checkUpdatesActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
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
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
  aboutLinksContainer: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 18,
  },
  aboutLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  aboutLinkBtnText: {
    color: '#000000',
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  alsoAvailableContainer: {
    marginTop: 20,
  },
  alsoAvailableTitle: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  alsoAvailableHeading: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 8,
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
});
