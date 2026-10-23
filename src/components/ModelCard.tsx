import { BrownButton as TouchableOpacity } from './ButtonSurface';
import React, { useState } from 'react';
import { View, Text, StyleSheet, } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ModelMetadata, ModelDownloadState } from '../types/model';
import { DownloadIcon, CheckIcon, TrashIcon, PauseIcon, PlayIcon, AlertIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

interface ModelCardProps {
  model: ModelMetadata;
  downloadState: ModelDownloadState;
  isActive: boolean;
  onSelect: (model: ModelMetadata) => void;
  onDownload: (model: ModelMetadata) => void;
  onDelete: (modelId: string) => void;
  onPause?: (modelId: string) => void;
  onResume?: (modelId: string) => void;
  onCancel?: (modelId: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

const CircularProgress: React.FC<{
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}> = ({ progress, size, strokeWidth, color, trackColor, children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, position: 'absolute' }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </View>
      {children}
    </View>
  );
};

function getSupportedFeatures(model: ModelMetadata): string[] {
  const caps = (model.capabilities || {}) as any;
  const features: string[] = [];

  if (/r1|reason|think|deepseek/i.test(model.name) || /reason|think/i.test(model.id)) {
    features.push('🧠 Thinking & Reasoning');
  }

  if (caps.vision || /vision|vl|image|llava/i.test(model.name) || /vision|vl/i.test(model.id)) {
    features.push('👁️ Vision & Images');
  }

  if (caps.code || model.tags.some((t) => /code/i.test(t)) || /coder|qwen/i.test(model.name)) {
    features.push('💻 Code');
  }

  if (caps.chat !== false) {
    features.push('💬 Chat');
  }

  if (caps.multilingual || model.tags.some((t) => /multi/i.test(t)) || /qwen|llama/i.test(model.name)) {
    features.push('🌐 Multilingual');
  }

  return features.slice(0, 4);
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  downloadState,
  isActive,
  onSelect,
  onDownload,
  onDelete,
  onPause,
  onResume,
  onCancel,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isDownloaded = downloadState.status === 'downloaded';
  const isDownloading = downloadState.status === 'downloading';
  const isPaused = downloadState.status === 'paused';
  const isError = downloadState.status === 'error';
  const features = getSupportedFeatures(model);
  const capabilitySummary = features
    .map((feature) => feature.replace(/^\S+\s+/, ''))
    .slice(0, 2)
    .join(' · ');
  const contextLabel = `${Math.max(1, Math.round((model.contextLength || 4096) / 1024))}K context`;
  const ramLabel = model.recommendedRamMb ? `${(model.recommendedRamMb / 1024).toFixed(model.recommendedRamMb % 1024 === 0 ? 0 : 1)} GB RAM` : null;
  const displayName = model.name.replace(/\bQ\d+(?:[_ -][A-Z0-9]+)*\b/gi, '').replace(/\bGGUF\b/gi, '').replace(/\s+/g, ' ').trim() || model.name;
  const description = /^GGUF from Hugging Face/i.test(model.description)
    ? 'Chat offline on your phone. No API key needed.'
    : model.description;

  const downloadedLabel = formatBytes(downloadState.downloadedBytes);
  // The card prints model.sizeFormatted (decimal MB), so the pre-download total has to use the
  // same string — the binary formatter turned "398 MB" into "380 MB" for one frame.
  const totalLabel = downloadState.totalBytes
    ? formatBytes(downloadState.totalBytes)
    : model.sizeFormatted || formatBytes(model.sizeBytes);
  const speedLabel =
    downloadState.speedBytesPerSec > 0
      ? `${(downloadState.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
      : null;

  return (
    <View style={[styles.card, isActive && styles.activeCard]}>
      {/* Dense model header */}
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={styles.modelName} numberOfLines={2}>
            {displayName}
          </Text>
          <View style={styles.modelOriginRow}>
            <Text style={styles.originText}>
              {model.source === 'online' || model.id.includes('ollama')
                ? 'Ollama'
                : model.source === 'cloud' || model.id.includes('gemini')
                  ? 'Google Gemini'
                  : model.source === 'offline' || model.provider === 'device'
                    ? 'Runs on your phone'
                    : 'Cloud'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.modelFactsRow}>
        <View style={styles.factCell}><Text style={styles.factLabel}>Download size</Text><Text style={styles.modelFact}>{model.sizeFormatted || formatBytes(model.sizeBytes)}</Text></View>
        {ramLabel ? <View style={styles.factCell}><Text style={styles.factLabel}>Memory needed</Text><Text style={styles.modelFact}>{ramLabel}</Text></View> : null}
      </View>
      <Text style={styles.description} numberOfLines={2}>{description}</Text>
      <TouchableOpacity style={styles.detailsToggle} onPress={() => setDetailsOpen(!detailsOpen)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${detailsOpen ? 'Hide' : 'Show'} model details for ${displayName}`} accessibilityState={{ expanded: detailsOpen }}>
        <Text style={styles.detailsToggleText}>{detailsOpen ? 'Less details' : 'More details'}</Text>
        {detailsOpen ? <ChevronUpIcon size={16} color="#ffffff" /> : <ChevronDownIcon size={16} color="#ffffff" />}
      </TouchableOpacity>
      {detailsOpen && <View style={styles.detailsPanel}>
        <Text selectable style={styles.detailText}>{model.name}</Text>
        <Text style={styles.detailText}>{[model.parameters ? `${model.parameters} parameters` : null, contextLabel, model.quantization, capabilitySummary].filter(Boolean).join(' · ')}</Text>
        {!!model.filename && <Text selectable style={styles.detailText}>{model.filename}</Text>}
      </View>}

      {/* Download progress: circular ring around the action icon */}
      {(isDownloading || isPaused) && (
        <View style={styles.progressContainer}>
          <CircularProgress
            progress={downloadState.progress}
            size={40}
            strokeWidth={3.5}
            color={isPaused ? '#a1a1aa' : '#3b82f6'}
            trackColor="rgba(255, 255, 255, 0.1)"
          >
            {isPaused || onPause ? <TouchableOpacity brownSurface
              onPress={() => (isPaused ? onResume?.(model.id) : onPause?.(model.id))}
              activeOpacity={0.7}
              accessibilityLabel={isPaused ? 'Resume download' : 'Pause download'}
              style={styles.ringTapArea}
            >
              {isPaused ? (
                <PlayIcon size={13} color="#ffffff" />
              ) : (
                <PauseIcon size={13} color="#ffffff" />
              )}
            </TouchableOpacity> : <DownloadIcon size={13} color="#ffffff" />}
          </CircularProgress>

          <View style={styles.progressTextCol}>
            <Text style={styles.progressTitle}>
              {downloadState.progress}% complete
            </Text>
            <Text style={styles.progressDetail}>
              {downloadedLabel} of {totalLabel}
              {speedLabel ? ` · ${speedLabel}` : ''}
            </Text>
            {!!downloadState.waitingMessage && <Text style={styles.progressDetail}>{downloadState.waitingMessage}</Text>}
            {isPaused && !!downloadState.error && <Text style={styles.progressDetail}>{downloadState.error}</Text>}
          </View>
          <TouchableOpacity brownSurface
            style={styles.cancelLink}
            onPress={() => (onCancel ? onCancel(model.id) : onDelete(model.id))}
            activeOpacity={0.7}
            accessibilityLabel={`Cancel download of ${displayName}`}
          >
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {isError && (
        <View style={styles.errorContainer}>
          <AlertIcon size={13} color="#f87171" />
          <Text style={styles.errorText} numberOfLines={3}>
            {downloadState.error || 'Download failed.'}
          </Text>
        </View>
      )}

      {/* Compact metadata and actions */}
      {!(isDownloading || isPaused) && <View style={styles.bottomRow}>

        <View style={styles.actionsGroup}>
          {isDownloaded ? (
            <>
              {isActive ? (
                <View style={styles.activePill}>
                  <CheckIcon size={12} color="#ffffff" />
                  <Text style={styles.activePillText}>ACTIVE</Text>
                </View>
              ) : (
                <TouchableOpacity brownSurface
                  style={styles.loadBtn}
                  onPress={() => onSelect(model)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loadBtnText}>Load</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity brownSurface
                style={styles.deleteBtn}
                onPress={() => onDelete(model.id)}
                activeOpacity={0.7}
              >
                <TrashIcon size={15} color="#ef4444" />
              </TouchableOpacity>
            </>
          ) : isError ? (
            <TouchableOpacity brownSurface="light"
              style={styles.retryBtn}
              onPress={() => (onResume ? onResume(model.id) : onDownload(model))}
              activeOpacity={0.8}
            >
              <DownloadIcon size={16} color="#ffffff" />
              <Text style={styles.retryBtnText}>Retry download</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity brownSurface="light"
              style={styles.downloadBtn}
              onPress={() => onDownload(model)}
              activeOpacity={0.8}
            >
              <DownloadIcon size={16} color="#ffffff" />
              <Text style={styles.downloadBtnText}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#101113',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  activeCard: {
    borderColor: 'rgba(96, 165, 250, 0.7)',
    backgroundColor: '#14161a',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleArea: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  modelName: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  modelOriginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  originText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
  },
  contextText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  modelFactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 12,
  },
  factCell: { flexGrow: 1, flexBasis: 120, gap: 3 },
  factLabel: { color: '#ffffff', fontSize: 11, lineHeight: 16, fontWeight: '400' },
  modelFact: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  description: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 21,
    marginBottom: 12,
  },
  detailsToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, alignSelf: 'stretch', paddingHorizontal: 14, borderWidth: 1, borderColor: '#535359', borderRadius: 9999, marginBottom: 4 },
  detailsToggleText: { color: '#ffffff', fontSize: 13, lineHeight: 19, fontWeight: '500' },
  detailsPanel: { gap: 10, padding: 14, borderRadius: 10, backgroundColor: '#1d1d20', marginTop: 8, marginBottom: 10 },
  detailText: { color: '#ffffff', fontSize: 12, lineHeight: 20 },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
    marginBottom: 10,
  },
  ringTapArea: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTextCol: {
    flex: 1,
    minWidth: 0,
  },
  progressTitle: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  progressDetail: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 10,
    paddingTop: 8,
  },
  bottomSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bottomSizeText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  actionsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  downloadBtn: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  downloadBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  retryBtn: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  retryBtnText: {
    color: '#111113',
    fontSize: 12.5,
    fontWeight: '700',
  },
  cancelLink: {
    borderRadius: 9999,
    minHeight: 44,
    flexShrink: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cancelLinkText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  loadBtnText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 7,
    borderRadius: 9999,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15803d',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#15803d',
  },
  activePillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
