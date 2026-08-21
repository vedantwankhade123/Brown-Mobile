import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { ModelCard } from '../components/ModelCard';
import {
  MOBILE_GGUF_LIBRARY,
  filterMobileSafeModels,
  groupMobileModelsByTier,
} from '../services/modelManager/ModelCatalog';
import {
  searchHuggingFaceGgufs,
  hydrateDiscoveredModels,
  HF_PAGE_SIZE,
} from '../services/modelManager/HuggingFaceRegistry';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { StorageBudgetService, DeviceStorageStats } from '../services/modelManager/StorageBudget';
import { StoragePaths } from '../services/storage/StoragePaths';
import { LlamaEngine } from '../services/inference/LlamaEngine';
import { ModelMetadata, ModelDownloadState, MobileRamTier } from '../types/model';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import { ScreenHeader } from '../components/ScreenHeader';
import { HuggingFaceLogo } from '../components/HuggingFaceLogo';
import { SearchIcon } from '../components/Icons';

interface ModelStoreScreenProps {
  onBack: () => void;
  onModelActivated: (model: ModelMetadata) => void;
}

const TIER_COPY: Record<MobileRamTier, { title: string; subtitle: string }> = {
  'Ultra-Light': {
    title: 'Ultra-light',
    subtitle: 'Best for phones under 4 GB RAM',
  },
  Standard: {
    title: 'Standard',
    subtitle: 'Balanced quality for 4–6 GB RAM',
  },
  Flagship: {
    title: 'Flagship',
    subtitle: 'Higher quality on 8 GB+ phones',
  },
};

export const ModelStoreScreen: React.FC<ModelStoreScreenProps> = ({
  onBack,
  onModelActivated,
}) => {
  const [downloadStates, setDownloadStates] = useState<ModelDownloadState[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStorageStats | null>(null);
  const [activeModel, setActiveModel] = useState<ModelMetadata | null>(null);
  const [catalog, setCatalog] = useState<ModelMetadata[]>(MOBILE_GGUF_LIBRARY);
  const [hfModels, setHfModels] = useState<ModelMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hfStatus, setHfStatus] = useState('Search Hugging Face for more GGUFs.');
  const [hfLoading, setHfLoading] = useState(false);
  const [hfNextUrl, setHfNextUrl] = useState<string | null>(null);
  const [hfSkip, setHfSkip] = useState(0);
  const [lastQuery, setLastQuery] = useState('instruct gguf');
  const [pendingModel, setPendingModel] = useState<ModelMetadata | null>(null);
  const [customDir, setCustomDir] = useState('');
  const [defaultDir, setDefaultDir] = useState('/UltronAI/models/');
  const [useCustomDir, setUseCustomDir] = useState(false);
  const [liveStatus, setLiveStatus] = useState('Loading mobile-safe library…');

  const downloader = ModelDownloader.getInstance();
  const engine = LlamaEngine.getInstance();
  const searchGen = useRef(0);

  const mergeUnique = (existing: ModelMetadata[], incoming: ModelMetadata[]) => {
    const seen = new Set(existing.map((m) => m.id));
    const next = [...existing];
    for (const item of incoming) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      next.push(item);
    }
    return next;
  };

  const runHuggingFaceSearch = async (
    query: string,
    append: boolean,
    nextUrl: string | null = null,
    skip = 0
  ) => {
    const q = query.trim() || 'instruct gguf';
    const gen = ++searchGen.current;
    setHfLoading(true);
    setHfStatus(append ? 'Loading more models…' : `Searching Hugging Face for “${q}”…`);
    try {
      const page = await searchHuggingFaceGgufs({
        query: q,
        nextUrl: append ? nextUrl : null,
        skip: append ? skip : 0,
        limit: HF_PAGE_SIZE,
      });
      if (gen !== searchGen.current) return;
      const ram = deviceStats?.totalRamMb || 6144;
      const safe = filterMobileSafeModels(page.models, ram);
      setHfModels((prev) => (append ? mergeUnique(prev, safe) : safe));
      setHfNextUrl(page.nextUrl);
      setHfSkip((append ? skip : 0) + HF_PAGE_SIZE);
      setLastQuery(q);
      setHfStatus(
        safe.length || (append && hfModels.length)
          ? `Hugging Face results for “${q}”.`
          : `No mobile-safe GGUFs found for “${q}”.`
      );
    } catch (err: any) {
      if (gen !== searchGen.current) return;
      setHfStatus(err?.message || 'Could not reach Hugging Face.');
    } finally {
      if (gen === searchGen.current) setHfLoading(false);
    }
  };

  useEffect(() => {
    setActiveModel(engine.getActiveModel());
    const unsubscribe = downloader.subscribe((states: ModelDownloadState[]) => {
      setDownloadStates(states);
    });

    (async () => {
      const stats = await StorageBudgetService.getDeviceStorageStats();
      setDeviceStats(stats);
      await StoragePaths.ensureLayout();
      await hydrateDiscoveredModels();
      const modelsDir = await StoragePaths.getModelsDir();
      setDefaultDir(StoragePaths.displayPath(modelsDir));
      setCustomDir(StoragePaths.displayPath(modelsDir));
      setCatalog(filterMobileSafeModels(MOBILE_GGUF_LIBRARY, stats.totalRamMb));
      setLiveStatus(
        `Built-in catalog filtered for ${(stats.totalRamMb / 1024).toFixed(1)} GB RAM. Models ≥14B stay hidden.`
      );
      try {
        const page = await searchHuggingFaceGgufs({
          query: 'instruct gguf',
          skip: 0,
          limit: HF_PAGE_SIZE,
        });
        const safe = filterMobileSafeModels(page.models, stats.totalRamMb);
        setHfModels(safe);
        setHfNextUrl(page.nextUrl);
        setHfSkip(HF_PAGE_SIZE);
        setHfStatus(`Live Hugging Face GGUFs, ${HF_PAGE_SIZE} at a time.`);
      } catch {
        setHfStatus('Hugging Face is offline. You can still install the built-in models.');
      }
    })();

    return () => unsubscribe();
  }, []);

  const handleSelectModel = async (model: ModelMetadata) => {
    try {
      await engine.loadModel(model);
      setActiveModel(model);
      onModelActivated(model);
      Alert.alert('Model Activated', `${model.name} loaded into neural context.`);
    } catch (err: any) {
      Alert.alert('Load Failed', err?.message || 'Unable to load model.');
    }
  };

  const handleDownload = (model: ModelMetadata) => {
    setPendingModel(model);
  };

  const confirmDownload = async () => {
    if (!pendingModel) return;
    const dest = useCustomDir && customDir.trim()
      ? (customDir.endsWith('/') ? customDir : customDir + '/')
      : undefined;
    if (dest) {
      await StoragePaths.setModelsDir(dest);
    }
    downloader.startDownload(pendingModel, dest);
    setPendingModel(null);
  };

  const handleDelete = (modelId: string) => {
    Alert.alert('Delete Model', 'Remove this GGUF model from device storage?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => downloader.deleteModel(modelId),
      },
    ]);
  };

  const grouped = groupMobileModelsByTier(catalog);
  const ramGb = deviceStats ? (deviceStats.totalRamMb / 1024).toFixed(1) : '—';
  const freeLabel = deviceStats ? StorageBudgetService.formatBytes(deviceStats.freeStorageBytes) : '—';
  const notEnough = pendingModel
    ? (deviceStats?.freeStorageBytes || 0) < pendingModel.sizeBytes + 50 * 1024 * 1024
    : false;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Model Store" onBack={onBack} />

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.hardwareCard}>
          <Text style={styles.hardwareTitle}>Device Safe Mode</Text>
          <View style={styles.hardwareGrid}>
            <View style={styles.hardwareMetric}>
              <Text style={styles.metricLabel}>Total RAM</Text>
              <Text style={styles.metricValue}>{ramGb} GB</Text>
            </View>
            <View style={styles.hardwareMetric}>
              <Text style={styles.metricLabel}>Free Storage</Text>
              <Text style={styles.metricValue}>{freeLabel}</Text>
            </View>
            <View style={styles.hardwareMetric}>
              <Text style={styles.metricLabel}>CPU</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {deviceStats?.cpuArchitecture || 'arm64'}
              </Text>
            </View>
          </View>
          <Text style={styles.liveStatus}>{liveStatus}</Text>
        </View>

        <View style={styles.searchCard}>
          <View style={styles.searchTitleRow}>
            <HuggingFaceLogo size={28} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Search Hugging Face</Text>
              <Text style={styles.sectionSubtitle}>
                Find GGUF weights and install them {HF_PAGE_SIZE} at a time.
              </Text>
            </View>
          </View>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <SearchIcon size={16} color="#71717a" />
              <TextInput
                style={[styles.searchInput, Platform.OS === 'web' ? ({ outline: 'none' } as any) : {}]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="e.g. llama 3.2, qwen, phi, gemma"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => runHuggingFaceSearch(searchQuery, false)}
              />
            </View>
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => runHuggingFaceSearch(searchQuery, false)}
              activeOpacity={0.8}
              disabled={hfLoading}
            >
              <Text style={styles.searchBtnText}>{hfLoading ? '…' : 'Search'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hfStatus}>{hfStatus}</Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionEyebrow}>Recommended</Text>
          <Text style={styles.sectionTitle}>Built-in Models</Text>
          <Text style={styles.sectionSubtitle}>
            Curated GGUFs that fit this phone. Download any card to use it offline.
          </Text>
        </View>

        {(['Ultra-Light', 'Standard', 'Flagship'] as MobileRamTier[]).map((tier) => {
          const models = grouped[tier];
          if (!models.length) return null;
          return (
            <View key={tier} style={styles.tierBlock}>
              <View style={styles.tierHeader}>
                <Text style={styles.tierTitle}>{TIER_COPY[tier].title}</Text>
                <View style={styles.tierCountPill}>
                  <Text style={styles.tierCountText}>{models.length}</Text>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>{TIER_COPY[tier].subtitle}</Text>
              {models.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  downloadState={downloader.getState(model.id)}
                  isActive={activeModel?.id === model.id}
                  onSelect={handleSelectModel}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onPause={(id) => downloader.pauseDownload(id)}
                  onResume={(id) => downloader.resumeDownload(id)}
                />
              ))}
            </View>
          );
        })}

        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <HuggingFaceLogo size={22} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionEyebrow}>Live Catalog</Text>
              <Text style={styles.sectionTitle}>From Hugging Face</Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
            Results for “{lastQuery}”. Download a card to install it on this phone.
          </Text>
        </View>
        {hfLoading && hfModels.length === 0 ? (
          <ActivityIndicator color="#ffffff" style={{ marginVertical: 18 }} />
        ) : null}
        {hfModels
          .filter((m) => !catalog.some((c) => c.id === m.id || c.filename === m.filename))
          .map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              downloadState={downloader.getState(model.id)}
              isActive={activeModel?.id === model.id}
              onSelect={handleSelectModel}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onPause={(id) => downloader.pauseDownload(id)}
              onResume={(id) => downloader.resumeDownload(id)}
            />
          ))}
        {(hfNextUrl || hfModels.length > 0) && (
          <TouchableOpacity
            style={[styles.loadMoreBtn, hfLoading && { opacity: 0.6 }]}
            onPress={() => runHuggingFaceSearch(lastQuery, true, hfNextUrl, hfSkip)}
            activeOpacity={0.8}
            disabled={hfLoading || !hfNextUrl}
          >
            <Text style={styles.loadMoreText}>
              {hfLoading ? 'Loading…' : hfNextUrl ? `Load more models (${HF_PAGE_SIZE})` : 'No more results'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={!!pendingModel} transparent animationType="fade" onRequestClose={() => setPendingModel(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Download location</Text>
            <Text style={styles.sheetSubtitle}>
              {pendingModel?.name} needs {pendingModel?.sizeFormatted}. You have {freeLabel} free.
            </Text>
            {notEnough && (
              <Text style={styles.sheetWarn}>Not enough free storage for this GGUF.</Text>
            )}
            <Text style={styles.sheetLabel}>Save location</Text>
            <TouchableOpacity
              style={[styles.pathOption, !useCustomDir && styles.pathOptionOn]}
              onPress={() => setUseCustomDir(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.pathOptionTitle}>Default</Text>
              <Text style={styles.pathOptionPath}>{defaultDir}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pathOption, useCustomDir && styles.pathOptionOn]}
              onPress={() => setUseCustomDir(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.pathOptionTitle}>Custom folder / SD card</Text>
              <TextInput
                style={styles.pathInput}
                value={customDir}
                onChangeText={(v: string) => {
                  setCustomDir(v);
                  setUseCustomDir(true);
                }}
                placeholder="/storage/XXXX-XXXX/UltronAI/models/"
                placeholderTextColor={colors.textMuted}
              />
            </TouchableOpacity>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setPendingModel(null)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetConfirm, notEnough && { opacity: 0.4 }]}
                disabled={notEnough}
                onPress={confirmDownload}
              >
                <Text style={styles.sheetConfirmText}>Start download</Text>
              </TouchableOpacity>
            </View>
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
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  hardwareCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hardwareTitle: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  hardwareGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hardwareMetric: {
    flex: 1,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginBottom: 2,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '700',
  },
  liveStatus: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
  },
  searchCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111113',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 10,
  },
  searchBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  searchBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },
  hfStatus: {
    color: '#a1a1aa',
    fontSize: 11,
    marginTop: 10,
  },
  loadMoreBtn: {
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loadMoreText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionBlock: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionEyebrow: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
  tierBlock: {
    marginBottom: 8,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  tierTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  tierCountPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierCountText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 14,
  },
  sheetWarn: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 10,
  },
  sheetLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  pathOption: {
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pathOptionOn: {
    borderColor: '#ffffff',
  },
  pathOptionTitle: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  pathOptionPath: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  pathInput: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#111111',
    borderRadius: 8,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  sheetCancel: {
    flex: 1,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetCancelText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sheetConfirm: {
    flex: 1,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetConfirmText: {
    color: '#000000',
    fontWeight: '700',
  },
});
