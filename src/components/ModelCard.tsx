import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ModelMetadata, ModelDownloadState } from '../types/model';
import { DownloadIcon, CheckIcon, TrashIcon, PauseIcon, PlayIcon, AlertIcon } from './Icons';

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

  const downloadedLabel = formatBytes(downloadState.downloadedBytes);
  const totalLabel = formatBytes(downloadState.totalBytes || model.sizeBytes);
  const speedLabel =
    downloadState.speedBytesPerSec > 0
      ? `${(downloadState.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
      : null;

  return (
    <View style={[styles.card, isActive && styles.activeCard]}>
      {/* Dense model header */}
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={styles.modelName} numberOfLines={1}>
            {model.name}
          </Text>
          <View style={styles.modelOriginRow}>
            <Text style={styles.originText}>
              {model.source === 'online' || model.id.includes('ollama')
                ? 'Ollama'
                : model.source === 'cloud' || model.id.includes('gemini')
                  ? 'Google Gemini'
                  : model.source === 'offline' || model.provider === 'device'
                    ? 'On-device'
                    : 'Cloud'}
            </Text>
          </View>
        </View>
        <Text style={styles.contextText}>{contextLabel}</Text>
      </View>

      <View style={styles.modelFactsRow}>
        <Text style={styles.modelFact}>{model.parameters || '1B'} parameters</Text>
        {ramLabel ? <Text style={styles.modelFact}>{ramLabel}</Text> : null}
        {capabilitySummary ? <Text style={styles.modelFact}>{capabilitySummary}</Text> : null}
      </View>
      <Text style={styles.description} numberOfLines={2}>{model.description}</Text>

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
            <TouchableOpacity
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
            </TouchableOpacity>
          </CircularProgress>

          <View style={styles.progressTextCol}>
            <Text style={styles.progressTitle}>
              {downloadState.progress}% complete
            </Text>
            <Text style={styles.progressDetail}>
              {downloadedLabel} of {totalLabel}
              {speedLabel ? ` · ${speedLabel}` : ''}
            </Text>
          </View>
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
      <View style={styles.bottomRow}>
        <View style={styles.bottomSizeRow}>
          <Text style={styles.bottomSizeText}>{model.quantization || 'Q4_K_M'} · {model.sizeFormatted}</Text>
        </View>

        <View style={styles.actionsGroup}>
          {isDownloaded ? (
            <>
              {isActive ? (
                <View style={styles.activePill}>
                  <CheckIcon size={12} color="#22c55e" />
                  <Text style={styles.activePillText}>ACTIVE</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.loadBtn}
                  onPress={() => onSelect(model)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loadBtnText}>Load</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDelete(model.id)}
                activeOpacity={0.7}
              >
                <TrashIcon size={15} color="#ef4444" />
              </TouchableOpacity>
            </>
          ) : isDownloading || isPaused ? (
            <TouchableOpacity
              style={styles.cancelLink}
              onPress={() => (onCancel ? onCancel(model.id) : onDelete(model.id))}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          ) : isError ? (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => (onResume ? onResume(model.id) : onDownload(model))}
              activeOpacity={0.8}
            >
              <DownloadIcon size={14} color="#111113" />
              <Text style={styles.retryBtnText}>Retry download</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onDownload(model)}
              activeOpacity={0.8}
            >
              <DownloadIcon size={14} color="#111113" />
              <Text style={styles.downloadBtnText}>Download Model</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#101113',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
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
    marginRight: 8,
  },
  modelName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  modelOriginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  originText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  contextText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  modelFactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 5,
  },
  modelFact: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10,
  },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  bottomSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  bottomSizeText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  downloadBtnText: {
    color: '#111113',
    fontSize: 12.5,
    fontWeight: '700',
  },
  retryBtn: {
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
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cancelLinkText: {
    color: '#a1a1aa',
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
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  activePillText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
