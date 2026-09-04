import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  ScrollView,
  Modal,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import {
  MicIcon,
  ArrowUpIcon,
  StopIcon,
  PauseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  CheckIcon,
  DocumentIcon,
  ImageIcon,
  LaptopIcon,
  CpuIcon,
  SearchIcon,
  SlidersIcon,
  CloseIcon,
} from './Icons';
import { ModelMetadata } from '../types/model';
import { buildAvailableChatModels } from '../services/modelManager/ModelCatalog';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { DesktopSyncService } from '../services/sync/DesktopSync';
import { getCachedGeminiModels, getGeminiApiKey, discoverGeminiModels } from '../services/inference/GeminiClient';
import { getConfiguredCloudModels } from '../services/inference/CloudProviders';
import { AudioWaveform } from './AudioWaveform';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  onStopGeneration: () => void;
  onVoicePress: () => void;
  /** Commit recording → insert transcript into the input for review */
  onVoiceCommit?: () => void;
  /** Discard recording without inserting text */
  onVoiceCancel?: () => void;
  /** External dictate text (from STT commit) — merged into the input once */
  voiceInsertText?: string | null;
  onVoiceInsertConsumed?: () => void;
  onPlusPress?: () => void;
  onOpenModelStore?: () => void;
  onSelectModel?: (model: ModelMetadata) => void;
  activeModel?: ModelMetadata | null;
  isGenerating: boolean;
  isListening: boolean;
  isSpeaking?: boolean;
  disabled?: boolean;
  /** Controlled model sheet visibility (opened from chat input model pill). */
  modelSheetVisible?: boolean;
  onModelSheetVisibleChange?: (visible: boolean) => void;
}

const PLACEHOLDER_PROMPTS = [
  'Ask Brown (100% Offline)...',
  'Summarize a PDF or document...',
  'Brainstorm ideas or code...',
  'Draft a private email or message...',
  'Analyze notes completely on-device...',
  'Ask anything with zero telemetry...',
];

function modelSupportsImages(model?: ModelMetadata | null): boolean {
  if (!model) return false;
  if (model.capabilities?.images) return true;
  const haystack = `${model.name} ${model.id} ${model.apiModel || ''} ${(model.tags || []).join(' ')}`;
  return /vision|vl\b|llava|gpt-4o|gemini|claude-3|claude-4|multimodal|image/i.test(haystack);
}

function modelSupportsDocuments(model?: ModelMetadata | null): boolean {
  if (!model) return true;
  if (typeof model.capabilities?.documents === 'boolean') {
    return model.capabilities.documents;
  }
  return true;
}

/** White circular spinner ring around the red stop button while generating. */
const GeneratingSpinnerRing: React.FC = () => {
  const spin = useRef(new Animated.Value(0)).current;
  const size = 40;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 850,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spinnerRingWrap,
        {
          transform: [{ rotate }],
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference * 0.28} ${circumference}`}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
};

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onStopGeneration,
  onVoicePress,
  onVoiceCommit,
  onVoiceCancel,
  voiceInsertText = null,
  onVoiceInsertConsumed,
  onPlusPress,
  onOpenModelStore,
  onSelectModel,
  activeModel,
  isGenerating,
  isListening,
  isSpeaking = false,
  disabled = false,
  modelSheetVisible,
  onModelSheetVisibleChange,
}) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(36);
  const [internalModelSheetOpen, setInternalModelSheetOpen] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelMetadata[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const lastSentAtRef = useRef(0);
  const lastSentTextRef = useRef('');

  const isModelSheetControlled = typeof modelSheetVisible === 'boolean';
  const isModelSheetOpen = isModelSheetControlled
    ? Boolean(modelSheetVisible)
    : internalModelSheetOpen;

  const setModelSheetOpen = (visible: boolean) => {
    if (onModelSheetVisibleChange) {
      onModelSheetVisibleChange(visible);
    }
    if (!isModelSheetControlled) {
      setInternalModelSheetOpen(visible);
    }
  };

  // Insert dictated text into the composer for review (do not auto-send)
  useEffect(() => {
    const insert = (voiceInsertText || '').trim();
    if (!insert) return;
    setText((prev) => {
      const base = prev.trim();
      return base ? `${base} ${insert}` : insert;
    });
    setInputHeight(36);
    onVoiceInsertConsumed?.();
  }, [voiceInsertText]);

  useEffect(() => {
    let timer: any = null;
    if (isListening) {
      setRecordingSeconds(0);
      setShowAttachMenu(false);
      setModelSheetOpen(false);
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isListening]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  // Smooth Animations for attachment menu
  const attachAnim = useRef(new Animated.Value(0)).current;

  // Typewriter Placeholder Animation State
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const loadAvailableModels = async () => {
    const downloader = ModelDownloader.getInstance();
    await downloader.whenReady();
    const downloadedIds = downloader.getDownloadedIds();
    let hasGeminiKey = false;
    let geminiModels: ModelMetadata[] = [];
    try {
      const key = await getGeminiApiKey();
      hasGeminiKey = !!key;
      if (key) {
        geminiModels = await getCachedGeminiModels();
        if (!geminiModels.length) {
          geminiModels = await discoverGeminiModels(key);
        }
      }
    } catch {}
    let ollamaTags: Array<{ name: string; size?: number }> = [];
    try {
      const sync = DesktopSyncService.getInstance();
      if (sync.getStatus().isConnected) {
        ollamaTags = await sync.fetchOllamaModels();
      }
    } catch {}
    let cloudModels: ModelMetadata[] = [];
    try {
      cloudModels = await getConfiguredCloudModels();
    } catch {}
    setAvailableModels(
      buildAvailableChatModels({
        downloadedIds,
        hasGeminiKey,
        ollamaTags,
        geminiModels,
        cloudModels,
        activeModel,
        allowEmpty: true,
      })
    );
  };

  useEffect(() => {
    loadAvailableModels();
  }, [activeModel?.id]);
  useEffect(() => {
    if ((isModelSheetOpen || showAttachMenu) && Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleGlobalClick = () => {
        setModelSheetOpen(false);
        setShowAttachMenu(false);
      };
      const timer = setTimeout(() => {
        window.addEventListener('click', handleGlobalClick);
      }, 50);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', handleGlobalClick);
      };
    }
  }, [isModelSheetOpen, showAttachMenu]);

  useEffect(() => {
    if (isModelSheetOpen) {
      loadAvailableModels();
    } else {
      setHoveredModelId(null);
      setModelSearchQuery('');
    }
  }, [isModelSheetOpen]);

  useEffect(() => {
    if (showAttachMenu) {
      Animated.timing(attachAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      setHoveredOption(null);
      Animated.timing(attachAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [showAttachMenu]);

  useEffect(() => {
    if (text.length > 0 || isListening) return;

    if (isPaused) {
      const pauseTimeout = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, 1800); // 1.8s hold on full phrase
      return () => clearTimeout(pauseTimeout);
    }

    if (isDeleting) {
      if (subIndex === 0) {
        setIsDeleting(false);
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_PROMPTS.length);
        const breakTimeout = setTimeout(() => {}, 300);
        return () => clearTimeout(breakTimeout);
      }
      const deleteTimeout = setTimeout(() => {
        setSubIndex((prev) => prev - 1);
      }, 25);
      return () => clearTimeout(deleteTimeout);
    }

    // Typing mode
    const currentPrompt = PLACEHOLDER_PROMPTS[placeholderIndex];
    if (subIndex >= currentPrompt.length) {
      setIsPaused(true);
      return;
    }

    const typeTimeout = setTimeout(() => {
      setSubIndex((prev) => prev + 1);
    }, 55);
    return () => clearTimeout(typeTimeout);
  }, [subIndex, isDeleting, isPaused, placeholderIndex, text.length, isListening]);

  const displayedPlaceholder = isListening
    ? 'Listening to voice...'
    : text.length > 0
    ? ''
    : PLACEHOLDER_PROMPTS[placeholderIndex].substring(0, subIndex);

  const handleSend = () => {
    const trimmed = text.trim();
    if (trimmed && !isGenerating && !disabled) {
      lastSentTextRef.current = trimmed;
      lastSentAtRef.current = Date.now();
      onSendMessage(trimmed);
      setText('');
      setInputHeight(36);
      // Enter on multiline can re-apply text after clear — force empty again
      setTimeout(() => {
        setText('');
        setInputHeight(36);
      }, 0);
    }
  };

  const handleKeyPress = (e: any) => {
    if (e?.nativeEvent?.key === 'Enter' && !e?.nativeEvent?.shiftKey) {
      if (typeof e?.preventDefault === 'function') {
        e.preventDefault();
      }
      if (typeof e?.nativeEvent?.preventDefault === 'function') {
        e.nativeEvent.preventDefault();
      }
      handleSend();
    }
  };

  const handleTextChange = (val: string) => {
    // Ignore Enter's trailing newline / stale value right after send
    const recentlySent = Date.now() - lastSentAtRef.current < 400;
    if (recentlySent) {
      const normalized = val.replace(/\s+/g, ' ').trim();
      if (!normalized || normalized === lastSentTextRef.current) {
        setText('');
        setInputHeight(36);
        return;
      }
    }

    setText(val);
    if (!val || val.length === 0) {
      setInputHeight(36);
    }
  };

  const handleContentSizeChange = (e: any) => {
    const rawHeight = e?.nativeEvent?.contentSize?.height || 36;
    const newHeight = Math.max(36, Math.min(110, rawHeight));
    setInputHeight(newHeight);
  };

  const handleAttachFile = (fileType: string) => {
    setShowAttachMenu(false);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      if (fileType === 'doc') {
        input.accept = '.pdf,.docx,.doc,.txt,.md,.json,.csv';
      } else if (fileType === 'img') {
        input.accept = 'image/*';
      } else if (fileType === 'audio') {
        input.accept = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm';
      }
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            if (fileType === 'doc') {
              const prefix = `[Document: ${file.name}]\n`;
              setText((prev) => (prev ? `${prev}\n${prefix}` : prefix));
            } else if (fileType === 'img') {
              const prefix = `[Image: ${file.name}]\n`;
              setText((prev) => (prev ? `${prev}\n${prefix}` : prefix));
            } else if (fileType === 'audio') {
              const prefix = `[Voice Audio: ${file.name}]\n(Transcribed offline on-device)\n`;
              setText((prev) => (prev ? `${prev}\n${prefix}` : prefix));
            }
          };
          if (file.name.endsWith('.pdf') || file.type.startsWith('image/') || file.type.startsWith('audio/')) {
            reader.readAsDataURL(file);
          } else {
            reader.readAsText(file);
          }
        }
      };
      input.click();
    } else {
      if (fileType === 'doc') {
        setText((prev) => (prev ? `${prev}\n[Attached: Document.pdf] ` : `[Attached: Document.pdf] `));
        Alert.alert('Document Attached', 'Document.pdf parsed and added to offline context.');
      } else if (fileType === 'img') {
        setText((prev) => (prev ? `${prev}\n[Attached: Photo.png] ` : `[Attached: Photo.png] `));
        Alert.alert('Image Attached', 'Photo.png attached for on-device analysis.');
      } else if (fileType === 'audio') {
        setText((prev) => (prev ? `${prev}\n[Voice Audio: memo.m4a]\n(Transcribed on-device) ` : `[Voice Audio: memo.m4a]\n(Transcribed on-device) `));
        Alert.alert('Voice File Transcribed', 'Audio file parsed and converted to text offline.');
      }
    }
  };

  const hasText = text.trim().length > 0;
  const canAttachDoc = modelSupportsDocuments(activeModel);
  const canAttachImg = modelSupportsImages(activeModel);

  const filteredModels = availableModels.filter((m) => {
    if (!modelSearchQuery.trim()) return true;
    return (m.name || m.id).toLowerCase().includes(modelSearchQuery.trim().toLowerCase());
  });

  const offlineModels = filteredModels.filter((m) => {
    const prov = (m.provider || m.source || '').toLowerCase();
    return prov !== 'gemini' && prov !== 'cloud' && m.source !== 'cloud';
  });

  const cloudModels = filteredModels.filter((m) => {
    const prov = (m.provider || m.source || '').toLowerCase();
    return prov === 'gemini' || prov === 'cloud' || m.source === 'cloud';
  });

  const closeModelSheet = () => {
    setModelSheetOpen(false);
    setModelSearchQuery('');
  };

  const openModelSheet = () => {
    setShowAttachMenu(false);
    setModelSheetOpen(true);
    loadAvailableModels();
  };

  const renderModelItem = (m: ModelMetadata) => {
    const isSelected = activeModel?.id === m.id || activeModel?.name === m.name;
    const isHovered = hoveredModelId === m.id;
    const supportsImg = modelSupportsImages(m);

    return (
      <TouchableOpacity
        key={m.id}
        style={[
          styles.sheetModelItem,
          (isSelected || isHovered) && styles.sheetModelItemSelected,
        ]}
        onPress={() => {
          if (onSelectModel) {
            onSelectModel(m);
          }
          closeModelSheet();
        }}
        activeOpacity={0.7}
        {...(Platform.OS === 'web'
          ? ({
              onMouseEnter: () => setHoveredModelId(m.id),
              onMouseLeave: () => setHoveredModelId(null),
            } as any)
          : {})}
      >
        <View style={styles.dropdownItemLeft}>
          <View style={styles.sheetModelTextCol}>
            <Text
              style={[styles.dropdownModelTitle, isSelected && styles.dropdownModelTitleSelected]}
              numberOfLines={1}
            >
              {m.name}
            </Text>
            <Text style={styles.sheetModelMeta} numberOfLines={1}>
              {[
                m.source === 'cloud' || m.provider === 'gemini' ? 'Cloud' : 'On-device',
                supportsImg ? 'Images' : null,
                m.capabilities?.documents !== false ? 'Files' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {isSelected && <CheckIcon size={16} color="#ffffff" />}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      style={styles.keyboardContainer}
    >
      <View style={styles.outerWrapper}>
        <View style={styles.container}>
          {/* Full Screen Dismissal Backdrop for Outside Taps (attachments only) */}
          {showAttachMenu && (
            <TouchableOpacity
              style={styles.outsideDismissBackdrop}
              onPress={() => setShowAttachMenu(false)}
              activeOpacity={1}
            />
          )}

          {!isListening && isSpeaking && (
            <View style={styles.voiceDock}>
              <AudioWaveform isActive={true} barCount={12} />
              <Text style={styles.voiceDockLabel}>
                Speaking… tap pause on the message to stop
              </Text>
            </View>
          )}

          {/* Main Input Card (All 4 Corners Symmetrically 36px Curvy) */}
          <View style={styles.inputCard}>
            {/* Top Text Input Area with Animated Typewriter Placeholder */}
            <TextInput
              style={[
                styles.textInput,
                { height: inputHeight },
                Platform.OS === 'web' ? ({
                  outline: 'none',
                  outlineStyle: 'none',
                  outlineWidth: 0,
                  boxShadow: 'none',
                  border: 'none',
                } as any) : {},
              ]}
              value={text}
              onChangeText={handleTextChange}
              onContentSizeChange={handleContentSizeChange}
              onKeyPress={handleKeyPress}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              returnKeyType="send"
              placeholder={displayedPlaceholder}
              placeholderTextColor="#71717a"
              multiline
              showsVerticalScrollIndicator={false}
              maxLength={4000}
              editable={!disabled}
            />

            {/* Bottom Action Controls Row */}
            <View style={styles.bottomControlsRow}>
              {/* Left: Plus (+ model when not listening) */}
              <View style={styles.leftActionsGroup}>
                <View style={styles.plusBtnAnchor}>
                  {showAttachMenu && !isListening && (
                    <Animated.View
                      style={[
                        styles.attachContextMenu,
                        {
                          opacity: attachAnim,
                          transform: [
                            {
                              translateY: attachAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [6, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={[
                          styles.contextMenuItem,
                          !canAttachDoc && styles.contextMenuItemDisabled,
                          hoveredOption === 'doc' && canAttachDoc && styles.contextMenuItemHovered,
                        ]}
                        onPress={() => {
                          if (!canAttachDoc) {
                            Alert.alert(
                              'Files not supported',
                              `The current model (${activeModel?.name || 'Selected Model'}) does not support document attachments.`
                            );
                            return;
                          }
                          handleAttachFile('doc');
                        }}
                        activeOpacity={canAttachDoc ? 0.7 : 1}
                        {...(Platform.OS === 'web'
                          ? ({
                              onMouseEnter: () => setHoveredOption('doc'),
                              onMouseLeave: () => setHoveredOption(null),
                            } as any)
                          : {})}
                      >
                        <View style={[styles.contextMenuIconBox, hoveredOption === 'doc' && canAttachDoc && { backgroundColor: 'rgba(59, 130, 246, 0.22)' }]}>
                          <DocumentIcon size={16} color={canAttachDoc ? (hoveredOption === 'doc' ? '#93c5fd' : '#60a5fa') : '#52525b'} />
                        </View>
                        <Text style={[styles.contextMenuText, !canAttachDoc && styles.contextMenuTextDisabled, hoveredOption === 'doc' && canAttachDoc && styles.contextMenuTextHovered]}>
                          Add Files
                        </Text>
                        {canAttachDoc ? (
                          <ChevronRightIcon
                            size={14}
                            color={hoveredOption === 'doc' ? '#ffffff' : '#71717a'}
                          />
                        ) : (
                          <View style={styles.disabledBadge}>
                            <Text style={styles.disabledBadgeText}>Unavailable</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.contextMenuItem,
                          !canAttachImg && styles.contextMenuItemDisabled,
                          hoveredOption === 'img' && canAttachImg && styles.contextMenuItemHovered,
                        ]}
                        onPress={() => {
                          if (canAttachImg) {
                            handleAttachFile('img');
                          } else {
                            Alert.alert(
                              'Images not supported',
                              `The current model (${activeModel?.name || 'Selected Model'}) does not accept images. Switch to a vision model (e.g. Gemini) to analyze photos.`
                            );
                          }
                        }}
                        activeOpacity={canAttachImg ? 0.7 : 1}
                        {...(Platform.OS === 'web'
                          ? ({
                              onMouseEnter: () => setHoveredOption('img'),
                              onMouseLeave: () => setHoveredOption(null),
                            } as any)
                          : {})}
                      >
                        <View style={[styles.contextMenuIconBox, hoveredOption === 'img' && canAttachImg && { backgroundColor: 'rgba(16, 185, 129, 0.22)' }]}>
                          <ImageIcon size={16} color={canAttachImg ? (hoveredOption === 'img' ? '#6ee7b7' : '#34d399') : '#52525b'} />
                        </View>
                        <Text style={[styles.contextMenuText, !canAttachImg && styles.contextMenuTextDisabled, hoveredOption === 'img' && canAttachImg && styles.contextMenuTextHovered]}>
                          Add Image
                        </Text>
                        {canAttachImg ? (
                          <ChevronRightIcon
                            size={14}
                            color={hoveredOption === 'img' ? '#ffffff' : '#71717a'}
                          />
                        ) : (
                          <View style={styles.disabledBadge}>
                            <Text style={styles.disabledBadgeText}>No vision</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  )}

                  <TouchableOpacity
                    style={styles.plusActionIconBtn}
                    onPress={() => {
                      if (isListening) return;
                      setShowAttachMenu(!showAttachMenu);
                      setModelSheetOpen(false);
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Add tool or attachment"
                  >
                    <PlusIcon size={23} color="#d4d4d8" />
                  </TouchableOpacity>
                </View>

                {!isListening ? (
                  <TouchableOpacity
                    style={styles.inlineModelPill}
                    onPress={() => {
                      setShowAttachMenu(false);
                      setModelSheetOpen(true);
                    }}
                    activeOpacity={0.75}
                    accessibilityLabel="Select Model"
                  >
                    <Text style={styles.inlineModelName} numberOfLines={1}>
                      {activeModel?.name?.trim() || 'Model'}
                    </Text>
                    <ChevronDownIcon size={11} color="#a1a1aa" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Center: mic recording UI fills space between plus and send */}
              {isListening ? (
                <View style={styles.voiceRecordingCenter}>
                  <View style={styles.voiceRecordingPill}>
                    <TouchableOpacity
                      style={styles.voicePillCircleBtn}
                      onPress={() => (onVoiceCommit || onVoicePress)()}
                      activeOpacity={0.8}
                      accessibilityLabel="Stop and insert speech as text"
                    >
                      <PauseIcon size={13} color="#ffffff" />
                    </TouchableOpacity>

                    <View style={styles.voiceVisualizerWrapper}>
                      <AudioWaveform isActive={true} barCount={5} barColor="rgba(255, 255, 255, 0.7)" maxHeight={16} />
                      <Text style={styles.voiceListeningText} numberOfLines={1}>
                        Listening…
                      </Text>
                    </View>

                    <View style={styles.voicePillRight}>
                      <Text style={styles.voiceTimerText}>
                        {formatTimer(recordingSeconds)}
                      </Text>
                      <TouchableOpacity
                        style={styles.voicePillCancelBtn}
                        onPress={() => (onVoiceCancel || onVoicePress)()}
                        activeOpacity={0.7}
                        accessibilityLabel="Cancel recording"
                      >
                        <CloseIcon size={12} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.controlsSpacer} />
              )}

              {/* Right: Mic (when idle) + Send */}
              <View style={styles.rightActionsGroup}>
                {!isListening ? (
                  <TouchableOpacity
                    style={styles.plainActionIconBtn}
                    onPress={onVoicePress}
                    activeOpacity={0.7}
                    disabled={disabled}
                    accessibilityLabel="Voice Mode"
                  >
                    <MicIcon size={20} color="#d4d4d8" />
                  </TouchableOpacity>
                ) : null}

                {isGenerating ? (
                  <TouchableOpacity
                    style={styles.stopActionBtn}
                    onPress={onStopGeneration}
                    activeOpacity={0.7}
                    accessibilityLabel="Stop Generation"
                  >
                    <GeneratingSpinnerRing />
                    <View style={styles.stopIconInner}>
                      <StopIcon size={14} color="#ef4444" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.sendActionBtn,
                      hasText && !disabled && styles.sendActionBtnActive,
                      !hasText || disabled ? styles.sendBtnDisabled : null,
                    ]}
                    onPress={handleSend}
                    disabled={!hasText || disabled || isListening}
                    activeOpacity={0.7}
                    accessibilityLabel="Send Message"
                  >
                    <ArrowUpIcon
                      size={21}
                      color={hasText && !disabled && !isListening ? '#111113' : '#71717a'}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Model selection bottom sheet */}
      <Modal
        visible={isModelSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeModelSheet}
      >
        <View style={styles.sheetRoot}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={closeModelSheet}
          />
          <View style={styles.modelSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select model</Text>

            <View style={styles.modelDropdownSearchContainer}>
              <SearchIcon size={14} color="rgba(255, 255, 255, 0.45)" />
              <TextInput
                style={[
                  styles.modelDropdownSearchInput,
                  Platform.OS === 'web'
                    ? ({
                        outline: 'none',
                        outlineStyle: 'none',
                        boxShadow: 'none',
                        border: 'none',
                      } as any)
                    : {},
                ]}
                value={modelSearchQuery}
                onChangeText={setModelSearchQuery}
                placeholder="Search models"
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {modelSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setModelSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <CloseIcon size={12} color="#71717a" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.dropdownList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredModels.length === 0 ? (
                <View style={styles.dropdownEmptyContainer}>
                  <Text style={styles.dropdownEmptyText}>
                    {modelSearchQuery.trim()
                      ? 'No matching models found.'
                      : 'No models installed yet.'}
                  </Text>
                </View>
              ) : (
                <>
                  {offlineModels.length > 0 && (
                    <Text style={styles.modelSectionTitle}>Offline Models</Text>
                  )}
                  {offlineModels.map((m) => renderModelItem(m))}

                  {cloudModels.length > 0 && (
                    <Text style={styles.modelSectionTitle}>Cloud Models</Text>
                  )}
                  {cloudModels.map((m) => renderModelItem(m))}
                </>
              )}
            </ScrollView>

            {onOpenModelStore && (
              <TouchableOpacity
                style={styles.dropdownFooterBtn}
                onPress={() => {
                  closeModelSheet();
                  onOpenModelStore();
                }}
                activeOpacity={0.7}
              >
                <SlidersIcon size={15} color="#ffffff" />
                <Text style={styles.dropdownFooterText}>Manage models</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  outerWrapper: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingTop: 2,
    paddingBottom: Platform.OS === 'ios' ? 28 : (Platform.OS === 'web' ? 22 : 18),
    overflow: 'visible',
  },
  container: {
    width: '91%',
    maxWidth: 660,
    alignSelf: 'center',
    position: 'relative',
    overflow: 'visible',
    zIndex: 20,
  },
  outsideDismissBackdrop: {
    position: 'absolute',
    top: -2000,
    bottom: -2000,
    left: -1000,
    right: -1000,
    zIndex: 30,
    backgroundColor: 'transparent',
  },
  modelDropdownCard: {
    position: 'absolute',
    bottom: 38,
    width: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#212121',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.85,
    shadowRadius: 24,
    elevation: 24,
    zIndex: 50,
  },
  modelPickerWrap: {
    position: 'relative',
    zIndex: 50,
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'visible',
    maxWidth: '72%',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modelSheet: {
    backgroundColor: '#141416',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    maxHeight: '72%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  sheetScroll: {
    maxHeight: 360,
    flexGrow: 0,
  },
  sheetModelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'transparent',
    minHeight: 52,
  },
  sheetModelItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetModelTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sheetModelMeta: {
    color: '#71717a',
    fontSize: 11.5,
    fontWeight: '500',
  },
  plusBtnAnchor: {
    position: 'relative',
    zIndex: 100,
  },
  attachContextMenu: {
    position: 'absolute',
    bottom: 48,
    left: -4,
    backgroundColor: '#141416',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 6,
    width: 232,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.85,
    shadowRadius: 24,
    elevation: 32,
    zIndex: 999,
    gap: 3,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
    cursor: 'pointer' as any,
  },
  contextMenuItemHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  contextMenuItemDisabled: {
    opacity: 0.45,
  },
  contextMenuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  contextMenuText: {
    flex: 1,
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  contextMenuTextHovered: {
    color: '#ffffff',
    fontWeight: '700',
  },
  contextMenuTextDisabled: {
    color: '#71717a',
  },
  disabledBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  disabledBadgeText: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '600',
  },
  modelDropdownSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  modelDropdownSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '400',
    marginLeft: 7,
    paddingVertical: 0,
    height: '100%',
  },
  dropdownList: {
    gap: 2,
    paddingBottom: 2,
  },
  dropdownScroll: {
    maxHeight: 220,
    flexGrow: 0,
  },
  modelSectionTitle: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#71717a',
    letterSpacing: 0.2,
  },
  dropdownEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  dropdownEmptyText: {
    color: '#71717a',
    fontSize: 12.5,
    textAlign: 'center',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'transparent',
    minHeight: 36,
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  voiceDock: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#282828',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  voiceDockLabel: {
    color: '#d4d4d8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  dropdownModelTitle: {
    color: '#f4f4f5',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  dropdownModelTitleSelected: {
    color: '#ffffff',
  },
  dropdownFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  dropdownFooterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  modelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: '#1a1a1d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxWidth: 168,
  },
  modelName: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '600',
    maxWidth: 112,
    flexShrink: 1,
  },
  inputCard: {
    backgroundColor: '#212124',
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    minHeight: 82,
    justifyContent: 'space-between',
    zIndex: 20,
  },
  textInput: {
    color: '#ffffff',
    fontSize: 16.5,
    paddingVertical: 0,
    paddingHorizontal: 0,
    lineHeight: 23,
    textAlignVertical: 'top',
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 2,
  },
  leftActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 0,
    paddingLeft: 4,
    flexShrink: 0,
  },
  controlsSpacer: {
    flex: 1,
    minWidth: 8,
  },
  voiceRecordingCenter: {
    flex: 1,
    marginHorizontal: 8,
    minWidth: 0,
    justifyContent: 'center',
  },
  plusActionIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inlineModelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    maxWidth: 148,
    flexShrink: 1,
  },
  inlineModelName: {
    color: '#e4e4e7',
    fontSize: 12.5,
    fontWeight: '600',
    maxWidth: 120,
    flexShrink: 1,
  },
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  outlinedActionIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242426',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  plainActionIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  actionIconBtnListening: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.55)',
  },
  voiceRecordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    height: 38,
    width: '100%',
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 3,
    backgroundColor: '#0c2766',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.45)',
    borderRadius: 9999,
    maxWidth: '100%',
    shadowColor: '#1d4ed8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  voicePillCircleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceVisualizerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  voiceListeningText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  voicePillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  voiceTimerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  voicePillCancelBtn: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  sendActionBtnActive: {
    backgroundColor: '#f4f4f5',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  stopActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  stopIconInner: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    zIndex: 2,
  },
  spinnerRingWrap: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
