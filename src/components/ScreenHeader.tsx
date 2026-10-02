import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BackArrowIcon } from './Icons';

export const headerButtonStyle = {
  width: 44,
  height: 44,
  padding: 8,
  borderRadius: 22,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

interface GlassSurfaceProps {
  radius: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({ radius, active = true, style, children }) => (
  <View style={[glass.base, { borderRadius: radius }, style, !active && glass.clear]}>
    {children}
  </View>
);

interface GlassControlProps extends GlassSurfaceProps {
  onPress: () => void;
  accessibilityLabel?: string;
  activeOpacity?: number;
}

export const GlassControl: React.FC<GlassControlProps> = ({
  onPress,
  accessibilityLabel,
  activeOpacity = 0.7,
  radius,
  active,
  style,
  children,
}) => (
  <TouchableOpacity
    activeOpacity={activeOpacity}
    onPress={onPress}
    accessibilityLabel={accessibilityLabel}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <GlassSurface radius={radius} active={active} style={style}>
      {children}
    </GlassSurface>
  </TouchableOpacity>
);

const glass = StyleSheet.create({
  base: {
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderTopColor: 'rgba(255, 255, 255, 0.32)',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 5,
  },
  clear: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
});

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
 * Tracks content scrolling without adding a background to the header bar.
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
  centered?: boolean;
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
  centered = false,
  accessibilityLabel = 'Go back',
}) => {
  return (
    <View style={styles.header}>
      <GlassControl
        radius={22}
        active={true}
        style={styles.backBtn}
        onPress={onBack}
        accessibilityLabel={accessibilityLabel}
      >
        <BackArrowIcon size={24} color="#ffffff" strokeWidth={2.2} />
      </GlassControl>
      <View pointerEvents="none" style={[styles.titleBlock, centered && styles.centeredTitleBlock]}>
        <Text style={[styles.title, centered && { textAlign: 'center' }]} numberOfLines={1}>
          {toTitleCase(title)}
        </Text>
      </View>
      <View style={[styles.rightSlot, centered && { marginLeft: 'auto' }]}>
        {right ? <GlassSurface radius={22} active={true}>{right}</GlassSurface> : <View style={styles.rightSpacer} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    minHeight: 56,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  backBtn: { ...headerButtonStyle },
  centeredTitleBlock: {
    position: 'absolute',
    left: 64,
    right: 64,
    marginLeft: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
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
