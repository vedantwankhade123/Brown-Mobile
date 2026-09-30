import './src/utils/animatedPolyfill';
import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
// Not reachable through the barrel export in this RN version.
import { BackHandler } from 'react-native/Libraries/Utilities/BackHandler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';
import { consumeBackPress } from './src/utils/backStack';
import { saveSelectedModel } from './src/services/modelManager/ModelSelection';
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
import { bootstrapApp } from './src/services/storage/AppBootstrap';
import { ModelMetadata } from './src/types/model';
import { colors } from './src/theme/colors';
import { BrownAlertHost, installBrownAlertPatch } from './src/components/BrownAlert';

installBrownAlertPatch();

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
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      input, textarea, [contenteditable] {
        outline: none !important;
        box-shadow: none !important;
      }
      input:focus, textarea:focus, [contenteditable]:focus {
        outline: none !important;
        box-shadow: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
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
  const [bootStalled, setBootStalled] = useState<boolean>(false);
  const [bootAttempt, setBootAttempt] = useState<number>(0);
  const [chatKey, setChatKey] = useState<number>(0);
  const [chatRevision, setChatRevision] = useState<number>(0);
  const [syncInitialScan, setSyncInitialScan] = useState<boolean>(false);
  const [requestedModel, setRequestedModel] = useState<ModelMetadata | null>(null);
  const [fontsFallback, setFontsFallback] = useState<boolean>(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Extend behind the system navigation bar so the app gradient fills that area.
      // Bar is tinted with the gradient's terminal blue (#101e40) so it matches even
      // when edge-to-edge isn't honored (e.g. Expo Go), instead of showing white/black.
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
      NavigationBar.setBackgroundColorAsync('#101e40').catch(() => {});
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
  }, []);

  // Boot. Neither step is allowed to hold the UI hostage: a hung storage open or a dead
  // font load used to leave the app rendering nothing at all.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setBootStalled(false);

    const stall = setTimeout(() => {
      if (!cancelled) setBootStalled(true);
    }, 12000);

    (async () => {
      try {
        await withTimeout(bootstrapApp(), 9000, 'Local storage took too long to open');
        if (cancelled) return;
        await checkOnboardingStatus();
      } catch (err: any) {
        if (cancelled) return;
        console.warn('[App] boot did not finish cleanly:', err?.message || err);
        setBootStalled(true);
      } finally {
        clearTimeout(stall);
      }
    })();

    DesktopSyncService.getInstance().tryAutoConnect().catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(stall);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootAttempt]);

  // Font loading is a nicety, not a gate. After a few seconds we render with whatever
  // font resolved rather than showing an empty screen.
  useEffect(() => {
    if (fontsLoaded) return undefined;
    const t = setTimeout(() => setFontsFallback(true), 5000);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  // Android back: overlays own it first, then the screen stack, then the system exits.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (consumeBackPress()) return true;
      if (screenStack.length > 1) {
        navigateBack();
        return true;
      }
      if (currentScreen !== 'chat') {
        resetToScreen('chat');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screenStack, currentScreen]);

  // Coming back to chat (after a download, a settings change, a model pick) refreshes
  // the picker so the new state is visible without restarting the app.
  useEffect(() => {
    if (currentScreen === 'chat') setChatRevision((n) => n + 1);
  }, [currentScreen]);

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
    // The pick has to reach the chat that is about to open, and survive a restart.
    setRequestedModel(model);
    saveSelectedModel(model).catch(() => {});
    resetToScreen('chat');
  };

  const handleClearHistory = () => {
    setChatKey((prev) => prev + 1);
  };

  const handleRerunOnboarding = () => {
    navigateTo('onboarding');
  };

  const booting = isLoading || (!fontsLoaded && !fontsFallback);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <BrownAlertHost />

          {booting ? (
            <BootSplash
              stalled={bootStalled}
              onContinue={() => setIsLoading(false)}
              onRetry={() => setBootAttempt((n) => n + 1)}
            />
          ) : (
            <>
              {currentScreen === 'onboarding' && (
                <OnboardingScreen onComplete={handleOnboardingComplete} />
              )}

              {currentScreen === 'chat' && (
                <ChatScreen
                  key={chatKey}
                  revision={chatRevision}
                  requestedModel={requestedModel}
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
            </>
          )}
        </SafeAreaView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Visible while the app starts. It never renders an empty screen, and it always offers a way out. */
const BootSplash: React.FC<{
  stalled: boolean;
  onContinue: () => void;
  onRetry: () => void;
}> = ({ stalled, onContinue, onRetry }) => (
  <View style={styles.bootWrap}>
    <LinearGradient
      pointerEvents="none"
      colors={['#111111', '#111111', '#10131c', '#101e40']}
      locations={[0, 0.2, 0.54, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.4, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <Text style={styles.bootMark}>Brown AI</Text>
    {stalled ? (
      <>
        <Text style={styles.bootTitle}>Still waking up</Text>
        <Text style={styles.bootBody}>
          Opening your local data is taking unusually long. You can continue and Brown will keep
          retrying, or start the launch again.
        </Text>
        <View style={styles.bootActions}>
          <TouchableOpacity style={styles.bootPrimary} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.bootPrimaryText}>Continue anyway</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bootSecondary} onPress={onRetry} activeOpacity={0.85}>
            <Text style={styles.bootSecondaryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    ) : (
      <>
        <ActivityIndicator size="small" color="#295294" style={styles.bootSpinner} />
        <Text style={styles.bootBody}>Preparing your assistant…</Text>
      </>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    ...(Platform.OS === 'web' ? { height: '100vh', width: '100vw' } : {}),
  },

  bootWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  bootMark: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 18,
  },
  bootSpinner: {
    marginBottom: 14,
  },
  bootTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  bootBody: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  bootActions: {
    marginTop: 24,
    width: '100%',
    maxWidth: 320,
    gap: 10,
  },
  bootPrimary: {
    backgroundColor: '#295294',
    borderRadius: 9999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  bootPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  bootSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 9999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  bootSecondaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
