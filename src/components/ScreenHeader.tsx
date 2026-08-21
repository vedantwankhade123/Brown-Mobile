import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  accessibilityLabel?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  onBack,
  right,
  accessibilityLabel = 'Go back',
}) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={accessibilityLabel}
      >
        <BackArrowIcon size={20} color="#ffffff" />
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#000000',
    minHeight: 56,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginLeft: 10,
  },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightSpacer: {
    width: 40,
    height: 40,
  },
});
