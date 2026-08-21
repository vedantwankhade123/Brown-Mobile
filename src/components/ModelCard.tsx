import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ModelMetadata, ModelDownloadState } from '../types/model';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import { DownloadIcon, CheckIcon, TrashIcon, PauseIcon } from './Icons';
import { HuggingFaceLogo } from './HuggingFaceLogo';
import { StorageBudgetService } from '../services/modelManager/StorageBudget';
import { mobileCapabilityTier } from '../services/modelManager/ModelCatalog';

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

function capabilityLabels(model: ModelMetadata): string[] {
  const caps = (model.capabilities || {}) as any;
  const labels: string[] = [];
  if (caps.chat !== false) labels.push('Chat');
  if (caps.code || model.tags.some((t) => /code/i.test(t))) labels.push('Code');
  if (caps.multilingual || model.tags.some((t) => /multi/i.test(t))) labels.push('Multilingual');
  return labels.slice(0, 3);
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

  return (
    <View style={[styles.card, isActive && styles.activeCard]}>
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={styles.modelName}>{model.name}</Text>
          <Text style={styles.modelParams}>
            {model.parameters} • {model.quantization}
          </Text>
        </View>
        <View style={styles.badgeCol}>
          {model.source === 'online' || model.id.includes('ollama') ? (
            <View style={[styles.hfBadge, { borderColor: 'rgba(59, 130, 246, 0.35)', backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Image source={OLLAMA_LOGO} style={{ width: 14, height: 14, tintColor: '#ffffff' }} resizeMode="contain" />
              <Text style={[styles.hfBadgeText, { color: '#93c5fd' }]}>Ollama</Text>
            </View>
          ) : model.source === 'cloud' || model.id.includes('gemini') ? (
            <View style={[styles.hfBadge, { borderColor: 'rgba(168, 85, 247, 0.35)', backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
              <Image source={GEMINI_LOGO} style={{ width: 14, height: 14 }} resizeMode="contain" />
              <Text style={[styles.hfBadgeText, { color: '#c4b5fd' }]}>Gemini</Text>
            </View>
          ) : (
            <View style={styles.hfBadge}>
              <HuggingFaceLogo size={14} />
              <Text style={styles.hfBadgeText}>Hugging Face</Text>
            </View>
          )}
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>{mobileCapabilityTier(model)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.description}>{model.description}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>File {model.sizeFormatted}</Text>
        <Text style={styles.metaDot}>•</Text>
        <Text style={styles.metaText}>RAM ~{StorageBudgetService.formatBytes(ramMb * 1024 * 1024)}</Text>
      </View>

      <View style={styles.tagContainer}>
        {capabilityLabels(model).map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
        {model.tags.filter((t) => !/chat|code|multi/i.test(t)).slice(0, 2).map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>

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

      <View style={styles.bottomRow}>
        <Text style={styles.sizeText}>{model.sizeFormatted}</Text>

        <View style={styles.actionsGroup}>
          {isDownloaded ? (
            <>
              {isActive ? (
                <View style={styles.activePill}>
                  <CheckIcon size={12} color={colors.success} />
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
                <TrashIcon size={15} color={colors.textMuted} />
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
              <DownloadIcon size={13} color="#000000" />
              <Text style={styles.downloadBtnText}>Resume {downloadState.progress}%</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onDownload(model)}
              activeOpacity={0.7}
            >
              <DownloadIcon size={13} color="#000000" />
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
    backgroundColor: '#282828',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeCard: {
    borderColor: colors.borderHighlight,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleArea: {
    flex: 1,
  },
  modelName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
  },
  modelParams: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.sans,
    marginTop: 2,
  },
  badgeCol: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: spacing.sm,
  },
  hfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  hfBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSubtle,
  },
  tierText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginVertical: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 11,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: spacing.xs,
  },
  tag: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  progressContainer: {
    marginVertical: spacing.sm,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentWhite,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
    color: colors.accentWhite,
    fontSize: 11,
    fontWeight: '600',
  },
  progressSpeed: {
    color: colors.textMuted,
    fontSize: 11,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sizeText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadBtn: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  loadBtnText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentWhite,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  downloadBtnText: {
    color: '#000000',
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3f3f46',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  pauseBtnText: {
    color: '#ffffff',
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.success,
  },
  activePillText: {
    color: colors.success,
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  deleteBtn: {
    marginLeft: spacing.sm,
    padding: 6,
  },
});
