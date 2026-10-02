import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import {
  MicIcon,
  ArrowUpIcon,
  StopIcon,
  PauseIcon,
  ChevronRightIcon,
  PlusIcon,
  DocumentIcon,
  CloseIcon,
} from './Icons';
import { ModelMetadata } from '../types/model';
import { AudioWaveform } from './AudioWaveform';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

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
  /** What the recognizer has heard so far, shown live inside the recording pill */
  voicePartialText?: string;
  /** Quick-action draft: replaces the input and focuses it once */
  draftText?: string | null;
  onDraftConsumed?: () => void;
  activeModel?: ModelMetadata | null;
  isGenerating: boolean;
  isListening: boolean;
  disabled?: boolean;
  onFocus?: () => void;
}

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

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onStopGeneration,
  onVoicePress,
  onVoiceCommit,
  onVoiceCancel,
  voiceInsertText = null,
  onVoiceInsertConsumed,
  voicePartialText = '',
  draftText = null,
  onDraftConsumed,
  activeModel,
  isGenerating,
  isListening,
  disabled = false,
  onFocus,
}) => {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset(insets.bottom);
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(36);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const lastSentAtRef = useRef(0);
  const lastSentTextRef = useRef('');
  const textInputRef = useRef<any>(null);
  // Composer content captured when voice listening starts; live partials are
  // rendered on top of it and rolled back on cancel.
  const voiceBaseRef = useRef<string | null>(null);
  const textRef = useRef('');
  textRef.current = text;

  const focusComposer = useCallback(() => {
    if (disabled || isListening) return;
    // Android often needs a deferred focus when the Pressable wrapper receives the first tap
    const run = () => {
      try {
        textInputRef.current?.focus?.();
      } catch {}
    };
    run();
    requestAnimationFrame(run);
    setTimeout(run, 32);
  }, [disabled, isListening]);

  // Insert dictated text into the composer for review (do not auto-send).
  // Declared before the isListening effect so the commit replaces the live
  // partial instead of the cancel-restore overwriting it afterwards.
  useEffect(() => {
    const insert = (voiceInsertText || '').trim();
    if (!insert) return;
    const base = voiceBaseRef.current;
    if (base !== null) {
      voiceBaseRef.current = null;
      const head = base.trim() ? `${base.replace(/\s+$/, '')} ` : '';
      setText(`${head}${insert}`);
    } else {
      setText((prev) => {
        const b = prev.trim();
        return b ? `${b} ${insert}` : insert;
      });
    }
    onVoiceInsertConsumed?.();
  }, [voiceInsertText]);

  // Quick-action draft replaces the composer content and focuses it
  useEffect(() => {
    const draft = (draftText || '').trim();
    if (!draft) return;
    setText(draft);
    setShowAttachMenu(false);
    setTimeout(() => {
      try {
        textInputRef.current?.focus?.();
      } catch {}
    }, 60);
    onDraftConsumed?.();
  }, [draftText]);

  useEffect(() => {
    let timer: any = null;
    if (isListening) {
      voiceBaseRef.current = textRef.current;
      setRecordingSeconds(0);
      setShowAttachMenu(false);
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
      // Cancelled (or errored) before a commit cleared the ref — roll the
      // composer back to what it held when listening started.
      if (voiceBaseRef.current !== null) {
        const base = voiceBaseRef.current;
        voiceBaseRef.current = null;
        setText(base);
      }
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isListening]);

  // Stream live transcription into the input field itself (waveform stays blank-safe).
  useEffect(() => {
    if (!isListening) return;
    const base = voiceBaseRef.current;
    if (base === null) return;
    const partial = (voicePartialText || '').trim();
    const head = base.trim() ? `${base.replace(/\s+$/, '')} ` : '';
    setText(partial ? `${head}${partial}` : base);
  }, [isListening, voicePartialText]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  // Smooth Animations for attachment menu
  const attachAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showAttachMenu && Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleGlobalClick = () => setShowAttachMenu(false);
      const timer = setTimeout(() => {
        window.addEventListener('click', handleGlobalClick);
      }, 50);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', handleGlobalClick);
      };
    }
  }, [showAttachMenu]);

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

  const displayedPlaceholder = isListening
    ? 'Listening to voice...'
    : text.length > 0
    ? ''
    : 'Ask anything';

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
    const newHeight = Math.max(36, Math.min(132, rawHeight));
    setInputHeight(newHeight);
  };

  const handleAttachFile = async () => {
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', copyToCacheDirectory: true, multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      const mime = file.mimeType || '';
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (mime.startsWith('image/')) {
        Alert.alert('Image attachment unavailable', modelSupportsImages(activeModel)
          ? 'Image file processing is not available in this chat yet.'
          : 'Choose a vision model to use images. Image file processing is not available in this chat yet.');
        return;
      }
      const readable = mime.startsWith('text/') || ['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'log', 'js', 'ts', 'py', 'html', 'css'].includes(extension);
      if (!readable) {
        Alert.alert('File type not supported', 'Choose a text document, code file, CSV or JSON. PDF, Office, audio and other binary files cannot be read in this chat yet.');
        return;
      }
      if (!modelSupportsDocuments(activeModel)) {
        Alert.alert('Files not supported', 'Choose a model that supports document content.');
        return;
      }
      if ((file.size || 0) > 1024 * 1024) {
        Alert.alert('File too large', 'Choose a text file smaller than 1 MB.');
        return;
      }
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert('Add this file?', file.name, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Add file', onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
      const contents = Platform.OS === 'web' && file.file
        ? await file.file.text()
        : await FileSystem.readAsStringAsync(file.uri);
      const prefix = `[File: ${file.name}]\n`;
      const draft = (text.trim() ? `${text}\n` : '') + prefix + contents;
      if (draft.length > 4000) {
        Alert.alert('File too long', 'This file and your draft exceed the 4,000-character input limit. Choose a shorter file or clear your draft.');
        return;
      }
      setText(draft);
      textInputRef.current?.focus();
    } catch (error: any) {
      Alert.alert('Could not open file', error?.message || 'Please try another file.');
    }
  };

  const hasText = text.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      style={styles.keyboardContainer}
    >
      <View
        style={[
          styles.outerWrapper,
          Platform.OS === 'android' && {
            paddingBottom: keyboardInset > 0 ? keyboardInset + 10 : 18 + insets.bottom,
          },
        ]}
      >
        <View style={styles.container}>
          {/* Full Screen Dismissal Backdrop for Outside Taps (attachments only) */}
          {showAttachMenu && (
            <TouchableOpacity
              style={styles.outsideDismissBackdrop}
              onPress={() => setShowAttachMenu(false)}
              activeOpacity={1}
            />
          )}

          {/* Main Input Card — Pressable focuses TextInput on first tap */}
          <Pressable
            style={styles.inputCard}
            onPressIn={focusComposer}
            onPress={focusComposer}
            accessible={false}
          >
              <TextInput
                ref={textInputRef}
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
                onFocus={() => {
                  setShowAttachMenu(false);
                  onFocus?.();
                }}
                blurOnSubmit={false}
                returnKeyType="send"
                placeholder={displayedPlaceholder}
                placeholderTextColor="#9ca3af"
                multiline
                showsVerticalScrollIndicator={false}
                maxLength={4000}
                editable={!disabled && !isListening}
                showSoftInputOnFocus
                caretHidden={false}
              />

              {/* Bottom Action Controls Row */}
              <View style={styles.bottomControlsRow}>
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
                          style={[styles.contextMenuItem, hoveredOption === 'file' && styles.contextMenuItemHovered]}
                          onPress={handleAttachFile}
                          activeOpacity={0.7}
                          accessibilityLabel="Add files"
                          {...(Platform.OS === 'web' ? ({
                            onMouseEnter: () => setHoveredOption('file'),
                            onMouseLeave: () => setHoveredOption(null),
                          } as any) : {})}
                        >
                          <View style={styles.contextMenuIconBox}>
                            <DocumentIcon size={16} color="#60a5fa" />
                          </View>
                          <Text style={styles.contextMenuText}>Add files</Text>
                          <ChevronRightIcon size={14} color="#71717a" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.contextMenuItem}
                          onPress={() => setShowAttachMenu(false)}
                          accessibilityLabel="Cancel file upload"
                          activeOpacity={0.7}
                        >
                          <View style={styles.contextMenuIconBox}>
                            <CloseIcon size={16} color="#a1a1aa" />
                          </View>
                          <Text style={styles.contextMenuText}>Cancel</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    )}

                    <TouchableOpacity
                      style={styles.plusActionIconBtn}
                      onPress={() => {
                        if (isListening) return;
                        setShowAttachMenu(!showAttachMenu);
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel="Add tool or attachment"
                    >
                      <PlusIcon size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Center: mic recording UI fills space between plus and mic */}
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

                <View style={styles.rightActionsGroup}>
                  {!isListening ? (
                    <TouchableOpacity
                      style={styles.plainActionIconBtn}
                      onPress={onVoicePress}
                      activeOpacity={0.7}
                      disabled={disabled}
                      accessibilityLabel="Voice Mode"
                    >
                      <MicIcon size={16} color="#ffffff" />
                    </TouchableOpacity>
                  ) : null}

                  {isGenerating ? (
                    <TouchableOpacity
                      style={styles.sendCircleBtn}
                      onPress={onStopGeneration}
                      activeOpacity={0.7}
                      accessibilityLabel="Stop Generation"
                    >
                      <StopIcon size={15} color="#ffffff" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.sendCircleBtn, !hasText && styles.sendCircleBtnIdle]}
                      onPress={handleSend}
                      disabled={!hasText || disabled || isListening}
                      activeOpacity={0.7}
                      accessibilityLabel="Send Message"
                    >
                      <ArrowUpIcon size={16} color="#ffffff" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Pressable>
        </View>
      </View>
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
  inputCard: {
    backgroundColor: '#1B1B1B',
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'space-between',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  textInput: {
    color: '#ffffff',
    fontSize: 17,
    paddingVertical: 0,
    paddingHorizontal: 2,
    lineHeight: 23,
    textAlignVertical: 'top',
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 2,
  },
  leftActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 0,
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
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 0,
  },
  plainActionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  sendCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#295294',
    flexShrink: 0,
  },
  sendCircleBtnIdle: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
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
});
