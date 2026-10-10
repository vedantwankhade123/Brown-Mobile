import { appSurfaces } from './src/theme/appSurfaces';
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
  BackHandler,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView as ScreenSafeArea } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { setNavBarColor } from './src/theme/systemBars';
import { ScreenTransition } from './src/components/ScreenTransition';
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
import { deleteLocalAccount } from './src/services/storage/AccountDataService';
import { ModelMetadata } from './src/types/model';
import { colors } from './src/theme/colors';
import { BrownAlertHost, installBrownAlertPatch } from './src/components/BrownAlert';
import { SoundService } from './src/services/sound/SoundService';
import { ErrorLogService, installGlobalErrorHandlers } from './src/services/diagnostics/ErrorLogService';
import { resumePendingKokoroDownloads } from './src/services/voice/KokoroTtsService';

installBrownAlertPatch();
installGlobalErrorHandlers();

type ScreenType = 'onboarding' | 'chat' | 'modelStore' | 'settings' | 'desktopSync';

// Keep the native launch screen until startup and fonts are ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  diagnosticStatus: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, diagnosticStatus: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Brown Mobile Crash]:', error, errorInfo);
    // Cache a sanitized stack trace locally; the user decides whether to send it.
    ErrorLogService.record(error, 'boundary').catch(() => {});
  }

  handleReload = async () => {
    try {
      this.setState({ hasError: false, error: null, diagnosticStatus: null });
    } catch {}
  };

  handleSendDiagnostics = async () => {
    this.setState({ diagnosticStatus: 'Sending…' });
    const result = await ErrorLogService.send().catch(() => null);
    if (!result) {
      this.setState({ diagnosticStatus: 'Could not send. Try again later.' });
      return;
    }
    if (result.status === 'sent') {
      this.setState({ diagnosticStatus: `Sent ${result.count} diagnostic log(s).` });
    } else if (result.status === 'empty') {
      this.setState({ diagnosticStatus: 'No cached logs to send.' });
    } else if (result.status === 'cooldown') {
      this.setState({ diagnosticStatus: 'Reports are limited to one per minute.' });
    } else {
      this.setState({ diagnosticStatus: 'Could not send. Try again later.' });
    }
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
            <TouchableOpacity
              style={styles.errorDiagnosticsBtn}
              onPress={this.handleSendDiagnostics}
              activeOpacity={0.85}
            >
              <Text style={styles.errorDiagnosticsBtnText}>Send Error Log</Text>
            </TouchableOpacity>
            {this.state.diagnosticStatus ? (
              <Text style={styles.errorDiagnosticsStatus}>{this.state.diagnosticStatus}</Text>
            ) : null}
            <Text style={styles.errorDiagnosticsNote}>
              Only device specs, app version, and the stack trace are shared — never your chats.
            </Text>
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

  // The OS launch screen is the only branded splash. Reveal onboarding/chat
  // directly once startup is ready, without replaying the logo in React.
  const booting = isLoading || (!fontsLoaded && !fontsFallback);
  useEffect(() => {
    if (booting && !bootStalled) return;
    const frame = requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {}));
    return () => cancelAnimationFrame(frame);
  }, [booting, bootStalled]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Draw each screen behind the bottom system controls. Insets keep content clear.
    NavigationBar.setPositionAsync('absolute')
      .then(() => {
        NavigationBar.setButtonStyleAsync('light').catch(() => {});
        NavigationBar.setBorderColorAsync('transparent').catch(() => {});
        // Match the composited bottom stop of the chat input's blue glow.
        // Some Android gesture bars remain black even with a transparent surface.
        setNavBarColor(currentScreen === 'chat' ? '#102046' : appSurfaces.top);
      })
      .catch(() => {});
  }, [currentScreen]);

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
        SoundService.init().catch(() => {});
        await withTimeout(bootstrapApp(), 9000, 'Local storage took too long to open');
        resumePendingKokoroDownloads().catch(() => {});
        if (cancelled) return;
        await checkOnboardingStatus();
      } catch (err: any) {
        if (cancelled) return;
        console.warn('[App] boot did not finish cleanly:', err?.message || err);
        setBootStalled(true);
        setIsLoading(false);
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
    if (screen === currentScreen) return;
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

  const handleDeleteAccount = async () => {
    try {
      await deleteLocalAccount();
      setRequestedModel(null);
      setChatKey((prev) => prev + 1);
      resetToScreen('onboarding');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      Alert.alert('Could not delete account', message);
    }
  };

  const renderScreen = (route: string, active: boolean): ReactNode => {
    switch (route as ScreenType) {
      case 'onboarding':
        return <OnboardingScreen onComplete={handleOnboardingComplete} />;
      case 'modelStore':
        return (
          <ModelStoreScreen
            onBack={navigateBack}
            onModelActivated={handleModelActivated}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            isActive={active}
            onBack={navigateBack}
            onClearHistory={handleClearHistory}
            onDeleteAccount={handleDeleteAccount}
            onRerunOnboarding={handleRerunOnboarding}
            onOpenModelStore={() => navigateTo('modelStore')}
            onOpenDesktopSync={() => {
              setSyncInitialScan(false);
              navigateTo('desktopSync');
            }}
          />
        );
      case 'desktopSync':
        return (
          <DesktopSyncScreen
            isActive={active}
            onBack={() => {
              setSyncInitialScan(false);
              navigateBack();
            }}
            initialScan={syncInitialScan}
          />
        );
      case 'chat':
      default:
        return (
          <ChatScreen
            isActive={active}
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
        );
    }
  };

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ScreenSafeArea
          edges={['top', 'left', 'right']}
          style={[styles.container, { backgroundColor: currentScreen === 'chat' ? appSurfaces.top : colors.background }]}
        >
          <StatusBar barStyle="light-content" backgroundColor={currentScreen === 'chat' ? appSurfaces.top : colors.background} />
          <BrownAlertHost />

          {!booting && (
            <ScreenTransition screen={currentScreen} renderScreen={renderScreen} />
          )}

          {booting && bootStalled && (
            <View style={[StyleSheet.absoluteFill, styles.splash]}>
                <View style={styles.splashStallCard}>
                  <Text style={styles.splashStallText}>
                    Startup is taking longer than it should. Local storage may be busy.
                  </Text>
                  <TouchableOpacity
                    style={styles.splashStallBtn}
                    onPress={() => setIsLoading(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.splashStallBtnText}>Continue anyway</Text>
                  </TouchableOpacity>
                </View>
            </View>
          )}

        </ScreenSafeArea>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    ...(Platform.OS === 'web' ? { height: '100vh', width: '100vw' } : {}),
  },

  splash: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  splashBrandGroup: { width: 220, height: 154, alignItems: 'center' },
  splashLogoFrame: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  splashMark: {
    position: 'absolute',
    top: 118,
    left: 0,
    right: 0,
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.25,
    textAlign: 'center',
    includeFontPadding: false,
  },
  splashStallCard: {
    position: 'absolute',
    bottom: 92,
    left: 24,
    right: 24,
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  splashStallText: {
    color: '#d4d4d8',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  splashStallBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  splashStallBtnText: {
    color: '#000000',
    fontSize: 13.5,
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
  errorDiagnosticsBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  errorDiagnosticsBtnText: {
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '600',
  },
  errorDiagnosticsStatus: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  errorDiagnosticsNote: {
    color: '#71717a',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    textAlign: 'center',
  },
});
