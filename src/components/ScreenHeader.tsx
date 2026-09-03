import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { BackArrowIcon } from './Icons';

export function toTitleCase(value: string): string {
  const small = new Set(['of', 'and', 'the', 'for', 'to', 'in', 'on', 'a', 'an']);
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      if (/^(ai|pc|gguf|api)$/i.test(word)) return word.toUpperCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Tracks whether a ScrollView has been scrolled past a threshold so a sticky
 * header can show a raised background (One UI style).
 */
export function useStickyHeader(threshold = 6) {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (event: any) => {
      const y = event?.nativeEvent?.contentOffset?.y || 0;
      const next = y > threshold;
      setScrolled((prev) => (prev === next ? prev : next));
    },
    [threshold]
  );
  return { onScroll, scrolled };
}

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  scrolled?: boolean;
  accessibilityLabel?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  onBack,
  right,
  scrolled = false,
  accessibilityLabel = 'Go back',
}) => {
  return (
    <View style={[styles.header, scrolled && styles.headerScrolled]}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={accessibilityLabel}
      >
        <BackArrowIcon size={24} color="#ffffff" strokeWidth={2.2} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {toTitleCase(title)}
      </Text>
      <View style={styles.rightSlot}>{right || <View style={styles.rightSpacer} />}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 8,
    backgroundColor: '#000000',
    minHeight: 56,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  headerScrolled: {
    backgroundColor: '#0a0a0c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginLeft: 4,
  },
  rightSlot: {
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightSpacer: {
    width: 44,
    height: 44,
  },
});
