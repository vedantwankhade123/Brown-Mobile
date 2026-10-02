import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  Alert,
  Animated,
  Modal,
  PanResponder,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { confirmFolderSelection } from '../utils/storageFolderPicker';
import * as FileSystem from 'expo-file-system';
import { ModelCard } from '../components/ModelCard';
import {
  MOBILE_GGUF_LIBRARY,
  filterMobileSafeModels,
  groupMobileModelsByTier,
  sizeBucketOf,
  SIZE_BUCKET_ORDER,
  SIZE_BUCKET_COPY,
  ModelSizeBucket,
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
import { HuggingFaceLogo } from '../components/HuggingFaceLogo';
import { headerButtonStyle, GlassControl, GlassSurface, useStickyHeader } from '../components/ScreenHeader';
import { SearchIcon, BackArrowIcon, ChevronRightIcon, CloseIcon, DatabaseIcon } from '../components/Icons';

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

const SHEET_CLOSE_DRAG_PX = 120;

const treeUriToNativePath = (uri: string): string | null => {
  const prefix = 'content://com.android.externalstorage.documents/tree/';
  if (!uri.startsWith(prefix)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri.slice(prefix.length).split('?')[0]);
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  const volume = decoded.slice(0, colon);
  const subPath = decoded.slice(colon + 1);
  const base = volume === 'primary' ? '/storage/emulated/0' : `/storage/${volume}`;
  return subPath ? `${base}/${subPath}` : base;
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hfStatus, setHfStatus] = useState('Search Hugging Face for more GGUFs.');
  const [hfLoading, setHfLoading] = useState(false);
  const [hfNextUrl, setHfNextUrl] = useState<string | null>(null);
  const [hfSkip, setHfSkip] = useState(0);
  const [lastQuery, setLastQuery] = useState('instruct gguf');
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [customDir, setCustomDir] = useState('');
  const [defaultDir, setDefaultDir] = useState('/BrownAI/models/');
  const [useCustomDir, setUseCustomDir] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<'all' | ModelSizeBucket>('all');

  const downloader = ModelDownloader.getInstance();
  const engine = LlamaEngine.getInstance();
  const searchGen = useRef(0);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const { onScroll: storeScroll, scrolled: storeScrolled } = useStickyHeader();

  const closeLocationSheet = () => {
    sheetTranslateY.setValue(0);
    setLocationSheetOpen(false);
  };

  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_: any, g: any) => g.dy > 0,
      onPanResponderMove: (_: any, g: any) => {
        sheetTranslateY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_: any, g: any) => {
        if (g.dy > SHEET_CLOSE_DRAG_PX || g.vy > 0.9) {
          sheetTranslateY.setValue(0);
          setLocationSheetOpen(false);
          return;
        }
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

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
      setCatalog(filterMobileSafeModels(MOBILE_GGUF_LIBRARY, stats.totalRamMb));
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
      const ok = await engine.loadModel(model);
      if (!ok) {
        Alert.alert(
          'Load Failed',
          engine.getLastNativeError?.() ||
            'Could not load this GGUF. Rebuild the app with llama.rn linked, or pick a Cloud model.'
        );
        return;
      }
      setActiveModel(model);
      onModelActivated(model);
      Alert.alert('Model Activated', `${model.name} is ready to chat.`);
    } catch (err: any) {
      Alert.alert('Load Failed', err?.message || 'Unable to load model.');
    }
  };

  const handleDownload = (model: ModelMetadata) => {
    downloader.startDownload(model);
  };

  const openLocationSheet = async () => {
    const modelsDir = await StoragePaths.getModelsDir();
    const isDefault = await StoragePaths.isDefaultModelsDir();
    setCustomDir(StoragePaths.displayPath(modelsDir));
    setUseCustomDir(!isDefault);
    sheetTranslateY.setValue(0);
    setLocationSheetOpen(true);
  };

  const handlePickCustomFolder = async () => {
    try {
      const picked = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!picked.granted) return;
      const nativePath = treeUriToNativePath(picked.directoryUri);
      if (!nativePath) {
        Alert.alert(
          'Unsupported location',
          'Choose a folder on this device or its SD card.'
        );
        return;
      }
      if (!await confirmFolderSelection(nativePath)) return;
      setCustomDir(nativePath);
      setUseCustomDir(true);
      } catch (error: any) {
      Alert.alert('Folder picker unavailable', error?.message || 'Could not open the system folder picker. Please try again.');
    }
  };

  const saveLocation = async () => {
    const trimmed = customDir.trim();
    if (useCustomDir && !trimmed) {
      Alert.alert('Choose a folder', 'Select a custom folder before saving.');
      return;
    }
    try {
      if (useCustomDir) {
        await StoragePaths.setModelsDir(trimmed.endsWith('/') ? trimmed : trimmed + '/');
      } else {
        await StoragePaths.resetModelsDir();
      }
      setLocationSheetOpen(false);
    } catch (error: any) {
      Alert.alert('Could not save location', error?.message || 'Check that this folder is writable.');
    }
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

  const matchesSize = (m: ModelMetadata) => sizeFilter === 'all' || sizeBucketOf(m) === sizeFilter;
  const grouped = groupMobileModelsByTier(catalog.filter(matchesSize));
  const hfVisible = hfModels.filter(
    (m) => matchesSize(m) && !catalog.some((c) => c.id === m.id || c.filename === m.filename)
  );
  const tiersShown = (['Ultra-Light', 'Standard', 'Flagship'] as MobileRamTier[]).filter(
    (tier) => grouped[tier].length > 0
  );
  const freeLabel = deviceStats ? StorageBudgetService.formatBytes(deviceStats.freeStorageBytes) : '—';

  return (
    <SafeAreaView style={styles.container}>
      {/* Dynamic Header: Standard vs Full-Width Search */}
      {!isSearchOpen ? (
        <View style={[styles.headerBar, storeScrolled && styles.headerBarScrolled]}>
          <GlassControl radius={22} active={true}
            onPress={onBack}
            style={styles.headerBackBtn}
            activeOpacity={0.7}
            accessibilityLabel="Go back"
          >
            <BackArrowIcon size={24} color="#ffffff" strokeWidth={2.2} />
          </GlassControl>

          <Text pointerEvents="none" style={styles.headerTitle} numberOfLines={1}>
            Model Store
          </Text>

          <View style={{ flex: 1 }} />

          <GlassControl radius={22} active={true}
            onPress={() => setIsSearchOpen(true)}
            style={styles.headerSearchIconBtn}
            activeOpacity={0.7}
            accessibilityLabel="Search Hugging Face models"
          >
            <SearchIcon size={20} color="#ffffff" />
          </GlassControl>
        </View>
      ) : (
        <View style={[styles.headerBar, styles.headerBarSearchActive, storeScrolled && styles.headerBarScrolled]}>
          <GlassSurface radius={9999} active={true} style={styles.searchBarInner}>
            <SearchIcon size={17} color="#9ca3af" />
            <TextInput
              autoFocus
              style={[styles.headerSearchInput, Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {}]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search Hugging Face GGUFs..."
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => runHuggingFaceSearch(searchQuery, false)}
            />
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => runHuggingFaceSearch(searchQuery, false)}
                style={styles.headerSubmitBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.headerSubmitBtnText}>Search</Text>
              </TouchableOpacity>
            )}
          </GlassSurface>
          <GlassControl radius={22} active={true}
            onPress={() => {
              setIsSearchOpen(false);
              setSearchQuery('');
            }}
            style={styles.headerSearchCloseBtn}
            activeOpacity={0.7}
            accessibilityLabel="Close search"
          >
            <CloseIcon size={20} color="#ffffff" />
          </GlassControl>
        </View>
      )}

      <ScrollView
        keyboardShouldPersistTaps="handled" style={styles.scrollArea}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        onScroll={storeScroll}
        scrollEventThrottle={16}
      >
        {/* Download location + free storage */}
        <TouchableOpacity style={styles.locationRow} onPress={openLocationSheet} activeOpacity={0.7}>
          <View style={styles.locationIconBox}>
            <DatabaseIcon size={16} color="#60a5fa" />
          </View>
          <View style={styles.locationTextCol}>
            <Text style={styles.locationTitle}>Download location</Text>
            <Text style={styles.locationPath} numberOfLines={1}>
              {defaultDir} · {freeLabel} free
            </Text>
          </View>
          <ChevronRightIcon size={16} color="#8e8e93" />
        </TouchableOpacity>

        {/* Filter by GGUF download size */}
        <View style={styles.filterBlock}>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterPill, sizeFilter === 'all' && styles.filterPillOn]}
              onPress={() => setSizeFilter('all')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: sizeFilter === 'all' }}
            >
              <Text style={[styles.filterPillText, sizeFilter === 'all' && styles.filterPillTextOn]}>
                All sizes
              </Text>
            </TouchableOpacity>
            {SIZE_BUCKET_ORDER.map((bucket) => (
              <TouchableOpacity
                key={bucket}
                style={[styles.filterPill, sizeFilter === bucket && styles.filterPillOn]}
                onPress={() => setSizeFilter(bucket)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: sizeFilter === bucket }}
              >
                <Text style={[styles.filterPillText, sizeFilter === bucket && styles.filterPillTextOn]}>
                  {SIZE_BUCKET_COPY[bucket].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {sizeFilter !== 'all' ? (
            <Text style={styles.filterHint}>{SIZE_BUCKET_COPY[sizeFilter].range} on disk</Text>
          ) : null}
        </View>

        {hfVisible.length > 0 || hfLoading ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionTitleRow}>
              <HuggingFaceLogo size={24} />
              <Text style={styles.sectionTitle}>
                {searchQuery.trim() ? `Results for “${searchQuery}”` : 'Hugging Face Models'}
              </Text>
            </View>

            {hfLoading && hfVisible.length === 0 ? (
              <ActivityIndicator color="#ffffff" style={{ marginVertical: 18 }} />
            ) : null}

            {hfVisible.map((model) => (
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
                  onCancel={(id) => downloader.cancelDownload(id)}
                />
              ))}

            {(hfNextUrl || hfVisible.length > 0) && (
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
          </View>
        ) : null}

        {/* Built-in Models by Tier */}
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
                  onCancel={(id) => downloader.cancelDownload(id)}
                />
              ))}
            </View>
          );
        })}

        {!hfLoading && hfVisible.length === 0 && tiersShown.length === 0 ? (
          <Text style={styles.filterEmpty}>
            {sizeFilter === 'all'
              ? 'Nothing is available to install on this device right now.'
              : `No ${SIZE_BUCKET_COPY[sizeFilter].label.toLowerCase()} models here. Try another size, or search Hugging Face.`}
          </Text>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Download Location Sheet Modal */}
      <Modal visible={locationSheetOpen} transparent animationType="slide" onRequestClose={closeLocationSheet}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeLocationSheet} accessibilityLabel="Close download location" />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
            <View style={styles.sheetGrabberRow} {...sheetPanResponder.panHandlers}>
              <View style={styles.sheetGrabber} />
            </View>
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.sheetTitleFlex]} numberOfLines={1}>Download location</Text>
              <TouchableOpacity
                onPress={closeLocationSheet}
                style={styles.sheetCloseBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close"
              >
                <CloseIcon size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtitle}>
              Models are saved here on your device. You have {freeLabel} free.
            </Text>
            <Text style={styles.sheetLabel}>Save location</Text>
            <TouchableOpacity
              style={[styles.pathOption, !useCustomDir && styles.pathOptionOn]}
              onPress={() => setUseCustomDir(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.pathOptionTitle}>Default (recommended)</Text>
              <Text style={styles.pathOptionPath}>{defaultDir}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pathOption, useCustomDir && styles.pathOptionOn]}
              onPress={handlePickCustomFolder}
              activeOpacity={0.8}
            >
              <Text style={styles.pathOptionTitle}>Custom folder / SD card</Text>
              <Text style={styles.pathOptionPath}>
                {useCustomDir && customDir ? customDir : 'Tap to choose a folder with the system picker'}
              </Text>
              <Text style={styles.chooseFolderLabel}>
                {useCustomDir ? 'Change folder' : 'Choose folder'}
              </Text>
            </TouchableOpacity>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancel} onPress={closeLocationSheet}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetConfirm} onPress={saveLocation}>
                <Text style={styles.sheetConfirmText}>Save location</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 14,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    minHeight: 56,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  headerBarScrolled: {
    backgroundColor: 'transparent',
  },
  headerBarSearchActive: {
    paddingLeft: 14,
    paddingRight: 10,
    gap: 10,
  },
  searchBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    paddingHorizontal: 14,
    height: 42,
    gap: 8,
  },
  headerSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  headerSubmitBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerSubmitBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  headerSearchCloseBtn: { ...headerButtonStyle },
  headerBackBtn: { ...headerButtonStyle },
  headerTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
    position: 'absolute',
    left: 60,
    right: 60,
    textAlign: 'center',
  },
  headerSearchIconBtn: { ...headerButtonStyle },
  scrollArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 10,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  filterBlock: {
    marginBottom: 18,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  filterPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillOn: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  filterPillText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextOn: {
    color: '#000000',
    fontWeight: '700',
  },
  filterHint: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
  },
  filterEmpty: {
    marginTop: 20,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#212121',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  locationIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTextCol: {
    flex: 1,
    minWidth: 0,
  },
  locationTitle: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  locationPath: {
    color: '#a1a1aa',
    fontSize: 11.5,
    marginTop: 2,
  },
  loadMoreBtn: {
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  loadMoreText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionBlock: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: '#a1a1aa',
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.md,
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetGrabberRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  sheetGrabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  sheetTitleFlex: {
    flex: 1,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetSubtitle: {
    color: '#a1a1aa',
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
    color: '#71717a',
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
    color: '#a1a1aa',
    fontSize: 11,
    marginTop: 4,
  },
  chooseFolderLabel: {
    color: '#60a5fa',
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 8,
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
