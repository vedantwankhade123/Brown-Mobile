import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';

import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { ModelStoreScreen } from './src/screens/ModelStoreScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { DesktopSyncScreen } from './src/screens/DesktopSyncScreen';
import { DesktopSyncService } from './src/services/sync/DesktopSync';
import { ModelMetadata } from './src/types/model';
import { colors } from './src/theme/colors';

type ScreenType = 'onboarding' | 'chat' | 'modelStore' | 'settings' | 'desktopSync';

// Inject Outfit Google Font & Obsidian Dark theme globally on Web
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const fontId = 'outfit-font-face';
  if (!document.getElementById(fontId)) {
    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.id = 'ultron-global-web-styles';
    style.innerHTML = `
      html, body, #root {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
        background-color: #000000 !important;
        color: #ffffff;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        overflow: hidden;
      }
      * {
        box-sizing: border-box;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(255, 255, 255, 0.22) transparent !important;
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      input, textarea, [contenteditable] {
        outline: none !important;
        box-shadow: none !important;
        border: none !important;
      }
      input:focus, textarea:focus, [contenteditable]:focus {
        outline: none !important;
        box-shadow: none !important;
      }
      ::-webkit-scrollbar {
        width: 4px !important;
        height: 4px !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.22) !important;
        border-radius: 99px !important;
        transition: background 0.2s ease !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.45) !important;
      }
      ::-webkit-scrollbar-button {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      ::-webkit-scrollbar-corner {
        background: transparent !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// Global Error Boundary to prevent blank/white screen crashes
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Ultron Mobile Crash]:', error, errorInfo);
  }

  handleReload = async () => {
    try {
      this.setState({ hasError: false, error: null });
    } catch {}
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Brown Mobile Recovery</Text>
            <Text style={styles.errorSubtitle}>
              An unexpected rendering issue occurred. Your local data remains safe.
            </Text>
            <Text style={styles.errorMessage}>
              {this.state.error?.message || 'Unknown error'}
            </Text>
            <TouchableOpacity
              style={styles.errorReloadBtn}
              onPress={this.handleReload}
              activeOpacity={0.85}
            >
              <Text style={styles.errorReloadBtnText}>Reload App</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  const [screenStack, setScreenStack] = useState<ScreenType[]>(['chat']);
  const currentScreen = screenStack[screenStack.length - 1] || 'chat';
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [chatKey, setChatKey] = useState<number>(0);
  const [syncInitialScan, setSyncInitialScan] = useState<boolean>(false);

  useEffect(() => {
    checkOnboardingStatus();
    DesktopSyncService.getInstance().tryAutoConnect().catch(() => {});
  }, []);

  const navigateTo = (screen: ScreenType) => {
    setScreenStack((prev) => [...prev, screen]);
  };

  const navigateBack = () => {
    setScreenStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : ['chat']));
  };

  const resetToScreen = (screen: ScreenType) => {
    setScreenStack([screen]);
  };

  const checkOnboardingStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem('@ultron_onboarding_completed');
      if (completed !== 'true') {
        resetToScreen('onboarding');
      } else {
        resetToScreen('chat');
      }
    } catch {
      resetToScreen('chat');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingComplete = () => {
    resetToScreen('chat');
    setChatKey((prev) => prev + 1);
  };

  const handleModelActivated = (model: ModelMetadata) => {
    resetToScreen('chat');
  };

  const handleClearHistory = () => {
    setChatKey((prev) => prev + 1);
  };

  const handleRerunOnboarding = () => {
    navigateTo('onboarding');
  };

  if (isLoading || !fontsLoaded) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingCenter]}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.splashContent}>
          <Image
            source={require('./Assets/brown-white-logo.png')}
            style={styles.splashLogo}
            resizeMode="contain"
          />
          <Text style={styles.splashBrandSubtitle}>OFFLINE INTELLIGENCE</Text>
          <ActivityIndicator size="small" color="#ffffff" style={{ marginTop: 20 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {currentScreen === 'onboarding' && (
          <OnboardingScreen onComplete={handleOnboardingComplete} />
        )}

        {currentScreen === 'chat' && (
          <ChatScreen
            key={chatKey}
            onOpenModelStore={() => navigateTo('modelStore')}
            onOpenSettings={() => navigateTo('settings')}
            onOpenDesktopSync={(opts) => {
              setSyncInitialScan(!!opts?.scan);
              navigateTo('desktopSync');
            }}
          />
        )}

        {currentScreen === 'modelStore' && (
          <ModelStoreScreen
            onBack={navigateBack}
            onModelActivated={handleModelActivated}
          />
        )}

        {currentScreen === 'settings' && (
          <SettingsScreen
            onBack={navigateBack}
            onClearHistory={handleClearHistory}
            onRerunOnboarding={handleRerunOnboarding}
            onOpenModelStore={() => navigateTo('modelStore')}
            onOpenDesktopSync={() => {
              setSyncInitialScan(false);
              navigateTo('desktopSync');
            }}
          />
        )}

        {currentScreen === 'desktopSync' && (
          <DesktopSyncScreen
            onBack={() => {
              setSyncInitialScan(false);
              navigateBack();
            }}
            initialScan={syncInitialScan}
          />
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    ...(Platform.OS === 'web' ? { height: '100vh', width: '100vw' } : {}),
  },
  loadingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 160,
    height: 48,
    marginBottom: 8,
  },
  splashBrandTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
  },
  splashBrandSubtitle: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: 4,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#18181b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorSubtitle: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  errorMessage: {
    color: '#f87171',
    fontSize: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    borderRadius: 8,
    width: '100%',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorReloadBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  errorReloadBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
});
