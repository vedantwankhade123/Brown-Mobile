import { BrownButton as TouchableOpacity } from '../components/ButtonSurface';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Switch,
  Image,
  Text,
  StyleSheet,
  ScrollView,
  
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
import { connectionPresentation } from '../services/sync/connectionPresentation';
import { colors } from '../theme/colors';
import { ScreenHeader, useStickyHeader } from '../components/ScreenHeader';
import { MoreVerticalIcon, LaptopIcon, RefreshIcon, WifiIcon, WindowsIcon, CheckIcon, QrCodeIcon, ChevronRightIcon } from '../components/Icons';
import { QRScannerModal } from '../components/QRScannerModal';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const Easing = (Animated as any).Easing || {
  out: (f: any) => f,
  cubic: (t: any) => t,
  inOut: (f: any) => f,
  ease: (t: any) => t,
  linear: (t: any) => t,
};

interface DesktopSyncScreenProps {
  isActive?: boolean;
  onBack: () => void;
  initialScan?: boolean;
}

export const DesktopSyncScreen: React.FC<DesktopSyncScreenProps> = ({ onBack, initialScan = false, isActive = true }) => {
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
  const [connectingById, setConnectingById] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const transferLock = useRef(false);
  const shownTransferRequest = useRef<string | null>(null);
  const [savingAutoConnect, setSavingAutoConnect] = useState(false);
  const scanLock = useRef(false);

  useEffect(() => {
    if (isActive) return;
    setMenuOpen(false);
    setShowCodeInput(false);
    setIsQrScannerOpen(false);
  }, [isActive]);

  const syncService = DesktopSyncService.getInstance();
  useEffect(() => {
    const request = syncStatus.transferRequest;
    if (!isActive || !request || shownTransferRequest.current === request.id) return;
    shownTransferRequest.current = request.id;
    const description = request.action === 'profile' ? 'Share your desktop profile with this phone? You can keep profiles separate instead.' : request.action === 'merge' ? 'Merge both chat histories? Existing chats are kept and duplicate messages are skipped.' : request.action === 'import' ? 'Send phone chats to the desktop?' : 'Import desktop chats onto this phone?';
    Alert.alert('Desktop request', description, [
      { text: 'Keep separate', style: 'cancel', onPress: () => syncService.completeTransferRequest(false).catch(() => {}) },
      { text: 'Approve', onPress: () => syncService.completeTransferRequest(true).then(() => { setProfileConflict(syncService.getPendingProfileConflict()); Alert.alert('Complete', 'The desktop request was completed.'); }).catch((error: any) => { shownTransferRequest.current = null; Alert.alert('Transfer failed', error?.message || 'Please try again.'); }) }
    ]);
  }, [syncStatus.transferRequest?.id, isActive]);
  const pinInputRef = useRef<any>(null);
  const scanSpin = useRef(new Animated.Value(0)).current;

  const canConnect = syncIdInput.trim().replace(/[^A-Z0-9-]/gi, '').length >= 8;
  const liveDevices = devices.filter((d) => !d.isFallback);
  const fallbackDevice = devices.find((d) => d.isFallback);

  const wifiPulse = useRef(new Animated.Value(1)).current;


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
    if (isActive && isScanning) {
      scanSpin.setValue(0);
      const spin = Animated.loop(
        Animated.timing(scanSpin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        })
      );
      spin.start();
      return () => spin.stop();
    }
    Animated.timing(scanSpin, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  }, [isScanning, isActive]);

  useEffect(() => {
    if (isActive && !syncStatus.isConnected) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(wifiPulse, { toValue: 1.14, duration: 900, useNativeDriver: true, isInteraction: false }),
          Animated.timing(wifiPulse, { toValue: 1.0, duration: 900, useNativeDriver: true, isInteraction: false }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    }
  }, [syncStatus.isConnected, isActive]);

  const handleScan = async () => {
    if (scanLock.current) return;
    scanLock.current = true;
    setIsScanning(true);
    try {
      const list = await syncService.scanLocalNetwork();
      setDevices(list);
    } catch (error) {
      console.warn('Desktop discovery failed', error);
    } finally {
      scanLock.current = false;
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
    if (connectingById) return;
    const id = syncIdInput.trim().toUpperCase();
    if (!id) return;
    setConnectingById(true);
    try {
    const match = await syncService.connectBySyncId(id);
    if (!match) {
      Alert.alert(
        'Desktop not found',
        `No Brown Desktop "${id}" responded on this Wi-Fi. Open Brown Desktop, tap Generate QR (or Generate Pair Code) in the top bar, and make sure both devices use the same network.`
      );
      return;
    }
    setShowCodeInput(false);
    await beginPairing(match);
    } catch (error: any) {
      Alert.alert('Could not connect', error?.message || 'Please try again.');
    } finally {
      setConnectingById(false);
    }
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
            companion: parsed.companion,
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
      Alert.alert('Desktop refreshed', 'Desktop model access and shared settings are up to date. Use Chat sharing to transfer conversations.');
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync');
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Unpair desktop', 'Remove this saved desktop pairing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpair',
        style: 'destructive',
        onPress: () => syncService.disconnect(),
      },
    ]);
  };

  const transferChats = async (direction: 'fetch' | 'export' | 'merge') => {
    if (transferLock.current || syncStatus.syncInProgress) return;
    if (!syncStatus.isConnected) { Alert.alert('Pair your desktop first', 'Connect to Brown Desktop before transferring chats.'); return; }
    transferLock.current = true;
    setTransferBusy(true);
    setMenuOpen(false);
    try {
      if (direction === 'merge') {
        await syncService.fetchDesktopChats();
        await syncService.exportPhoneChats();
        Alert.alert('Chats merged', 'Both devices now have the combined conversations. Existing messages are not duplicated.');
      } else if (direction === 'fetch') {
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
  const updateSharing = async (key: 'modelAccess' | 'voiceAccess' | 'profileMode' | 'livePreview', value: boolean) => {
    try {
      await syncService.setDevicePreferences({
        modelAccess: syncStatus.preferences?.modelAccess !== false,
        voiceAccess: syncStatus.preferences?.voiceAccess !== false,
        profileMode: syncStatus.preferences?.profileMode || 'separate',
        [key]: key === 'profileMode' ? (value ? 'shared' : 'separate') : value,
      });
      setProfileConflict(syncService.getPendingProfileConflict());
    } catch (error: any) { Alert.alert('Could not update sharing', error?.message || 'Please reconnect and try again.'); }
  };

  const presentation = connectionPresentation(syncStatus);
  const statusLabel = presentation.label;
  const statusDetail = syncStatus.needsReauth
    ? syncStatus.reauthReason || 'Network changed — enter the code on your PC.'
    : syncStatus.isConnected
      ? `${syncStatus.connectionType === 'relay' ? 'Encrypted relay' : syncStatus.connectionType === 'direct' ? 'Direct connection' : 'Local connection'} · Pairing saved`
      : syncStatus.activeDesktop ? (syncStatus.reauthReason || 'Waiting for your desktop to reconnect…') : 'No desktop paired. Keep Brown open on PC and tap refresh to scan.';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={{ flex: 1 }}>
        <ScreenHeader title="Desktop Sync" onBack={onBack} scrolled={syncScrolled} right={
          <TouchableOpacity brownSurface="light" style={styles.menuButton} onPress={() => setMenuOpen(true)} accessibilityLabel="Desktop sync options" accessibilityRole="button" accessibilityState={{ expanded: menuOpen }}>
            <MoreVerticalIcon size={22} color="#ffffff" />
          </TouchableOpacity>
        } />
        {isActive && menuOpen && (<Modal visible={isActive && menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close sync options" />
            <View style={[styles.menuDropdown, { top: insets.top + 60 }]} accessibilityViewIsModal>
              <View style={styles.menuToggleRow}>
                <View style={{ flex: 1 }}><Text style={styles.menuLabel}>Auto-connect to paired PC</Text><Text style={styles.menuHint}>Reconnect when networks change; prefer local access.</Text></View>
                <Switch value={syncStatus.autoConnectEnabled !== false} onValueChange={updateAutoConnect} disabled={savingAutoConnect} trackColor={{ false: '#343434', true: '#2563eb' }} thumbColor="#ffffff" />
              </View>

            </View>
          </View>
        </Modal>)}
        {transferBusy && <View style={styles.transferNotice}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.menuLabel}>Waiting for desktop approval…</Text></View>}
        <ScrollView
          contentContainerStyle={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={syncScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.connectionIntro}>
            <Text style={styles.connectionHeading}>{presentation.heading}</Text>
          </View>
          {!syncStatus.isConnected && !syncStatus.activeDesktop && !awaitingCode && (
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
                <Text style={styles.connectionCardTitle}>Brown for Windows</Text>
                <View style={styles.connectionSteps}>
                  {[
                    'Open Connection on your PC.',
                    'Enable mobile access and generate a pairing QR.',
                    'Scan it below, or use your PC’s Sync ID.',
                  ].map((step, index) => (
                    <View key={step} style={styles.connectionStep}>
                      <Text style={styles.connectionStepNumber}>{index + 1}.</Text>
                      <Text style={[styles.connectionDescription, { flex: 1 }]}>{step}</Text>
                    </View>
                  ))}
                </View>
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
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.statusTitle}>{statusLabel}</Text>
              <Text style={styles.statusDetail}>{statusDetail}</Text>
            </View>
            <TouchableOpacity
              brownSurface="light"
              style={styles.statusRefreshBtn}
              onPress={async () => {
                const status = await syncService.refreshStatus();
                if (!status.isConnected) handleScan();
              }}
              disabled={isScanning}
              activeOpacity={0.7}
              accessibilityLabel="Refresh sync status"
            >
              <RefreshIcon size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {syncStatus.activeDesktop && (() => {
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
                    <Text style={styles.statLabel}>Last updated</Text>
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
                    <Text style={styles.statLabel}>Transferred items</Text>
                    <Text style={styles.statValue}>{syncStatus.syncedThreadsCount}</Text>
                  </View>
                </View>

                {syncStatus.isConnected && <TouchableOpacity style={[styles.ghostBtn, { flex: 0, marginBottom: 18 }]} onPress={() => Alert.alert('Disconnect desktop?', 'Pairing stays saved. Reopen either app to reconnect.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', onPress: () => syncService.disconnectSession().catch((error: any) => Alert.alert('Could not disconnect', error.message)) }])} activeOpacity={0.8}><Text style={styles.ghostBtnDanger}>Disconnect</Text></TouchableOpacity>}
                {!syncStatus.isConnected && syncStatus.reauthReason?.includes('Disconnected for this session') && <Text style={styles.sectionHint}>{syncStatus.reauthReason}</Text>}
                <View style={styles.connectedActions}>
                  <TouchableOpacity
                    brownSurface="light"
                    style={[styles.primaryBtn, styles.refreshAction, (!syncStatus.isConnected || syncStatus.syncInProgress || transferBusy) && styles.primaryBtnDisabled]}
                    onPress={handleSyncNow}
                    disabled={!syncStatus.isConnected || syncStatus.syncInProgress || transferBusy}
                    activeOpacity={0.8}
                  >
                    <View style={styles.buttonIcon}><RefreshIcon size={16} color="#ffffff" /></View>
                    <Text style={[styles.primaryBtnText, { color: '#ffffff' }]}>
                      {syncStatus.syncInProgress ? 'Refreshing…' : syncStatus.isConnected ? 'Refresh' : 'Offline'}
                    </Text>
                  </TouchableOpacity>
                    <TouchableOpacity style={styles.ghostBtn} onPress={handleDisconnect} activeOpacity={0.8}>
                    <Text style={styles.ghostBtnDanger}>Unpair</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.syncSectionTitle}>Desktop access</Text>
                <Text style={styles.sectionHint}>Models stay on your PC. Choose what this phone can use.</Text>
                <View style={styles.accessRow}>
                  <View style={styles.accessCopy}><Text style={styles.accessTitle}>Live chat preview</Text><Text style={styles.accessHint}>Show this phone’s open chat on your paired desktop. Stops when you leave chat or background the app.</Text></View>
                  <Switch disabled={!syncStatus.isConnected} value={syncStatus.preferences?.livePreview === true} onValueChange={(value: boolean) => updateSharing('livePreview', value)} trackColor={{ false: '#343434', true: '#2563eb' }} thumbColor="#ffffff" accessibilityLabel="Share live chat preview with desktop" />
                </View>
                {(['modelAccess', 'voiceAccess', 'profileMode'] as const).map((key) => (
                  <View key={key} style={styles.accessRow}>
                    <View style={styles.accessCopy}>
                      <Text style={styles.accessTitle}>{key === 'modelAccess' ? 'Desktop models' : key === 'voiceAccess' ? 'Voice recognition' : 'Shared profile'}</Text>
                      <Text style={styles.accessHint}>{key === 'modelAccess' ? 'Run responses on your desktop.' : key === 'voiceAccess' ? 'Transcribe recordings on your PC.' : syncStatus.preferences?.profileMode === 'shared' ? 'Profile sharing is enabled.' : 'Your phone profile stays separate.'}</Text>
                    </View>
                    <Switch disabled={!syncStatus.isConnected} value={key === 'profileMode' ? syncStatus.preferences?.profileMode === 'shared' : syncStatus.preferences?.[key] !== false} onValueChange={(value: boolean) => updateSharing(key, value)} trackColor={{ false: '#343434', true: '#2563eb' }} thumbColor="#ffffff" accessibilityLabel={key === 'modelAccess' ? 'Desktop model access' : key === 'voiceAccess' ? 'Desktop voice access' : 'Share profile'} />
                  </View>
                ))}
              </View>
              <View style={styles.card}>
                <Text style={styles.syncSectionTitle}>Chat sharing</Text>
                <Text style={styles.sectionHint}>Keep histories separate, or copy and merge chats with approval.</Text>
                {([
                  { action: 'fetch', title: 'Import desktop chats', detail: 'Copy PC conversations to this phone.' },
                  { action: 'export', title: 'Send phone chats', detail: 'Add phone conversations to your PC.' },
                  { action: 'merge', title: 'Merge both histories', detail: 'Combine chats without duplicate messages.' },
                ] as const).map((item, index) => (
                  <TouchableOpacity key={item.action} style={[styles.chatActionRow, index > 0 && styles.chatActionSeparator, (!syncStatus.isConnected || transferBusy || syncStatus.syncInProgress) && styles.actionDisabled]} disabled={!syncStatus.isConnected || transferBusy || syncStatus.syncInProgress} onPress={() => transferChats(item.action)} accessibilityRole="button" accessibilityLabel={item.title}>
                    <View style={styles.chatActionIcon}><LaptopIcon size={18} color="#93c5fd" /></View>
                    <View style={styles.accessCopy}><Text style={styles.accessTitle}>{item.title}</Text><Text style={styles.accessHint}>{item.detail}</Text></View>
                    <ChevronRightIcon size={18} color="#a8adb5" />
                  </TouchableOpacity>
                ))}
                <Text style={styles.sharingFootnote}>{syncStatus.isConnected ? 'Transfers keep existing chats. Imported conversations get a device label.' : 'Reconnect your desktop to share chats.'}</Text>
              </View>
              </>
            );
          })()}

          {!syncStatus.isConnected && awaitingCode && selectedDevice && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Enter the code on your PC</Text>
              <Text style={styles.cardBody}>
                Enter the 6-character code from your desktop. It expires in 2 minutes.
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

              <TouchableOpacity brownSurface="light"
                style={[styles.primaryBtn, styles.pairingAction, pinCode.length < 6 && styles.primaryBtnDisabled]}
                onPress={handlePair}
                disabled={pinCode.length < 6}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Verify & pair</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ghostBtn, styles.pairingAction, { marginTop: 8 }]} onPress={cancelPairing} activeOpacity={0.7}>
                <Text style={styles.ghostBtnDanger}>Cancel pairing</Text>
              </TouchableOpacity>
              <TouchableOpacity brownSurface="light"
                style={styles.scanQrSecondaryBtn}
                onPress={() => setIsQrScannerOpen(true)}
                activeOpacity={0.8}
              >
                <QrCodeIcon size={16} color="#ffffff" />
                <Text style={styles.scanQrSecondaryText}>Scan QR code on desktop</Text>
              </TouchableOpacity>
            </View>
          )}

          {!syncStatus.isConnected && !awaitingCode && (
            <>
              {/* Primary Action: Instant QR Scanner */}
              <TouchableOpacity brownSurface="light"
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

              <TouchableOpacity brownSurface="light"
                style={[styles.primaryBtn, styles.pairingAction]}
                onPress={() => setShowCodeInput(true)}
                accessibilityRole="button"
                accessibilityLabel="Connect to PC"
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Connect to PC</Text>
              </TouchableOpacity>
              {syncStatus.needsReauth && syncStatus.activeDesktop && (
                <TouchableOpacity brownSurface="light"
                  style={styles.primaryBtn}
                  onPress={() => beginPairing(syncStatus.activeDesktop!)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Confirm with 6-character code</Text>
                </TouchableOpacity>
              )}

              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Nearby on Wi-Fi</Text>
                <TouchableOpacity brownSurface="light"
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
                  <TouchableOpacity brownSurface="light"
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
                  <TouchableOpacity brownSurface="light"
                    style={styles.emptyQrBtn}
                    onPress={() => setIsQrScannerOpen(true)}
                    activeOpacity={0.85}
                  >
                    <QrCodeIcon size={16} color="#000000" />
                    <Text style={styles.emptyQrBtnText}>Scan QR Code</Text>
                  </TouchableOpacity>
                  {fallbackDevice && (
                    <TouchableOpacity brownSurface="light"
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

                {previousList.map((item, index) => (
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
                    <TouchableOpacity brownSurface="light"
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
        </View>
      </KeyboardAvoidingView>

      {isActive && showCodeInput && (<Modal visible={isActive && showCodeInput} transparent animationType="fade" onRequestClose={() => setShowCodeInput(false)}>
        <KeyboardAvoidingView style={styles.connectModalBackdrop} behavior="padding">
          <View style={[styles.card, styles.connectModalCard]} accessibilityViewIsModal>
            <Text style={styles.connectModalTitle}>Connect to PC</Text>
            <Text style={styles.connectFormDescription}>Open Connection in Brown on your PC and enter its Sync ID below.</Text>
            <Text style={styles.fieldLabel}>Sync ID</Text>
            <TextInput
              style={[styles.idInput, idFocused && styles.idInputFocused]}
              value={syncIdInput}
              onChangeText={(value: string) => setSyncIdInput(value.toUpperCase())}
              onFocus={() => setIdFocused(true)}
              onBlur={() => setIdFocused(false)}
              placeholder="BROWN-WIN-7842"
              placeholderTextColor="#8e959f"
              accessibilityLabel="Desktop Sync ID"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={22}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={() => { if (canConnect && !connectingById) handleConnectById(); }}
              {...(Platform.OS === 'web' ? ({ outline: 'none' } as any) : {})}
            />
            <TouchableOpacity brownSurface="light"
              style={[styles.primaryBtn, styles.pairingAction, (!canConnect || connectingById) && styles.primaryBtnDisabled]}
              onPress={handleConnectById}
              disabled={!canConnect || connectingById}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>{connectingById ? 'Connecting…' : 'Connect to PC'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ghostBtn, { flex: 0, marginTop: 10 }]} onPress={() => setShowCodeInput(false)} accessibilityLabel="Cancel connecting to PC" activeOpacity={0.8}>
              <Text style={styles.ghostBtnDanger}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>)}
      {isActive && !!profileConflict && (<Modal visible={isActive && !!profileConflict} transparent animationType="fade">
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
            <TouchableOpacity brownSurface="light" style={styles.conflictBtn} onPress={() => resolveConflict('desktop')}>
              <Text style={styles.conflictBtnText}>Keep Desktop Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity brownSurface="light" style={styles.conflictBtn} onPress={() => resolveConflict('mobile')}>
              <Text style={styles.conflictBtnText}>Keep Mobile Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.conflictPrimary} onPress={() => resolveConflict('merge')}>
              <Text style={styles.conflictPrimaryText}>Merge details</Text>
            </TouchableOpacity>
            <TouchableOpacity brownSurface="light" style={styles.conflictLaterBtn} onPress={() => setProfileConflict(null)}>
              <Text style={styles.conflictLaterBtnText}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>)}

      <QRScannerModal
        visible={isActive && isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScan={handleQrScanned}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  introDescription: { color: '#a8adb5', fontSize: 13, lineHeight: 20 },
  syncSectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  sectionHint: { color: '#a8adb5', fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  accessRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: '#303030' },
  accessCopy: { flex: 1, minWidth: 0 },
  accessTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  accessHint: { color: '#a8adb5', fontSize: 12, lineHeight: 17, marginTop: 3 },
  chatActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingVertical: 14, paddingHorizontal: 0 },
  chatActionSeparator: { borderTopWidth: 1, borderTopColor: '#ffffff' },
  chatActionIcon: { width: 34, height: 34, borderRadius: 9999, backgroundColor: '#17243b', alignItems: 'center', justifyContent: 'center' },
  actionDisabled: { opacity: 0.45 },
  sharingFootnote: { color: '#8e959f', fontSize: 11, lineHeight: 17, marginTop: 10 },
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
  connectionIntro: { marginBottom: 2, gap: 6 },
  connectionHeading: { color: '#ffffff', fontSize: 25, fontWeight: '600', marginBottom: 2, textAlign: 'center', width: '100%' },
  connectionDescription: { color: '#ffffff', fontSize: 14, lineHeight: 23 },
  connectionShowcase: { backgroundColor: '#202020', borderWidth: 1, borderColor: '#373737', borderRadius: 16, overflow: 'hidden' },
  connectionArtwork: { backgroundColor: '#0e1220', padding: 20, alignItems: 'center' },
  connectionPreview: { width: '100%', height: 180 },
  connectionCopy: { padding: 20, gap: 10, backgroundColor: '#202020' },
  connectionSteps: { gap: 10 },
  connectionStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  connectionStepNumber: { color: '#a8adb5', fontSize: 14, lineHeight: 23, width: 18 },
  connectForm: { padding: 20, borderColor: '#373737' },
  connectModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  connectModalCard: { width: '100%', maxWidth: 380, padding: 20, borderColor: '#373737' },
  connectModalTitle: { color: '#ffffff', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  connectFormHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  connectFormCancel: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: '#F5B6BD' },
  connectFormCancelText: { color: '#70232E', fontSize: 13, fontWeight: '600' },
  connectFormDescription: { color: '#a8adb5', fontSize: 13, lineHeight: 20, marginBottom: 18 },
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
    color: '#a8adb5',
    fontSize: 12,
    lineHeight: 18,
  },
  statusRefreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
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
    backgroundColor: '#141414',
    color: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  idInputFocused: {
    borderColor: '#a8adb5',
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
    paddingHorizontal: 16,
    minHeight: 44,
    minWidth: 0,
  },
  buttonIcon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pairingAction: { flex: 0, borderWidth: 1, borderColor: '#48484b' },
  primaryBtnDisabled: {
    opacity: 0.28,
  },
  refreshAction: { borderWidth: 1, borderColor: '#48484b' },
  primaryBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 9999,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F5B6BD',
    backgroundColor: '#F5B6BD',
  },
  ghostBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  ghostBtnDanger: {
    color: '#70232E',
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  scanAgainBtn: {
    width: 128,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#48484b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#48484b',
    marginTop: 8,
  },
  scanQrSecondaryText: {
    color: '#ffffff',
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
