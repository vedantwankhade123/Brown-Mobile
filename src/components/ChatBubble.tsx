import React, { useEffect, useRef, useState, memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Text } from 'react-native';
import { ChatMessage } from '../types/chat';
import { spacing } from '../theme/typography';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingIndicator } from './ThinkingIndicator';
import { CopyIcon, SpeakerIcon, CheckIcon, PauseIcon } from './Icons';

interface ChatBubbleProps {
  message: ChatMessage;
  onCopy?: (text: string) => boolean | Promise<boolean>;
  onSpeak?: (messageId: string, text: string) => void;
  isSpeaking?: boolean;
  isPaused?: boolean;
}

const TYPE_INTERVAL_MS = 32;
/** Characters revealed per tick — keeps UI smooth even for large one-shot chunks. */
const CHARS_PER_TICK = 4;

export const ChatBubble: React.FC<ChatBubbleProps> = memo(({
  message,
  onCopy,
  onSpeak,
  isSpeaking = false,
  isPaused = false,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [displayedContent, setDisplayedContent] = useState(() =>
    isUser || !message.isStreaming ? message.content : ''
  );
  const [isTyping, setIsTyping] = useState(false);

  const copyProgress = useRef(new Animated.Value(0)).current;
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef(message.content || '');
  const displayedRef = useRef(isUser || !message.isStreaming ? message.content || '' : '');
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingFrameRef = useRef<string | null>(null);
  const rafScheduledRef = useRef(false);

  const showThinking =
    !isUser &&
    Boolean(message.isStreaming) &&
    !String(message.content || '').trim() &&
    !displayedContent.trim();

  const flushDisplay = (next: string) => {
    pendingFrameRef.current = next;
    if (rafScheduledRef.current) return;
    rafScheduledRef.current = true;
    requestAnimationFrame(() => {
      rafScheduledRef.current = false;
      if (pendingFrameRef.current != null) {
        setDisplayedContent(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    });
  };

  const stopTypingTimer = () => {
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }
  };

  const startTypingTimer = () => {
    if (typeTimerRef.current) return;

    setIsTyping(true);
    typeTimerRef.current = setInterval(() => {
      const target = targetRef.current;
      const current = displayedRef.current;

      if (current.length >= target.length) {
        stopTypingTimer();
        displayedRef.current = target;
        flushDisplay(target);
        setIsTyping(false);
        return;
      }

      const remaining = target.length - current.length;
      // Adaptive pace: faster when far behind a big chunk, never dump all at once
      const step =
        remaining > 1200
          ? 14
          : remaining > 400
          ? 9
          : remaining > 100
          ? 6
          : CHARS_PER_TICK;

      const next = target.slice(0, current.length + step);
      displayedRef.current = next;
      flushDisplay(next);
    }, TYPE_INTERVAL_MS);
  };

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) {
        clearTimeout(copyResetTimer.current);
      }
      stopTypingTimer();
    };
  }, []);

  // Keep typing toward full content — even after stream ends (one-chunk replies).
  useEffect(() => {
    targetRef.current = message.content || '';

    if (isUser) {
      stopTypingTimer();
      displayedRef.current = message.content || '';
      setDisplayedContent(message.content || '');
      setIsTyping(false);
      return;
    }

    const target = message.content || '';
    const current = displayedRef.current;
    const stillCatchingUp = current.length < target.length;
    // Completion and Stop must also stop the reveal animation immediately.
    if (!message.isStreaming) {
      stopTypingTimer();
      pendingFrameRef.current = target;
      displayedRef.current = target;
      setDisplayedContent(target);
      setIsTyping(false);
      return;
    }

    if (stillCatchingUp) {
      startTypingTimer();
    } else {
      stopTypingTimer();
      setIsTyping(false);
      if (!message.isStreaming) {
        displayedRef.current = target;
        setDisplayedContent(target);
      }
    }
  }, [message.content, message.isStreaming, isUser, message.id]);

  const showActions = !isUser && !message.isStreaming && !isTyping && !showThinking;

  const handleCopyPress = async () => {
    if (!onCopy || !(await onCopy(message.content))) return;

    if (copyResetTimer.current) {
      clearTimeout(copyResetTimer.current);
    }

    setCopied(true);
    Animated.timing(copyProgress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    copyResetTimer.current = setTimeout(() => {
      Animated.timing(copyProgress, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start((result?: { finished: boolean }) => {
        if (result?.finished) {
          setCopied(false);
        }
      });
    }, 2000);
  };

  const copyIconStyle = {
    opacity: copyProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        scale: copyProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.65],
        }),
      },
    ],
  };

  const checkIconStyle = {
    opacity: copyProgress,
    transform: [
      {
        scale: copyProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.65, 1],
        }),
      },
    ],
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          (message.isStreaming || isTyping) && styles.streamingBubble,
        ]}
      >
        {isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : showThinking ? (
          <ThinkingIndicator label={message.statusLabel || 'Thinking'} />
        ) : (
          <MarkdownRenderer content={displayedContent} onCopyText={onCopy} />
        )}

        {showActions && (
          <View style={styles.actionsRow}>
            {onCopy && (
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={handleCopyPress}
                activeOpacity={0.7}
                accessibilityLabel={copied ? 'Copied' : 'Copy text'}
              >
                <Animated.View style={[styles.iconLayer, copyIconStyle]}>
                  <CopyIcon size={20} color="#9ca3af" />
                </Animated.View>
                <Animated.View style={[styles.iconLayer, styles.iconOverlay, checkIconStyle]}>
                  <CheckIcon size={20} color="#22c55e" />
                </Animated.View>
              </TouchableOpacity>
            )}
            {onSpeak && (
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => onSpeak(message.id, message.content)}
                activeOpacity={0.6}
                accessibilityLabel={isSpeaking ? 'Stop speaking' : isPaused ? 'Resume speaking' : 'Listen'}
              >
                {isSpeaking ? (
                  <PauseIcon size={18} color="#3b82f6" />
                ) : (
                  <SpeakerIcon size={20} color="#9ca3af" />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

ChatBubble.displayName = 'ChatBubble';

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '94%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  userBubble: {
    alignSelf: 'flex-end',
    flexShrink: 1,
    maxWidth: '85%',
    backgroundColor: '#262628',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  streamingBubble: {
    opacity: 0.98,
  },
  userText: {
    color: '#ececf1',
    fontSize: 16,
    lineHeight: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  actionIconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOverlay: {
    position: 'absolute',
  },
});
