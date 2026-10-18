import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { animateOnce } from '../utils/motion';
import { useReducedMotion } from '../utils/useReducedMotion';

/** Retain the field through its exit animation and cancel stale completions on reversal. */
export function AnimatedSearchSwap({ active, collapsed, expanded, style }: {
  active: boolean; collapsed: React.ReactNode; expanded: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const [mounted, setMounted] = useState(active);
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const generation = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const token = ++generation.current;
    if (active) setMounted(true);
    const duration = reduced ? 0 : active ? 200 : 160;
    const animation = Animated.timing(progress, {
      toValue: active ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animateOnce(animation, duration, () => {
      if (generation.current !== token) return;
      progress.setValue(active ? 1 : 0);
      if (!active) setMounted(false);
    });
    return () => { ++generation.current; animation.stop(); };
  }, [active, reduced, progress]);
  return <View style={style}>
    <Animated.View pointerEvents={active ? 'none' : 'auto'} accessibilityElementsHidden={active} importantForAccessibility={active ? 'no-hide-descendants' : 'auto'} style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>{collapsed}</Animated.View>
    {(active || mounted) && <Animated.View pointerEvents={active ? 'auto' : 'none'} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'} style={[StyleSheet.absoluteFill, {
      opacity: progress,
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 12, 0] }) }],
    }]}>{expanded}</Animated.View>}
  </View>;
}
