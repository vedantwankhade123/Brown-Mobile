import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Switch,
  Image,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopSyncService, isPrivateLanAddress, PairedDesktopHistoryItem } from '../services/sync/DesktopSync';
import { DesktopInstance, ProfileConflict, SyncStatus } from '../types/sync';
import { colors } from '../theme/colors';
import { ScreenHeader, useStickyHeader } from '../components/ScreenHeader';
import { MoreVerticalIcon, LaptopIcon, RefreshIcon, WifiIcon, WindowsIcon, CheckIcon, QrCodeIcon, ChevronRightIcon } from '../components/Icons';
import { QRScannerModal } from '../components/QRScannerModal';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { revealValues } from '../utils/motion';

const Easing = (Animated as any).Easing || {
  out: (f: any) => f,
  cubic: (t: any) => t,
  inOut: (f: any) => f,
  ease: (t: any) => t,
  linear: (t: any) => t,
};

interface DesktopSyncScreenProps {
  onBack: () => void;
  initialScan?: boolean;
}

export const DesktopSyncScreen: React.FC<DesktopSyncScreenProps> = ({ onBack, initialScan = false }) => {
  const insets = useSafeAreaInsets();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isConnected: false,
    syncInProgress: false,
    syncedThreadsCount: 0,
    activeDesktop: undefined,
    needsReauth: false,
    reauthReason: undefined,
    lastSyncTimestamp: undefined,
  });
  const [devices, setDevices] = useState<DesktopInstance[]>([]);
  const [pairedHistory, setPairedHistory] = useState<PairedDesktopHistoryItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const { onScroll: syncScroll, scrolled: syncScrolled } = useStickyHeader();
  const [selectedDevice, setSelectedDevice] = useState<DesktopInstance | null>(null);
  const [syncIdInput, setSyncIdInput] = useState('');
  const [idFocused, setIdFocused] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [profileConflict, setProfileConflict] = useState<ProfileConflict | null>(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(initialScan);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const transferLock = useRef(false);
  const [savingAutoConnect, setSavingAutoConnect] = useState(false);

  const syncService = DesktopSyncService.getInstance();
  const pinInputRef = useRef<any>(null);
  const scanSpin = useRef(new Animated.Value(0)).current;

  const canConnect = syncIdInput.trim().replace(/[^A-Z0-9-]/gi, '').length >= 8;
  const liveDevices = devices.filter((d) => !d.isFallback);
  const fallbackDevice = devices.find((d) => d.isFallback);

  const pageFade = useRef(new Animated.Value(0)).current;
  const pageSlide = useRef(new Animated.Value(14)).current;
  const wifiPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // revealValues pins the end state even if the native animation is dropped,
    // so this page can never stay at opacity 0.
    revealValues(
      [
        { value: pageFade, from: 0, to: 1 },
        { value: pageSlide, from: 14, to: 0 },
      ],
      240,
      undefined,
      false
    );
  }, [pageFade, pageSlide]);

  const loadHistory = async () => {
    try {
      const list = await syncService.getPairedHistory();
      setPairedHistory(list);
    } catch {}
  };

  useEffect(() => {
    const unsub = syncService.subscribe((status) => {
      setSyncStatus(status);
      loadHistory();
    });

    handleScan();
    loadHistory();

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (isScanning) {
      scanSpin.setValue(0);
      const spin = Animated.loop(
        Animated.timing(scanSpin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    }
    Animated.timing(scanSpin, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  }, [isScanning]);

  useEffect(() => {
    if (!syncStatus.isConnected) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(wifiPulse, { toValue: 1.14, duration: 900, useNativeDriver: true }),
          Animated.timing(wifiPulse, { toValue: 1.0, duration: 900, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    }
  }, [syncStatus.isConnected]);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const list = await syncService.scanLocalNetwork();
      setDevices(list);
    } finally {
      setIsScanning(false);
    }
  };

  const beginPairing = async (device: DesktopInstance) => {
    setSelectedDevice(device);
    setPinCode('');
    setAwaitingCode(true);
    try {
      await syncService.requestPairing(device);
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      Alert.alert('Pairing Request Failed', err?.message || 'Could not reach the desktop node');
      setAwaitingCode(false);
      setSelectedDevice(null);
    }
  };

  const handleConnectById = async () => {
    const id = syncIdInput.trim().toUpperCase();
    if (!id) return;
    const match = await syncService.connectBySyncId(id);
    if (!match) {
      Alert.alert(
        'Desktop not found',
        `No Brown Desktop "${id}" responded on this Wi-Fi. Open Brown Desktop, tap Generate QR (or Generate Pair Code) in the top bar, and make sure both devices use the same network.`
      );
      return;
    }
    await beginPairing(match);
  };

  const handlePair = async () => {
    if (!selectedDevice) return;
    try {
      await syncService.pairWithDesktop(selectedDevice, pinCode);
      setSelectedDevice(null);
      setPinCode('');
      setAwaitingCode(false);
      const conflict = syncService.getPendingProfileConflict();
      if (conflict) {
        setProfileConflict(conflict);
      } else {
        Alert.alert('Paired', `Connected to ${selectedDevice.name}`);
      }
    } catch (err: any) {
      Alert.alert('Pairing Failed', err?.message || 'Invalid pairing code');
    }
  };

  const cancelPairing = () => {
    setAwaitingCode(false);
    setSelectedDevice(null);
    setPinCode('');
  };

  const pairFromQr = async (device: DesktopInstance, code: string) => {
    setSelectedDevice(device);
    setPinCode(code);
    try {
      await syncService.pairWithDesktop(device, code);
      setAwaitingCode(false);
      setSelectedDevice(null);
      setPinCode('');
      const conflict = syncService.getPendingProfileConflict();
      if (conflict) {
        setProfileConflict(conflict);
      } else {
        Alert.alert('Paired', `Connected to ${device.name}`);
      }
    } catch (err: any) {
      Alert.alert('Pairing Failed', err?.message || 'Could not complete pairing with the desktop');
    }
  };

  const handleQrScanned = async (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;

    // 1. Try JSON payload: { ip, port, code, syncId, name }
    try {
      if (clean.startsWith('{') && clean.endsWith('}')) {
        const parsed = JSON.parse(clean);
        const code = (parsed.code || parsed.pairCode || '').toString().trim().toUpperCase();
        const ip = parsed.ip || parsed.ipAddress || (parsed.addresses && parsed.addresses[0]) || '';
        const port = parsed.port || 49200;
        const devId = parsed.syncId || parsed.id || 'Desktop';
        const name = parsed.name || parsed.syncId || 'Brown Desktop';

        if (ip && code) {
          if (!isPrivateLanAddress(ip)) {
            Alert.alert('Untrusted QR', 'That QR code points at an address outside your local network.');
            return;
          }
          const device: DesktopInstance = {
            id: devId,
            name,
            ipAddress: ip,
            port,
            version: '1.0.0',
            isPaired: false,
            lastSeen: Date.now(),
            syncId: devId,
          };
          await pairFromQr(device, code);
          return;
        }
      }
    } catch {}

    // 2. Try URL query params: ?code=...&ip=...
    if (clean.includes('code=') || clean.includes('syncId=')) {
      const codeMatch = clean.match(/[?&]code=([A-Za-z0-9]+)/i);
      const ipMatch = clean.match(/[?&]ip=([0-9.]+)/i);
      const portMatch = clean.match(/[?&]port=([0-9]+)/i);
      const idMatch = clean.match(/[?&]syncId=([A-Za-z0-9-]+)/i);

      const code = codeMatch ? codeMatch[1].toUpperCase() : '';
      const ip = ipMatch ? ipMatch[1] : '';
      const port = portMatch ? parseInt(portMatch[1], 10) : 49200;
      const devId = idMatch ? idMatch[1] : 'Desktop';

      if (ip && code) {
        if (!isPrivateLanAddress(ip)) {
          Alert.alert('Untrusted QR', 'That QR code points at an address outside your local network.');
          return;
        }
        const device: DesktopInstance = {
          id: devId,
          name: devId,
          ipAddress: ip,
          port,
          version: '1.0.0',
          isPaired: false,
          lastSeen: Date.now(),
          syncId: devId,
        };
        await pairFromQr(device, code);
        return;
      }
    }

    // 3. bare 6-character pair code (like K7QM2X)
    const upper = clean.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (upper.length === 6) {
      setPinCode(upper);
      const targetDev = selectedDevice || (devices.length > 0 ? devices[0] : null);
      if (targetDev) {
        setSelectedDevice(targetDev);
        try {
          await syncService.pairWithDesktop(targetDev, upper);
          Alert.alert('Paired', `Connected to ${targetDev.name}`);
        } catch (err: any) {
          Alert.alert('Pairing Failed', err?.message || 'Invalid pairing code');
        }
      } else {
        setAwaitingCode(true);
        Alert.alert('Code Recognized', `Pair code "${upper}" entered. Select your desktop below to pair.`);
      }
      return;
    }

    // 4. Sync ID format (BROWN-... or ULTRON-...)
    if (upper.startsWith('BROWN-') || upper.startsWith('ULTRON-')) {
      setSyncIdInput(upper);
      const match = await syncService.connectBySyncId(upper);
      if (match) {
        await beginPairing(match);
      } else {
        Alert.alert(
          'Desktop not found',
          `No Brown Desktop "${upper}" responded on this Wi-Fi. Open Brown Desktop and tap Generate QR, then scan it.`
        );
      }
      return;
    }

    // Fallback: populate syncId input
    setSyncIdInput(upper);
    Alert.alert('QR Scanned', `Detected ID: ${upper}`);
  };

  const resolveConflict = async (choice: 'desktop' | 'mobile' | 'merge') => {
    await syncService.resolveProfileConflict(choice);
    setProfileConflict(null);
    Alert.alert('Profiles synced', 'Display name, Gemini key, and instructions are aligned.');
  };

  const handleSyncNow = async () => {
    if (transferLock.current || syncStatus.syncInProgress) return;
    try {
      await syncService.syncNow();
      Alert.alert('Sync Complete', 'Conversations and notes updated with desktop.');
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync');
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect Desktop', 'Unpair from the desktop Brown node?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => syncService.disconnect(),
      },
    ]);
  };

  const transferChats = async (direction: 'fetch' | 'export') => {
    if (transferLock.current || syncStatus.syncInProgress) return;
    if (!syncStatus.isConnected) { Alert.alert('Pair your desktop first', 'Connect to Brown Desktop before transferring chats.'); return; }
    transferLock.current = true;
    setTransferBusy(true);
    setMenuOpen(false);
    try {
      if (direction === 'fetch') {
        const result = await syncService.fetchDesktopChats();
        Alert.alert('Chats imported', `${result.sessions} conversations and ${result.messages} messages imported from your desktop.`);
      } else {
        const result = await syncService.exportPhoneChats();
        Alert.alert('Chats exported', `${result.sessions} conversations saved on your desktop.`);
      }
    } catch (error: any) {
      Alert.alert('Transfer failed', error?.message || 'Could not transfer chats. Please try again.');
    } finally { transferLock.current = false; setTransferBusy(false); }
  };
  const updateAutoConnect = async (enabled: boolean) => {
    if (savingAutoConnect) return;
    setSavingAutoConnect(true);
    try { await syncService.setAutoConnect(enabled); }
    catch { Alert.alert('Could not save', 'Please try changing auto-connect again.'); }
    finally { setSavingAutoConnect(false); }
  };

  const statusLabel = syncStatus.needsReauth
    ? 'Disconnected'
    : syncStatus.isConnected
      ? 'Paired with Desktop'
      : 'Disconnected';
  const statusDetail = syncStatus.needsReauth
    ? syncStatus.reauthReason || 'Network changed — enter the code on your PC.'
    : syncStatus.isConnected
      ? syncStatus.activeDesktop?.name || 'Brown Desktop'
      : 'No desktop paired. Keep Brown open on PC and tap refresh to scan.';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <Animated.View style={{ flex: 1, opacity: pageFade, transform: [{ translateY: pageSlide }] }}>
        <ScreenHeader title="Desktop Sync" onBack={onBack} scrolled={syncScrolled} right={
          <TouchableOpacity style={styles.menuButton} onPress={() => setMenuOpen(true)} accessibilityLabel="Desktop sync options" accessibilityRole="button" accessibilityState={{ expanded: menuOpen }}>
            <MoreVerticalIcon size={22} color="#ffffff" />
          </TouchableOpacity>
        } />
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close sync options" />
            <View style={[styles.menuDropdown, { top: insets.top + 60 }]} accessibilityViewIsModal>
              <View style={styles.menuToggleRow}>
                <View style={{ flex: 1 }}><Text style={styles.menuLabel}>Auto-connect to paired PC</Text><Text style={styles.menuHint}>Reconnect securely on the same Wi-Fi.</Text></View>
                <Switch value={syncStatus.autoConnectEnabled !== false} onValueChange={updateAutoConnect} disabled={savingAutoConnect} trackColor={{ false: '#343434', true: '#2563eb' }} thumbColor="#ffffff" />
              </View>
              <Text style={styles.menuApproval}>Chat transfers need approval on your PC.</Text>
              <TouchableOpacity style={styles.menuOption} onPress={() => transferChats('fetch')} disabled={!syncStatus.isConnected || transferBusy || syncStatus.syncInProgress} accessibilityRole="button" accessibilityState={{ disabled: !syncStatus.isConnected || transferBusy || syncStatus.syncInProgress }}>
                <View style={styles.menuOptionIcon}><ChevronRightIcon size={16} color="#111111" /></View><Text style={[styles.menuOptionLabel, (!syncStatus.isConnected || transferBusy || syncStatus.syncInProgress) && styles.menuOptionLabelDisabled]}>Fetch desktop chats</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuOption} onPress={() => transferChats('export')} disabled={!syncStatus.isConnected || transferBusy || syncStatus.syncInProgress} accessibilityRole="button" accessibilityState={{ disabled: !syncStatus.isConnected || transferBusy || syncStatus.syncInProgress }}>
                <View style={styles.menuOptionIcon}><LaptopIcon size={16} color="#111111" /></View><Text style={[styles.menuOptionLabel, (!syncStatus.isConnected || transferBusy || syncStatus.syncInProgress) && styles.menuOptionLabelDisabled]}>Export phone chats to PC</Text>
              </TouchableOpacity>
              {!syncStatus.isConnected && <Text style={styles.menuHint}>Pair a desktop to enable transfers.</Text>}
            </View>
          </View>
        </Modal>
        {transferBusy && <View style={styles.transferNotice}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.menuLabel}>Waiting for desktop approval…</Text></View>}
        <ScrollView
          contentContainerStyle={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={syncScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.connectionIntro}>
            <Text style={styles.connectionHeading}>Connect Your Desktop</Text>
            <Text style={[styles.connectionDescription, { textAlign: 'center' }]}>Use desktop models and sync chats on the same Wi-Fi. Brown on your PC approves pairing and chat sharing.</Text>
          </View>
          {!syncStatus.isConnected && !awaitingCode && (
            <View style={styles.connectionShowcase}>
              <View style={styles.connectionArtwork}>
                <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" accessible={false}>
                  <Defs>
                    <RadialGradient id="connectionArtGradient" cx="50%" cy="80%" r="90%">
                      <Stop offset="0" stopColor="#172d58" />
                      <Stop offset="1" stopColor="#0e1220" />
                    </RadialGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#connectionArtGradient)" />
                </Svg>
                <Image source={require('../../Assets/Desktop App.png')} style={styles.connectionPreview} resizeMode="contain" />
              </View>
              <View style={styles.connectionCopy}>
                <Text style={styles.connectionKicker}>LOCAL COMPANION</Text>
                <Text style={styles.connectionCardTitle}>Brown for Windows</Text>
                <Text style={styles.connectionDescription}>1. Open Connection on your PC.
2. Enable mobile access and generate a pairing QR.
3. Scan it below, or use your PC’s Sync ID.</Text>
              </View>
            </View>
          )}
          <View style={styles.statusCard}>
            <Animated.View style={{ transform: [{ scale: syncStatus.isConnected ? 1 : wifiPulse }] }}>
              {syncStatus.isConnected ? (
                <CheckIcon size={22} color="#3b82f6" />
              ) : (
                <WifiIcon size={22} color={syncStatus.needsReauth ? '#F59E0B' : '#71717a'} />
              )}
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{statusLabel}</Text>
              <Text style={styles.statusDetail}>{statusDetail}</Text>
            </View>
            <TouchableOpacity
              style={styles.statusRefreshBtn}
              onPress={async () => {
                await syncService.refreshStatus();
                handleScan();
              }}
              disabled={isScanning}
              activeOpacity={0.7}
              accessibilityLabel="Refresh sync status"
            >
              <RefreshIcon size={16} color="#000000" />
            </TouchableOpacity>
          </View>

          {syncStatus.isConnected && (() => {
            const devName = syncStatus.activeDesktop?.name || 'Brown Desktop';
            const syncId = syncStatus.activeDesktop?.syncId || syncStatus.activeDesktop?.id || '';

            return (
              <>
                <View style={styles.card}>
                <Text style={styles.cardKicker}>WORKSTATION</Text>

                <View style={styles.workstationInfoRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.cardTitle}>{devName}</Text>
                    <Text style={styles.cardMeta}>
                      {syncId ? `${syncId}  ·  ${syncStatus.activeDesktop?.ipAddress || 'LAN'}` : (syncStatus.activeDesktop?.ipAddress || 'LAN')}
                    </Text>
                  </View>
                  <View style={styles.platformIconBox}>
                    <WindowsIcon size={32} branded={true} />
                  </View>
                </View>

                <View style={styles.statRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Last sync</Text>
                    <Text style={styles.statValue}>
                      {syncStatus.lastSyncTimestamp
                        ? new Date(syncStatus.lastSyncTimestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Not synced yet'}
                    </Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Threads</Text>
                    <Text style={styles.statValue}>{syncStatus.syncedThreadsCount}</Text>
                  </View>
                </View>

                <View style={styles.connectedActions}>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleSyncNow}
                    disabled={syncStatus.syncInProgress || transferBusy}
                    activeOpacity={0.8}
                  >
                    <RefreshIcon size={15} color="#000000" />
                    <Text style={styles.primaryBtnText}>
                      {syncStatus.syncInProgress ? 'Syncing…' : 'Sync now'}
                    </Text>
                  </TouchableOpacity>
                    <TouchableOpacity style={styles.ghostBtn} onPress={handleDisconnect} activeOpacity={0.8}>
                    <Text style={styles.ghostBtnDanger}>Unpair</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardKicker}>SHARED CAPABILITIES</Text>

                <View style={styles.sharedCapabilityRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sharedCapabilityTitle}>Desktop Ollama LLMs</Text>
                    <Text style={styles.sharedCapabilityDesc}>Heavyweight models running on PC GPU streamed to mobile</Text>
                  </View>
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>Available</Text>
                  </View>
                </View>

                <View style={styles.sharedDivider} />

                <View style={styles.sharedCapabilityRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sharedCapabilityTitle}>Cloud Model Settings</Text>
                    <Text style={styles.sharedCapabilityDesc}>Available provider settings can sync from your desktop</Text>
                  </View>
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>Available</Text>
                  </View>
                </View>

                <View style={styles.sharedDivider} />

                <View style={styles.sharedCapabilityRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sharedCapabilityTitle}>Chat History & Notes</Text>
                    <Text style={styles.sharedCapabilityDesc}>Cross-device conversation continuity with desktop approval</Text>
                  </View>
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>Available</Text>
                  </View>
                </View>
              </View>
              </>
            );
          })()}

          {!syncStatus.isConnected && awaitingCode && selectedDevice && (
            <View style={styles.card}>
              <Text style={styles.cardKicker}>PAIRING CODE</Text>
              <Text style={styles.cardTitle}>Enter the code on your PC</Text>
              <Text style={styles.cardBody}>
                A popup on Windows shows a 6-character code for{' '}
                <Text style={styles.cardBodyStrong}>{selectedDevice.name}</Text>. It expires in 2 minutes.
              </Text>

              <TouchableOpacity style={styles.otpRow} onPress={() => pinInputRef.current?.focus()} activeOpacity={0.9}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={[styles.otpBox, pinCode[i] && styles.otpBoxFilled]}>
                    <Text style={styles.otpChar}>{pinCode[i] || ''}</Text>
                  </View>
                ))}
              </TouchableOpacity>
              <TextInput
                ref={pinInputRef}
                style={styles.hiddenInput}
                value={pinCode}
                onChangeText={(v: string) => setPinCode(v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                caretHidden
                {...(Platform.OS === 'web' ? ({ outline: 'none' } as any) : {})}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, pinCode.length < 6 && styles.primaryBtnDisabled]}
                onPress={handlePair}
                disabled={pinCode.length < 6}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Verify & pair</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.textLink} onPress={cancelPairing} activeOpacity={0.7}>
                <Text style={styles.textLinkLabel}>Cancel pairing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scanQrSecondaryBtn}
                onPress={() => setIsQrScannerOpen(true)}
                activeOpacity={0.8}
              >
                <QrCodeIcon size={16} color="#60a5fa" />
                <Text style={styles.scanQrSecondaryText}>Scan QR code on desktop</Text>
              </TouchableOpacity>
            </View>
          )}

          {!syncStatus.isConnected && !awaitingCode && (
            <>
              {/* Primary Action: Instant QR Scanner */}
              <TouchableOpacity
                style={styles.scanQrHeroBtn}
                onPress={() => setIsQrScannerOpen(true)}
                activeOpacity={0.85}
              >
                <View style={styles.scanQrIconCircle}>
                  <QrCodeIcon size={22} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanQrHeroTitle}>Scan Desktop QR Code</Text>
                  <Text style={styles.scanQrHeroSubtitle}>
                    Point camera at the QR code on Brown Desktop to connect directly
                  </Text>
                </View>
              </TouchableOpacity>

              {/* OR Divider */}
              <View style={styles.orDividerContainer}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* Connect with Code Option (Clicking opens the UI shown in the image) */}
              {showCodeInput ? (
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>Connect to PC</Text>
                    <TouchableOpacity
                      onPress={() => setShowCodeInput(false)}
                      hitSlop={8}
                    >
                      <Text style={styles.hideCodeText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardBody}>
                    Type the Sync ID from Brown on Windows. It looks like BROWN-WIN-7842.
                  </Text>
                  <Text style={styles.fieldLabel}>Sync ID</Text>
                  <TextInput
                    style={[styles.idInput, idFocused && styles.idInputFocused]}
                    value={syncIdInput}
                    onChangeText={(v: string) => setSyncIdInput(v.toUpperCase())}
                    onFocus={() => setIdFocused(true)}
                    onBlur={() => setIdFocused(false)}
                    placeholder="BROWN-WIN-····"
                    placeholderTextColor="#52525b"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={22}
                    autoFocus
                    {...(Platform.OS === 'web' ? ({ outline: 'none' } as any) : {})}
                  />
                  <TouchableOpacity
                    style={[styles.primaryBtn, !canConnect && styles.primaryBtnDisabled]}
                    onPress={handleConnectById}
                    disabled={!canConnect}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryBtnText}>Connect to PC</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.connectWithCodeBtn}
                  onPress={() => setShowCodeInput(true)}
                  activeOpacity={0.85}
                >
                  <View style={styles.codeIconCircle}>
                    <Text style={styles.codeIconText}>#</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectWithCodeTitle}>Connect with Code</Text>
                    <Text style={styles.connectWithCodeSub}>
                      Type the Sync ID from Brown on Windows
                    </Text>
                  </View>
                  <ChevronRightIcon size={18} color="#9ca3af" />
                </TouchableOpacity>
              )}

              {syncStatus.needsReauth && syncStatus.activeDesktop && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => beginPairing(syncStatus.activeDesktop!)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Confirm with 6-character code</Text>
                </TouchableOpacity>
              )}

              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Nearby on Wi-Fi</Text>
                <TouchableOpacity
                  style={styles.scanAgainBtn}
                  onPress={handleScan}
                  disabled={isScanning}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Animated.View
                    style={{
                      transform: [{
                        rotate: scanSpin.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg'],
                        }),
                      }],
                    }}
                  >
                    <RefreshIcon size={15} color="#ffffff" />
                  </Animated.View>
                  <Text style={styles.sectionAction}>{isScanning ? 'Scanning…' : 'Scan again'}</Text>
                </TouchableOpacity>
              </View>

              {isScanning ? (
                <View style={styles.scanCard}>
                  <ActivityIndicator color="#ffffff" />
                  <Text style={styles.scanCopy}>Searching this network for Brown Desktop…</Text>
                </View>
              ) : liveDevices.length > 0 ? (
                liveDevices.map((device) => (
                  <TouchableOpacity
                    key={device.id + device.ipAddress}
                    style={[
                      styles.deviceCard,
                      selectedDevice?.id === device.id && styles.deviceCardSelected,
                    ]}
                    onPress={() => beginPairing(device)}
                    activeOpacity={0.85}
                  >
                    <WindowsIcon size={22} color="#ffffff" branded={true} />
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceMeta}>
                        {(device.syncId || device.id) + '  ·  ' + device.ipAddress}
                      </Text>
                    </View>
                    <View style={styles.onlinePill}>
                      <View style={styles.onlineDot} />
                      <Text style={styles.onlinePillText}>Online</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No desktop found yet</Text>
                  <Text style={styles.emptyBody}>
                    Open Connection on Brown Desktop, enable mobile access, then scan its pairing QR here.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyQrBtn}
                    onPress={() => setIsQrScannerOpen(true)}
                    activeOpacity={0.85}
                  >
                    <QrCodeIcon size={16} color="#000000" />
                    <Text style={styles.emptyQrBtnText}>Scan QR Code</Text>
                  </TouchableOpacity>
                  {fallbackDevice && (
                    <TouchableOpacity
                      style={styles.emptyFallbackBtn}
                      onPress={() => beginPairing(fallbackDevice)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.emptyFallbackBtnText}>Try last known host</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}

          {(() => {
            const previousList = pairedHistory.filter(
              (h) => !syncStatus.isConnected || (h.id !== syncStatus.activeDesktop?.id && h.ipAddress !== syncStatus.activeDesktop?.ipAddress)
            );
            if (previousList.length === 0) return null;

            return (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={styles.cardKicker}>PREVIOUSLY CONNECTED</Text>
                  <TouchableOpacity
                    onPress={async () => {
                      await syncService.clearPairedHistory();
                      setPairedHistory([]);
                    }}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: 11, color: '#71717a', textDecorationLine: 'underline' }}>Clear History</Text>
                  </TouchableOpacity>
                </View>

                {previousList.map((item) => (
                  <View key={item.id + item.ipAddress} style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 }}>
                      <WindowsIcon size={20} color="#a1a1aa" branded={true} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.historyMeta}>
                          {item.ipAddress} · {new Date(item.lastConnectedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.reconnectBtn}
                      onPress={() => {
                        const device: DesktopInstance = {
                          id: item.id,
                          name: item.name,
                          ipAddress: item.ipAddress,
                          port: item.port || 49200,
                          version: '1.0.0',
                          isPaired: true,
                          lastSeen: Date.now(),
                          syncId: item.id,
                        };
                        beginPairing(device);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reconnectBtnText}>Connect</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })()}
        </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <Modal visible={!!profileConflict} transparent animationType="fade">
        <View style={styles.conflictBackdrop}>
          <View style={styles.conflictCard}>
            <Text style={styles.conflictTitle}>Sync Profiles</Text>
            <Text style={styles.conflictBody}>
              Desktop and phone have different details. Pairing already succeeded — pick how to keep them in sync.
            </Text>
            <View style={styles.conflictCompare}>
              <Text style={styles.conflictRow}>Desktop  ·  {profileConflict?.desktop.displayName || '—'}</Text>
              <Text style={styles.conflictRow}>Mobile  ·  {profileConflict?.mobile.displayName || '—'}</Text>
            </View>
            <TouchableOpacity style={styles.conflictBtn} onPress={() => resolveConflict('desktop')}>
              <Text style={styles.conflictBtnText}>Keep Desktop Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.conflictBtn} onPress={() => resolveConflict('mobile')}>
              <Text style={styles.conflictBtnText}>Keep Mobile Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.conflictPrimary} onPress={() => resolveConflict('merge')}>
              <Text style={styles.conflictPrimaryText}>Merge details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.conflictLaterBtn} onPress={() => setProfileConflict(null)}>
              <Text style={styles.conflictLaterBtnText}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <QRScannerModal
        visible={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScan={handleQrScanned}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuOverlay: { flex: 1 },
  // Percentage maxWidth resolves against an undefined containing block inside an
  // Android Modal, collapsing the dropdown to its padding box — use pixel math.
  menuDropdown: { position: 'absolute', top: 112, right: 16, width: Math.min(320, Dimensions.get('window').width - 32), backgroundColor: '#202020', borderWidth: 1, borderColor: '#373737', borderRadius: 16, padding: 16, elevation: 16 },
  menuToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  menuLabel: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  menuHint: { color: '#a8adb5', fontSize: 12, lineHeight: 18, marginTop: 5 },
  menuApproval: { color: '#a8adb5', fontSize: 12, lineHeight: 18, borderTopWidth: 1, borderColor: '#373737', paddingTop: 12, marginBottom: 8 },
  menuOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 12 },
  menuOptionIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  menuOptionLabel: { flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '600' },
  menuOptionLabelDisabled: { color: '#8a8f98' },
  transferNotice: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#172d58', alignItems: 'center' },
  connectionIntro: { marginBottom: 6, alignItems: 'center' },
  connectionHeading: { color: '#ffffff', fontSize: 24, fontWeight: '500', marginBottom: 10, textAlign: 'center' },
  connectionDescription: { color: '#ffffff', fontSize: 14, lineHeight: 23 },
  connectionShowcase: { backgroundColor: '#202020', borderWidth: 1, borderColor: '#373737', borderRadius: 16, overflow: 'hidden' },
  connectionArtwork: { backgroundColor: '#0e1220', padding: 20, alignItems: 'center' },
  connectionPreview: { width: '100%', height: 180 },
  connectionCopy: { padding: 20, gap: 10, backgroundColor: '#202020' },
  connectionKicker: { color: '#ffffff', fontSize: 11, letterSpacing: 1 },
  connectionCardTitle: { color: '#ffffff', fontSize: 20, fontWeight: '500' },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollArea: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 14,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#202020',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusDetail: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
  },
  statusRefreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  card: {
    backgroundColor: '#202020',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardKicker: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  platformBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  workstationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  platformIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    paddingRight: 4,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  cardMeta: {
    color: '#71717a',
    fontSize: 12,
    marginTop: 4,
  },
  cardBody: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 14,
  },
  cardBodyStrong: {
    color: '#ffffff',
    fontWeight: '600',
  },
  fieldLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  idInput: {
    backgroundColor: '#202020',
    color: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    letterSpacing: 1.2,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  idInputFocused: {
    borderColor: 'rgba(255,255,255,0.28)',
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 13,
  },
  primaryBtnDisabled: {
    opacity: 0.28,
  },
  primaryBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 9999,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5a1c1e',
    backgroundColor: '#241416',
  },
  ghostBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  ghostBtnDanger: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 14,
  },
  textLink: {
    alignItems: 'center',
    paddingTop: 14,
  },
  textLinkLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 16,
    backgroundColor: '#202020',
    borderRadius: 12,
    paddingVertical: 12,
  },
  statCell: {
    flex: 1,
    paddingHorizontal: 14,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 11,
    marginBottom: 2,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  connectedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  scanAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionAction: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  scanCard: {
    backgroundColor: '#202020',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  scanCopy: {
    color: '#ffffff',
    fontSize: 13,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202020',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  deviceCardSelected: {
    borderColor: 'rgba(255,255,255,0.28)',
  },
  deviceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  deviceName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  deviceMeta: {
    color: '#71717a',
    fontSize: 12,
    marginTop: 3,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#172d58',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
  },
  onlinePillText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#202020',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyBody: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 16,
  },
  scanQrHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#373737',
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  scanQrIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanQrHeroTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  scanQrHeroSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16,
  },
  orDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  orText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  connectWithCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#373737',
    borderRadius: 16,
    padding: 16,
  },
  codeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  codeIconText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  connectWithCodeTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  connectWithCodeSub: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16,
  },
  hideCodeText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
  },
  scanQrSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 4,
  },
  scanQrSecondaryText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 11,
    paddingHorizontal: 20,
    width: 220,
    marginTop: 6,
  },
  emptyQrBtnText: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '700',
  },
  emptyFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 9999,
    paddingVertical: 11,
    paddingHorizontal: 20,
    width: 220,
    marginTop: 8,
  },
  emptyFallbackBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  otpBox: {
    width: 46,
    height: 58,
    borderRadius: 14,
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    borderColor: '#ffffff',
  },
  otpChar: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  conflictBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.74)',
    justifyContent: 'center',
    padding: 24,
  },
  conflictCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  conflictTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  conflictBody: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 18,
  },
  conflictCompare: {
    backgroundColor: '#202020',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  conflictRow: {
    color: '#e4e4e7',
    fontSize: 13,
  },
  conflictBtn: {
    marginTop: 10,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#202020',
  },
  conflictBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  conflictPrimary: {
    marginTop: 10,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  conflictPrimaryText: {
    color: '#000000',
    fontWeight: '800',
  },
  conflictLaterBtn: {
    marginTop: 10,
    borderRadius: 9999,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  conflictLaterBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  sharedCapabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  sharedCapabilityTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  sharedCapabilityDesc: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  sharedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  sharedBadgeText: {
    color: '#60a5fa',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sharedDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyName: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  historyMeta: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  reconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  reconnectBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '600',
  },
});
