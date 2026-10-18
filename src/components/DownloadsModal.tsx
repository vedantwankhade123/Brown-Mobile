import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedModal } from './AnimatedModal';
import { BrownButton } from './ButtonSurface';
import { CloseIcon } from './Icons';
import { getSetupDownloads, subscribeSetupDownloads, resumeOnboardingVoiceSetup, SetupDownloadItem } from '../services/onboarding/OnboardingSetup';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { getModelById } from '../services/modelManager/ModelCatalog';
import { ModelDownloadState } from '../types/model';

export function DownloadsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [setup, setSetup] = useState(getSetupDownloads);
  const [models, setModels] = useState<ModelDownloadState[]>([]);
  useEffect(() => subscribeSetupDownloads(setSetup), []);
  useEffect(() => ModelDownloader.getInstance().subscribe(setModels), []);
  const items: SetupDownloadItem[] = [...setup, ...models.map(model => ({
    id: `model:${model.modelId}`, name: getModelById(model.modelId)?.name || model.modelId,
    status: model.status, percent: model.progress, error: model.error,
  }))];
  return <AnimatedModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close downloads" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]} accessibilityViewIsModal>
        <View style={styles.header}><Text style={styles.title}>Downloads</Text><BrownButton brownSurface style={styles.close} onPress={onClose} accessibilityLabel="Close downloads"><CloseIcon size={20} color="#ffffff" /></BrownButton></View>
        <ScrollView contentContainerStyle={styles.list}>
          {!items.length && <Text style={styles.detail}>No downloads yet.</Text>}
          {items.map(item => <View style={styles.item} key={item.id}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.detail}>{item.status}{item.status === 'Downloading' ? ` · ${Math.round(item.percent)}%` : ''}</Text>
            {!!item.error && <Text style={styles.error}>{item.error}</Text>}
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, item.percent))}%` }]} /></View>
            {item.status === 'Paused' && <BrownButton brownSurface style={styles.retry} onPress={() => { resumeOnboardingVoiceSetup().catch(() => {}); }} accessibilityLabel={`Retry ${item.name}`}><Text style={styles.name}>Retry</Text></BrownButton>}
          </View>)}
        </ScrollView>
      </View>
    </View>
  </AnimatedModal>;
}
const styles = StyleSheet.create({
 overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
 sheet: { backgroundColor: '#111111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '80%', minHeight: 200 },
 header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
 title: { color: '#ffffff', fontSize: 22, fontWeight: '600' }, close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
 list: { paddingBottom: 12, gap: 12 }, item: { backgroundColor: '#242424', borderRadius: 18, padding: 16, gap: 6 },
 name: { color: '#ffffff', fontSize: 15, fontWeight: '500' }, detail: { color: '#dddddd', fontSize: 13 }, error: { color: '#fca5a5', fontSize: 12 },
 track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#555555', marginTop: 4 }, fill: { height: '100%', backgroundColor: '#ffffff' },
 retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginTop: 4 },
});
