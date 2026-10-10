import { BrownButton as TouchableOpacity } from './ButtonSurface';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, RightArrowIcon } from './Icons';
import { UpdateHero } from './UpdateHero';
import { AppUpdateInfo, installOrOpenApkUpdate } from '../services/updater/GitHubUpdateService';
import { pushNavBarColor } from '../theme/systemBars';

interface UpdatePromptModalProps {
  visible: boolean;
  update: AppUpdateInfo | null;
  onDismiss: () => void;
  onUpdated?: () => void;
  /** When true, begin APK download as soon as the modal opens */
  autoStartDownload?: boolean;
}

function promptRestartAfterUpdate() {
  Alert.alert(
    'Restart to finish update',
    'The update is ready. Close and reopen Brown to apply it. Your chats, models, and settings stay on this device — only the app binary is replaced.',
    [{ text: 'OK' }]
  );
}

/** GitHub release bodies arrive as markdown with a trailing changelog link — flatten to bullet lines */
export function parseReleaseNotes(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/[`_~*]/g, '')
        .replace(/^\s*[>#]+\s*/, '')
        .replace(/^\s*[-–—•]\s+/, '')
        .replace(/\s+(?:in\s+|see\s+|view\s+)?https?:\/\/\S+$/i, '')
        .trim()
    )
    .filter(
      (line) =>
        line.length > 2 &&
        !/full changelog/i.test(line) &&
        !/^https?:\/\//i.test(line) &&
        !/^(?:brown(?:\s+ai)?\s*)?v?\d+(\.\d+){1,3}$/i.test(line) &&
        !/^[-–—]+$/.test(line)
    )
    .slice(0, 12);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatReleaseDate(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export const stripV = (v?: string | null) => String(v || '').replace(/^v/i, '');

// One UI dividers are true hairlines, not 1px.
const HAIRLINE = StyleSheet.hairlineWidth;

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  visible,
  update,
  onDismiss,
  onUpdated,
  autoStartDownload = true,
}) => {
  const insets = useSafeAreaInsets();
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allChanges, setAllChanges] = useState(false);
  const [written, setWritten] = useState(0);
  const [total, setTotal] = useState(0);
  const startedForVersion = useRef<string | null>(null);

  // The sheet paints pure black over the chat gradient, so the system bar follows the sheet
  // while it is up and the screen's own color comes back when it is dismissed.
  useEffect(() => {
    if (!visible) return;
    return pushNavBarColor('#000000');
  }, [visible]);

  const handleUpdateNow = async () => {
    if (!update?.apkDownloadUrl) {
      setError('No Android APK was attached to this release.');
      return;
    }
    if (installing) return;
    setInstalling(true);
    setError(null);
    setDone(false);
    setWritten(0);
    setTotal(update.apkSizeBytes || 0);
    try {
      await installOrOpenApkUpdate(update.apkDownloadUrl, (bytes, expected) => {
        setWritten(bytes);
        if (expected > 0) setTotal(expected);
      });
      setWritten(update.apkSizeBytes || 0);
      setDone(true);
      onUpdated?.();
      promptRestartAfterUpdate();
    } catch (e: any) {
      setError(e?.message || 'Failed to start the update download.');
    } finally {
      setInstalling(false);
    }
  };

  useEffect(() => {
    if (!visible || !update || !autoStartDownload) return;
    if (!update.apkDownloadUrl) return;
    if (startedForVersion.current === update.latestVersion) return;
    startedForVersion.current = update.latestVersion;
    handleUpdateNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, update?.latestVersion, autoStartDownload]);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setDone(false);
      setAllChanges(false);
      setWritten(0);
      setTotal(0);
    }
  }, [visible]);

  if (!update) return null;

  const notes = parseReleaseNotes(update.releaseNotes);
  const shownNotes = allChanges ? notes : notes.slice(0, 3);
  const noApk = !update.apkDownloadUrl;
  const expectedBytes = total || update.apkSizeBytes || 0;
  const percent = expectedBytes > 0 ? Math.min(99, Math.round((written / expectedBytes) * 100)) : 0;
  const showProgress = installing || done;
  const released = formatReleaseDate(update.publishedAt);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity brownSurface
            style={styles.backBtn}
            onPress={onDismiss}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
          >
            <ChevronLeftIcon size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Software update</Text>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.kicker}>Update your phone</Text>
          <Text style={styles.headline}>Brown {stripV(update.latestVersion)}</Text>
          <Text style={styles.legal}>
            Using mobile data to download may result in additional charges. Using Wi-Fi is
            recommended.
          </Text>

          <View style={styles.hero}>
            <UpdateHero height={168} />
          </View>

          {notes.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>What's new in this update</Text>
              <View style={styles.notesList}>
                {shownNotes.map((line, i) => (
                  <View key={`${i}-${line.slice(0, 12)}`} style={styles.noteRow}>
                    <View style={styles.noteBullet} />
                    <Text style={styles.noteText}>{line}</Text>
                  </View>
                ))}
              </View>
              {notes.length > 3 && (
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => setAllChanges((open) => !open)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkText}>{allChanges ? 'Show less' : 'View all changes'}</Text>
                  <View style={allChanges ? styles.linkChevronOpen : styles.linkChevron}>
                    <RightArrowIcon size={13} color="#93c5fd" />
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}

          <Text style={styles.groupLabel}>App update information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current version</Text>
              <Text style={styles.infoValue}>v{stripV(update.currentVersion)}</Text>
            </View>
            <View style={[styles.infoRow, styles.infoRowDivider]}>
              <Text style={styles.infoLabel}>Download size</Text>
              <Text style={styles.infoValue}>{formatBytes(expectedBytes)}</Text>
            </View>
            {released ? (
              <View style={[styles.infoRow, styles.infoRowDivider]}>
                <Text style={styles.infoLabel}>Released</Text>
                <Text style={styles.infoValue}>{released}</Text>
              </View>
            ) : null}
            <View style={[styles.infoRow, styles.infoRowDivider]}>
              <Text style={styles.infoLabel}>Channel</Text>
              <Text style={styles.infoValue}>Stable (Mobile Edition)</Text>
            </View>
          </View>

          {showProgress && (
            <View style={styles.progressCard}>
              <View style={styles.progressHeadRow}>
                <Text style={styles.progressLabel}>
                  {done ? 'Download complete' : 'Downloading update'}
                </Text>
                <Text style={styles.progressPct}>
                  {done ? '100%' : expectedBytes > 0 ? `${percent}%` : '…'}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: done ? '100%' : `${percent}%` }]} />
              </View>
              <Text style={styles.progressMeta}>
                {expectedBytes > 0
                  ? `${formatBytes(written)} of ${formatBytes(expectedBytes)}`
                  : `${formatBytes(written)} downloaded`}
              </Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.footnote}>
            Only the app is replaced — your chats, models and settings stay on this device.
          </Text>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity brownSurface
            style={[styles.primaryBtn, noApk && styles.primaryBtnDisabled]}
            onPress={handleUpdateNow}
            disabled={noApk || installing}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>
              {installing
                ? expectedBytes > 0
                  ? `Downloading… ${percent}%`
                  : 'Downloading…'
                : done
                ? 'Download again'
                : Platform.OS === 'android'
                ? 'Download update'
                : 'Open download'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity brownSurface style={styles.secondaryBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    color: '#ffffff',
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
    fontSize: 17,
    letterSpacing: -0.3,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  kicker: {
    color: '#a1a1aa',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 13.5,
    marginTop: 8,
  },
  headline: {
    color: '#ffffff',
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -1,
    marginTop: 2,
  },
  legal: {
    color: '#8a8a93',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 12,
  },
  hero: {
    marginTop: 20,
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#ffffff',
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 16.5,
    letterSpacing: -0.3,
    marginTop: 22,
  },
  notesList: {
    marginTop: 10,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 8,
  },
  noteBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#60a5fa',
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    color: '#d4d4d8',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 13.5,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingVertical: 10,
    borderTopWidth: HAIRLINE,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  linkText: {
    color: '#93c5fd',
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
    fontSize: 14,
  },
  linkChevron: {
    transform: [{ rotate: '0deg' }],
  },
  linkChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  groupLabel: {
    color: '#ffffff',
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 14.5,
    letterSpacing: -0.2,
    marginTop: 22,
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: '#1c1c1f',
    borderRadius: 20,
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  infoRowDivider: {
    borderTopWidth: HAIRLINE,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  infoLabel: {
    color: '#a1a1aa',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 13.5,
  },
  infoValue: {
    color: '#ffffff',
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
    fontSize: 13.5,
  },
  progressCard: {
    backgroundColor: 'rgba(41, 82, 148, 0.14)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
    padding: 15,
    marginTop: 14,
  },
  progressHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: {
    color: '#dbeafe',
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
    fontSize: 13,
  },
  progressPct: {
    color: '#ffffff',
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 13,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#295294',
  },
  progressMeta: {
    color: '#9ca3af',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 11.5,
    marginTop: 8,
  },
  error: {
    color: '#fca5a5',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 14,
  },
  footnote: {
    color: '#71717a',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 18,
  },
  bottomBar: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#000000',
    borderTopWidth: HAIRLINE,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#295294',
    borderRadius: 9999,
    paddingVertical: 15,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 15.5,
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: '#a1a1aa',
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
    fontSize: 14,
  },
});
