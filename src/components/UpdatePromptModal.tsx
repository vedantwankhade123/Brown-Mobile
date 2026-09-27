import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { DownloadIcon, CloseIcon } from './Icons';
import { AppUpdateInfo, installOrOpenApkUpdate } from '../services/updater/GitHubUpdateService';

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
function parseReleaseNotes(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[#>*-]+\s*/, '').trim())
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/[`_]/g, ''))
    .filter(
      (line) =>
        line.length > 2 &&
        !/full changelog/i.test(line) &&
        !/^https?:\/\//i.test(line) &&
        !/^[-–—]+$/.test(line)
    )
    .slice(0, 12);
}

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  visible,
  update,
  onDismiss,
  onUpdated,
  autoStartDownload = true,
}) => {
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedForVersion = useRef<string | null>(null);

  const handleUpdateNow = async () => {
    if (!update?.apkDownloadUrl) {
      setError('No Android APK was attached to this GitHub release.');
      return;
    }
    if (installing) return;
    setInstalling(true);
    setError(null);
    setDone(false);
    try {
      await installOrOpenApkUpdate(update.apkDownloadUrl);
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
    }
  }, [visible]);

  if (!update) return null;

  const notes = parseReleaseNotes(update.releaseNotes);
  const noApk = !update.apkDownloadUrl;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onDismiss}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Dismiss"
          >
            <CloseIcon size={15} color="#a1a1aa" />
          </TouchableOpacity>

          <View style={styles.iconTile}>
            <DownloadIcon size={20} color="#ffffff" />
          </View>

          <Text style={styles.title}>Update available</Text>
          <View style={styles.versionRow}>
            <View style={styles.versionChip}>
              <Text style={styles.versionChipText}>v{update.currentVersion}</Text>
            </View>
            <Text style={styles.versionArrow}>→</Text>
            <View style={[styles.versionChip, styles.versionChipNew]}>
              <Text style={[styles.versionChipText, styles.versionChipNewText]}>
                v{update.latestVersion}
              </Text>
            </View>
          </View>

          {notes.length > 0 && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>What's new</Text>
              <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
                {notes.map((line, i) => (
                  <View key={`${i}-${line.slice(0, 12)}`} style={styles.noteRow}>
                    <View style={styles.noteBullet} />
                    <Text style={styles.noteText}>{line}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {installing ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#93c5fd" />
              <Text style={styles.statusText}>Downloading update…</Text>
            </View>
          ) : done ? (
            <View style={[styles.statusRow, styles.statusRowDone]}>
              <View style={styles.doneDot} />
              <Text style={[styles.statusText, styles.statusTextDone]}>
                Downloaded — reopen Brown to finish installing
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (noApk || installing) && styles.primaryBtnDisabled]}
            onPress={handleUpdateNow}
            disabled={!update.apkDownloadUrl || installing}
            activeOpacity={0.85}
          >
            <DownloadIcon size={16} color="#ffffff" />
            <Text style={styles.primaryBtnText}>
              {installing
                ? 'Downloading…'
                : done
                ? 'Download again'
                : Platform.OS === 'android'
                ? 'Download update'
                : 'Open download'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1c1c1f',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    paddingTop: 26,
    alignItems: 'center',
    maxHeight: '84%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.65,
    shadowRadius: 34,
    elevation: 24,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconTile: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#295294',
    marginBottom: 14,
  },
  title: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  versionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  versionChipText: {
    color: '#a1a1aa',
    fontSize: 12.5,
    fontWeight: '600',
  },
  versionChipNew: {
    backgroundColor: 'rgba(41, 82, 148, 0.28)',
    borderColor: 'rgba(147, 197, 253, 0.35)',
  },
  versionChipNewText: {
    color: '#dbeafe',
  },
  versionArrow: {
    color: '#71717a',
    fontSize: 13,
  },
  notesBox: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 16,
  },
  notesLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  notesScroll: {
    maxHeight: 168,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 7,
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
    fontSize: 13.5,
    lineHeight: 19,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  statusRowDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  doneDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  statusText: {
    color: '#bfdbfe',
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
  },
  statusTextDone: {
    color: '#a7f3d0',
  },
  error: {
    color: '#fca5a5',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: '#295294',
    borderRadius: 9999,
    paddingVertical: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '500',
  },
});
