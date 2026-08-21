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
          <Text style={styles.modelName}>{model.name}</Text>
        </View>

        {/* Clean Brand Logo Without Background */}
        <View style={styles.brandBadge}>
          {model.source === 'online' || model.id.includes('ollama') ? (
            <View style={styles.brandRow}>
              <Image source={OLLAMA_LOGO} style={{ width: 16, height: 16, tintColor: '#ffffff' }} resizeMode="contain" />
              <Text style={styles.brandText}>Ollama</Text>
            </View>
          ) : model.source === 'cloud' || model.id.includes('gemini') ? (
            <View style={styles.brandRow}>
              <Image source={GEMINI_LOGO} style={{ width: 16, height: 16 }} resizeMode="contain" />
              <Text style={styles.brandText}>Google Gemini</Text>
            </View>
          ) : (
            <View style={styles.brandRow}>
              <HuggingFaceLogo size={18} />
              <Text style={styles.brandText}>Hugging Face</Text>
            </View>
          )}
        </View>
      </View>

      {/* Weights & Parameters Info (Clean White Typography) */}
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

      {/* Supports / Capabilities Tags (Prominent White Labels) */}
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

      {/* Bottom Action Row */}
      <View style={styles.bottomRow}>
        <Text style={styles.bottomSizeText}>{model.sizeFormatted}</Text>

        <View style={styles.actionsGroup}>
          {isDownloaded ? (
            <>
              {isActive ? (
                <View style={styles.activePill}>
                  <CheckIcon size={13} color="#22c55e" />
                  <Text style={styles.activePillText}>ACTIVE</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.loadBtn}
                  onPress={() => onSelect(model)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loadBtnText}>Load Model</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDelete(model.id)}
                activeOpacity={0.7}
              >
                <TrashIcon size={16} color="#ef4444" />
              </TouchableOpacity>
            </>
          ) : isDownloading ? (
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={() => onPause?.(model.id)}
              activeOpacity={0.7}
            >
              <PauseIcon size={14} color="#ffffff" />
              <Text style={styles.pauseBtnText}>Pause</Text>
            </TouchableOpacity>
          ) : isPaused ? (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onResume?.(model.id)}
              activeOpacity={0.7}
            >
              <DownloadIcon size={14} color="#000000" />
              <Text style={styles.downloadBtnText}>Resume {downloadState.progress}%</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onDownload(model)}
              activeOpacity={0.7}
            >
              <DownloadIcon size={14} color="#000000" />
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
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  activeCard: {
    borderColor: '#ffffff',
    backgroundColor: '#202024',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleArea: {
    flex: 1,
    marginRight: 10,
  },
  modelName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  brandBadge: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
  },
  brandText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  specsContainer: {
    gap: 6,
    marginBottom: 12,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  specLabel: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  specValue: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  featureTagsRow: {
    marginTop: 2,
    marginBottom: 14,
    gap: 6,
  },
  supportsHeading: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  tagsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  featureBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    marginVertical: 12,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
    color: '#ffffff',
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
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  bottomSizeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9999,
  },
  downloadBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  loadBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loadBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3f3f46',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  pauseBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  activePillText: {
    color: '#22c55e',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
