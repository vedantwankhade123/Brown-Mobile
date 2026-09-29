import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

interface EmptyStateProps {
  title: string;
  description?: string;
  style?: StyleProp<ViewStyle>;
}

/** Stacked-cards empty state — mirrors the desktop `.ui-empty` composition. */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, style }) => (
  <View style={[styles.wrap, style]}>
    <View style={styles.media}>
      <View style={[styles.card, styles.cardBack]} />
      <View style={[styles.card, styles.cardMid]} />
      <View style={[styles.card, styles.cardFront]}>
        <View style={styles.thumb} />
        <View style={styles.bars}>
          <View style={[styles.line, styles.lineLong]} />
          <View style={[styles.line, styles.lineShort]} />
        </View>
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.42)']}
        style={styles.fade}
      />
    </View>
    <Text style={styles.title}>{title}</Text>
    {description ? <Text style={styles.description}>{description}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  media: {
    width: 236,
    height: 88,
    marginBottom: 16,
  },
  card: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: '#151517',
  },
  cardBack: {
    left: 24,
    right: 24,
    top: 0,
    height: 24,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardMid: {
    left: 12,
    right: 12,
    top: 12,
    height: 24,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardFront: {
    left: 0,
    right: 0,
    top: 24,
    height: 64,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1d',
  },
  thumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  bars: {
    flex: 1,
    gap: 6,
  },
  line: {
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
  },
  lineLong: { height: 10, width: '75%' },
  lineShort: { height: 8, width: '50%' },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 32,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentWhite,
    textAlign: 'center',
  },
  description: {
    marginTop: 5,
    maxWidth: 320,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default EmptyState;
