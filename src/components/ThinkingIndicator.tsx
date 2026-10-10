import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

const { AccessibilityInfo } = require('react-native');

interface ThinkingIndicatorProps {
  label?: string;
}

/** Quiet, neutral status text shown only until the first answer arrives. */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ label = 'Thinking' }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let disposed = false;
    let animation: { start: () => void; stop: () => void } | undefined;
    const setMotion = (reduceMotion: boolean) => {
      if (disposed) return;
      animation?.stop();
      opacity.setValue(1);
      if (reduceMotion || disposed) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]));
      animation?.start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(setMotion).catch(() => setMotion(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setMotion);
    return () => {
      disposed = true;
      animation?.stop();
      subscription?.remove();
    };
  }, [opacity]);

  const status = label.replace(/[.\u2026]+$/, '').trim() || 'Thinking';
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={status}>
      <Animated.Text style={[styles.label, { opacity }]}>{status}</Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  label: {
    color: '#a1a1aa',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
});
