import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ModelMetadata, ModelDownloadState } from '../types/model';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import { DownloadIcon, CheckIcon, TrashIcon, PauseIcon } from './Icons';
import { HuggingFaceLogo } from './HuggingFaceLogo';
import { StorageBudgetService } from '../services/modelManager/StorageBudget';

const OLLAMA_LOGO = require('../../Assets/ollama-logo.png');
const GEMINI_LOGO = require('../../Assets/gemini-logo.png');

interface ModelCardProps {
  model: ModelMetadata;
  downloadState: ModelDownloadState;
  isActive: boolean;
  onSelect: (model: ModelMetadata) => void;
  onDownload: (model: ModelMetadata) => void;
  onDelete: (modelId: string) => void;
  onPause?: (modelId: string) => void;
  onResume?: (modelId: string) => void;
}

function getSupportedFeatures(model: ModelMetadata): string[] {
  const caps = (model.capabilities || {}) as any;
  const features: string[] = [];

  // Check reasoning / thinking
  if (/r1|reason|think|deepseek/i.test(model.name) || /reason|think/i.test(model.id)) {
    features.push('🧠 Thinking & Reasoning');
  }

  // Check vision / image
  if (caps.vision || /vision|vl|image|llava/i.test(model.name) || /vision|vl/i.test(model.id)) {
    features.push('👁️ Vision & Images');
  }

  // Check code
  if (caps.code || model.tags.some((t) => /code/i.test(t)) || /coder|qwen/i.test(model.name)) {
    features.push('💻 Code');
  }

  // Check chat / assistant
  if (caps.chat !== false) {
    features.push('💬 Chat');
  }

  // Check multilingual
  if (caps.multilingual || model.tags.some((t) => /multi/i.test(t)) || /qwen|llama/i.test(model.name)) {
    features.push('🌐 Multilingual');
  }

  // Return top 3-4 distinct features
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
}) => {
  const isDownloaded = downloadState.status === 'downloaded';
  const isDownloading = downloadState.status === 'downloading';
  const isPaused = downloadState.status === 'paused';
  const ramMb = model.ramRequiredMb || model.recommendedRamMb;
  const features = getSupportedFeatures(model);

  return (
    <View style={[styles.card, isActive && styles.activeCard]}>
      {/* Top Header: Model Name & Clean Transparent Brand Logo */}
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={styles.modelName} numberOfLines={1}>
            {model.name}
          </Text>
        </View>

        {/* Clean Brand Logo Without Background */}
        <View style={styles.brandBadge}>
          {model.source === 'online' || model.id.includes('ollama') ? (
            <View style={styles.brandRow}>
              <Image source={OLLAMA_LOGO} style={{ width: 15, height: 15, tintColor: '#ffffff' }} resizeMode="contain" />
              <Text style={styles.brandText}>Ollama</Text>
            </View>
          ) : model.source === 'cloud' || model.id.includes('gemini') ? (
            <View style={styles.brandRow}>
              <Image source={GEMINI_LOGO} style={{ width: 15, height: 15 }} resizeMode="contain" />
              <Text style={styles.brandText}>Google Gemini</Text>
            </View>
          ) : (
            <View style={styles.brandRow}>
              <HuggingFaceLogo size={16} />
              <Text style={styles.brandText}>Hugging Face</Text>
            </View>
          )}
        </View>
      </View>

      {/* Weights & Parameters Info (Secondary Content in Blue Color) */}
      <View style={styles.specsContainer}>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Weights:</Text>
          <Text style={styles.specValue}>{model.sizeFormatted} ({model.quantization || 'Q4_K_M'})</Text>
        </View>

        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Parameters:</Text>
          <Text style={styles.specValue}>{model.parameters || '1.23B'}</Text>
        </View>

        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Requirements:</Text>
          <Text style={styles.specValue}>
            RAM ~{StorageBudgetService.formatBytes(ramMb * 1024 * 1024)} (Min {model.ramRequiredMb ? `${(model.ramRequiredMb / 1024).toFixed(1)} GB` : '2.0 GB'})
          </Text>
        </View>
      </View>

      {/* Supports / Capabilities Tags (Blue Badges) */}
      <View style={styles.featureTagsRow}>
        <Text style={styles.supportsHeading}>Supports:</Text>
        <View style={styles.tagsGroup}>
          {features.map((feat) => (
            <View key={feat} style={styles.featureBadge}>
              <Text style={styles.featureBadgeText}>{feat}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Download Progress Bar */}
      {(isDownloading || isPaused) && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${downloadState.progress}%` }]} />
          </View>
          <View style={styles.progressStats}>
            <Text style={styles.progressText}>{downloadState.progress}%</Text>
            <Text style={styles.progressSpeed}>
              {isPaused
                ? 'Paused'
                : downloadState.speedBytesPerSec > 0
                  ? `${(downloadState.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                  : 'Downloading GGUF...'}
            </Text>
          </View>
        </View>
      )}

      {/* Bottom Action Row: "Size: <size>" on Left + Compact Buttons on Right */}
      <View style={styles.bottomRow}>
        <View style={styles.bottomSizeRow}>
          <DownloadIcon size={14} color="#60a5fa" />
          <Text style={styles.bottomSizeText}>Size: {model.sizeFormatted}</Text>
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
          ) : isDownloading ? (
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={() => onPause?.(model.id)}
              activeOpacity={0.7}
            >
              <PauseIcon size={13} color="#ffffff" />
              <Text style={styles.pauseBtnText}>Pause</Text>
            </TouchableOpacity>
          ) : isPaused ? (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onResume?.(model.id)}
              activeOpacity={0.7}
            >
              <DownloadIcon size={13} color="#ffffff" />
              <Text style={styles.downloadBtnText}>Resume {downloadState.progress}%</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onDownload(model)}
              activeOpacity={0.7}
            >
              <DownloadIcon size={13} color="#ffffff" />
              <Text style={styles.downloadBtnText}>Get GGUF</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  activeCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#1c1c20',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleArea: {
    flex: 1,
    marginRight: 8,
  },
  modelName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  brandBadge: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'transparent',
  },
  brandText: {
    color: '#a1a1aa',
    fontSize: 11.5,
    fontWeight: '600',
  },
  specsContainer: {
    gap: 4,
    marginBottom: 8,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    flexWrap: 'wrap',
  },
  specLabel: {
    color: '#60a5fa',
    fontSize: 12.5,
    fontWeight: '700',
  },
  specValue: {
    color: '#93c5fd',
    fontSize: 12.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  featureTagsRow: {
    marginTop: 2,
    marginBottom: 10,
    gap: 4,
  },
  supportsHeading: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  tagsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  featureBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  featureBadgeText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '600',
  },
  progressContainer: {
    marginVertical: 8,
  },
  progressBarBackground: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '600',
  },
  progressSpeed: {
    color: '#a1a1aa',
    fontSize: 11,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  bottomSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bottomSizeText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563eb',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  downloadBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
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
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#3f3f46',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  pauseBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
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
