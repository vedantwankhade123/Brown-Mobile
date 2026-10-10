import { ButtonSurface } from './ButtonSurface';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { HeaderFade } from './HeaderFade';
import { BackArrowIcon } from './Icons';

export const headerButtonStyle = {
  width: 44,
  height: 44,
  padding: 8,
  borderRadius: 22,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

/** Shared title surface used by chat, history, settings and model screens. */
export const headerTitleSurface = {
  backgroundColor: '#191919', borderRadius: 9999, borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 16, paddingVertical: 10,
  alignItems: 'center' as const, justifyContent: 'center' as const, alignSelf: 'center' as const,
};
export const HeaderTitle: React.FC<{ title: string; style?: StyleProp<ViewStyle> }> = ({ title, style }) => {
  const [availableWidth, setAvailableWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const label = toTitleCase(title);
  const fontSize = availableWidth > 0
    ? Math.min(18, Math.max(10, (availableWidth - 32) / Math.max(1, label.length * 0.6 * fontScale)))
    : 18;
  return (
    <View pointerEvents="none" style={style} onLayout={(event: { nativeEvent: { layout: { width: number } } }) => setAvailableWidth(event.nativeEvent.layout.width)}>
      <View style={[headerTitleSurface, { maxWidth: '100%' }]}>
        <ButtonSurface />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ zIndex: 1, flexShrink: 1, color: '#ffffff', fontSize, fontWeight: '600', letterSpacing: -0.3 }}>{label}</Text>
      </View>
    </View>
  );
};

interface GlassSurfaceProps {
  radius: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({ radius, active = true, style, children }) => (
  <View style={[glass.base, { borderRadius: radius }, style, !active && glass.clear]}>
    <ButtonSurface radius={radius} />
    <View pointerEvents="box-none" style={{ zIndex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
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
      <View pointerEvents="box-none" style={{ zIndex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </GlassSurface>
  </TouchableOpacity>
);

const glass = StyleSheet.create({
  base: {
    backgroundColor: '#191919',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0,
    shadowRadius: 8,
    elevation: 0,
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
  overlay?: boolean;
  centered?: boolean;
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  scrolled?: boolean;
  accessibilityLabel?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  overlay = false,
  onBack,
  right,
  scrolled = false,
  centered = true,
  accessibilityLabel = 'Go back',
}) => {
  return (
    <View style={[styles.header, overlay && { position: 'absolute', top: 0, left: 0, right: 0 }]}>
      <HeaderFade />
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
        <HeaderTitle title={title} />
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
    alignSelf: 'center',
    zIndex: 20,
    overflow: 'visible',
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
    fontWeight: '600',
    letterSpacing: -0.4,
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
