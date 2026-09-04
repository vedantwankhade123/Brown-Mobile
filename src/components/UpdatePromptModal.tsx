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

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  visible,
  update,
  onDismiss,
  onUpdated,
  autoStartDownload = true,
}) => {
  const [installing, setInstalling] = useState(false);
  const [progressNote, setProgressNote] = useState<string | null>(null);
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
    setProgressNote('Downloading update…');
    try {
      await installOrOpenApkUpdate(update.apkDownloadUrl);
      setProgressNote('Download complete');
      onUpdated?.();
      promptRestartAfterUpdate();
    } catch (e: any) {
      setError(e?.message || 'Failed to start the update download.');
      setProgressNote(null);
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
      setProgressNote(null);
    }
  }, [visible]);

  if (!update) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Software Update</Text>
          <Text style={styles.title}>New Version Available (v{update.latestVersion})</Text>
          <Text style={styles.subtitle}>
            You are on v{update.currentVersion}. {update.releaseName}
          </Text>

          <Text style={styles.notesLabel}>Release notes</Text>
          <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.notes}>{update.releaseNotes}</Text>
          </ScrollView>

          {progressNote ? <Text style={styles.progress}>{progressNote}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (!update.apkDownloadUrl || installing) && styles.primaryBtnDisabled]}
            onPress={handleUpdateNow}
            disabled={!update.apkDownloadUrl || installing}
            activeOpacity={0.85}
          >
            {installing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {Platform.OS === 'android' ? 'Download Update' : 'Open Download'}
              </Text>
            )}
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
    padding: 22,
  },
  card: {
    backgroundColor: '#121214',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    maxHeight: '82%',
  },
  eyebrow: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  notesLabel: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  notesScroll: {
    maxHeight: 180,
    marginBottom: 14,
  },
  notes: {
    color: '#d4d4d8',
    fontSize: 13,
    lineHeight: 19,
  },
  progress: {
    color: '#93c5fd',
    fontSize: 12,
    marginBottom: 10,
  },
  error: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '500',
  },
});
