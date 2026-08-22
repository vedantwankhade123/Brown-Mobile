import React, { useState, useEffect, useRef } from 'react';
import {
  View,
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
} from 'react-native';
import { DesktopSyncService, PairedDesktopHistoryItem } from '../services/sync/DesktopSync';
import { DesktopInstance, ProfileConflict, SyncStatus } from '../types/sync';
import { colors } from '../theme/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { LaptopIcon, RefreshIcon, WifiIcon, WindowsIcon, AppleIcon, CheckIcon } from '../components/Icons';
import { SyncIllustration } from '../components/SyncIllustration';

const Easing = (Animated as any).Easing || {
  out: (f: any) => f,
  cubic: (t: any) => t,
  inOut: (f: any) => f,
  ease: (t: any) => t,
  linear: (t: any) => t,
};

interface DesktopSyncScreenProps {
  onBack: () => void;
}

export const DesktopSyncScreen: React.FC<DesktopSyncScreenProps> = ({ onBack }) => {
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
  const [selectedDevice, setSelectedDevice] = useState<DesktopInstance | null>(null);
  const [syncIdInput, setSyncIdInput] = useState('');
  const [idFocused, setIdFocused] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [profileConflict, setProfileConflict] = useState<ProfileConflict | null>(null);

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
    Animated.parallel([
      Animated.timing(pageFade, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(pageSlide, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, []);

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
    const device: DesktopInstance = {
      id,
      name: id,
      ipAddress: '127.0.0.1',
      port: 49200,
      version: '1.0.0',
      isPaired: false,
      lastSeen: Date.now(),
      syncId: id,
    };
    await beginPairing(device);
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

  const resolveConflict = async (choice: 'desktop' | 'mobile' | 'merge') => {
    await syncService.resolveProfileConflict(choice);
    setProfileConflict(null);
    Alert.alert('Profiles synced', 'Display name, Gemini key, and instructions are aligned.');
  };

  const handleSyncNow = async () => {
    try {
      await syncService.syncNow();
      Alert.alert('Sync Complete', 'Conversations and notes updated with desktop.');
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync');
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect Desktop', 'Unpair from the desktop Ultron node?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => syncService.disconnect(),
      },
    ]);
  };

  const statusLabel = syncStatus.needsReauth
    ? 'Disconnected'
    : syncStatus.isConnected
      ? 'Paired with Desktop'
      : 'Disconnected';
  const statusDetail = syncStatus.needsReauth
    ? syncStatus.reauthReason || 'Network changed — enter the code on your PC.'
    : syncStatus.isConnected
      ? syncStatus.activeDesktop?.name || 'Ultron Desktop'
      : 'No desktop paired. Keep Ultron open on PC and tap refresh to scan.';

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Desktop Sync" onBack={onBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={{ flex: 1, opacity: pageFade, transform: [{ translateY: pageSlide }] }}>
        <ScrollView
          contentContainerStyle={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.statusCard}>
            <Animated.View style={{ transform: [{ scale: syncStatus.isConnected ? 1 : wifiPulse }] }}>
              {syncStatus.isConnected ? (
                <CheckIcon size={22} color="#10B981" />
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
              <RefreshIcon size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {syncStatus.isConnected && (() => {
            const devName = syncStatus.activeDesktop?.name || 'Ultron Desktop';
            const syncId = syncStatus.activeDesktop?.syncId || syncStatus.activeDesktop?.id || '';
            const isAppleDesktop = /mac|darwin|apple/i.test(devName) || /mac|apple/i.test(syncId);

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
                    {isAppleDesktop ? (
                      <AppleIcon size={32} color="#ffffff" />
                    ) : (
                      <WindowsIcon size={32} branded={true} />
                    )}
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
                        : 'Just now'}
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
                    disabled={syncStatus.syncInProgress}
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
                    <Text style={styles.sharedBadgeText}>Shared</Text>
                  </View>
                </View>

                <View style={styles.sharedDivider} />

                <View style={styles.sharedCapabilityRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sharedCapabilityTitle}>Gemini Cloud API Key</Text>
                    <Text style={styles.sharedCapabilityDesc}>Synchronized cloud credentials inherited from desktop</Text>
                  </View>
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>Shared</Text>
                  </View>
                </View>

                <View style={styles.sharedDivider} />

                <View style={styles.sharedCapabilityRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sharedCapabilityTitle}>Chat History & Notes</Text>
                    <Text style={styles.sharedCapabilityDesc}>Cross-device conversation continuity with desktop approval</Text>
                  </View>
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>Shared</Text>
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
                A popup on Windows shows a 4-character code for{' '}
                <Text style={styles.cardBodyStrong}>{selectedDevice.name}</Text>. It expires in 60 seconds.
              </Text>

              <TouchableOpacity style={styles.otpRow} onPress={() => pinInputRef.current?.focus()} activeOpacity={0.9}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.otpBox, pinCode[i] && styles.otpBoxFilled]}>
                    <Text style={styles.otpChar}>{pinCode[i] || ''}</Text>
                  </View>
                ))}
              </TouchableOpacity>
              <TextInput
                ref={pinInputRef}
                style={styles.hiddenInput}
                value={pinCode}
                onChangeText={(v: string) => setPinCode(v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={4}
                caretHidden
                {...(Platform.OS === 'web' ? ({ outline: 'none' } as any) : {})}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, pinCode.length < 4 && styles.primaryBtnDisabled]}
                onPress={handlePair}
                disabled={pinCode.length < 4}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Verify & pair</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.textLink} onPress={cancelPairing} activeOpacity={0.7}>
                <Text style={styles.textLinkLabel}>Cancel pairing</Text>
              </TouchableOpacity>
            </View>
          )}

          {!syncStatus.isConnected && !awaitingCode && (
            <>
              {syncStatus.needsReauth && syncStatus.activeDesktop && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => beginPairing(syncStatus.activeDesktop!)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Confirm with 4-digit code</Text>
                </TouchableOpacity>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Connect to PC</Text>
                <Text style={styles.cardBody}>
                  Type the Sync ID from Ultron on Windows. It looks like ULTRON-WIN-7842.
                </Text>
                <Text style={styles.fieldLabel}>Sync ID</Text>
                <TextInput
                  style={[styles.idInput, idFocused && styles.idInputFocused]}
                  value={syncIdInput}
                  onChangeText={(v: string) => setSyncIdInput(v.toUpperCase())}
                  onFocus={() => setIdFocused(true)}
                  onBlur={() => setIdFocused(false)}
                  placeholder="ULTRON-WIN-····"
                  placeholderTextColor="#52525b"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={22}
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
                  <Text style={styles.scanCopy}>Searching this network for Ultron Desktop…</Text>
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
                    {/mac|darwin|apple/i.test(device.name) || /mac|apple/i.test(device.syncId || '') ? (
                      <AppleIcon size={22} color="#ffffff" />
                    ) : (
                      <WindowsIcon size={22} color="#ffffff" branded={true} />
                    )}
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
                  <SyncIllustration width={260} height={105} />
                  <Text style={styles.emptyTitle}>No Windows PC found</Text>
                  <Text style={styles.emptyBody}>
                    Open Ultron on your computer, stay on this Wi-Fi, then scan again.
                  </Text>
                  {fallbackDevice && (
                    <TouchableOpacity
                      style={styles.ghostBtn}
                      onPress={() => beginPairing(fallbackDevice)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.ghostBtnText}>Try last known host</Text>
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
                      {item.platform === 'ios' ? (
                        <AppleIcon size={20} color="#a1a1aa" />
                      ) : (
                        <WindowsIcon size={20} color="#a1a1aa" branded={true} />
                      )}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: '#282828',
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
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 18,
  },
  statusRefreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  card: {
    backgroundColor: '#282828',
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
    backgroundColor: '#111111',
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
    backgroundColor: '#111111',
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
    backgroundColor: '#282828',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  scanCopy: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
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
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  onlinePillText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#282828',
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
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  otpBox: {
    width: 56,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#111111',
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
    fontSize: 24,
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
    backgroundColor: '#282828',
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
    backgroundColor: '#282828',
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
