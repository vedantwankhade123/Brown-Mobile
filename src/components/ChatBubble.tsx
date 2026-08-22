import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { ChatMessage } from '../types/chat';
import { spacing } from '../theme/typography';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CopyIcon, SpeakerIcon, CheckIcon, PauseIcon } from './Icons';

interface ChatBubbleProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onSpeak?: (messageId: string, text: string) => void;
  isSpeaking?: boolean;
  isPaused?: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  onCopy,
  onSpeak,
  isSpeaking = false,
  isPaused = false,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const copyProgress = useRef(new Animated.Value(0)).current;
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) {
        clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const handleCopyPress = () => {
    onCopy?.(message.content);

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
          message.isStreaming && styles.streamingBubble,
        ]}
      >
        <MarkdownRenderer content={message.content} onCopyText={onCopy} />

        {!isUser && !message.isStreaming && (
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
                accessibilityLabel={isSpeaking ? 'Pause speaking' : isPaused ? 'Resume speaking' : 'Listen'}
              >
                {isSpeaking ? (
                  <PauseIcon size={18} color="#ffffff" />
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
};

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
    backgroundColor: '#262628',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  streamingBubble: {
    opacity: 0.95,
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
