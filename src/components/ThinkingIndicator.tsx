import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const Easing = (Animated as any).Easing || {
  inOut: (fn: any) => fn,
  quad: (t: number) => t,
  sin: (t: number) => t,
};

interface ThinkingIndicatorProps {
  label?: string;
}

/**
 * Lightweight status line: no chip background, no bouncing dots —
 * label uses a soft shine sweep across the text.
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  label = 'Thinking',
}) => {
  const shineX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    const shineLoop = Animated.loop(
      Animated.timing(shineX, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.72,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    shineX.setValue(0);
    shineLoop.start();
    pulseLoop.start();
    return () => {
      shineLoop.stop();
      pulseLoop.stop();
    };
  }, [shineX, pulse, label]);

  const translateX = shineX.interpolate({
    inputRange: [0, 1],
    outputRange: [-48, 220],
  });

  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={styles.textClip}>
        <Animated.Text style={[styles.label, { opacity: pulse }]} numberOfLines={1}>
          {label}
        </Animated.Text>
        <Animated.View
          pointerEvents="none"
          style={[styles.shineSweep, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0)',
              'rgba(255,255,255,0.55)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shineGradient}
          />
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  textClip: {
    overflow: 'hidden',
    position: 'relative',
    maxWidth: 280,
  },
  label: {
    color: '#d4d4d8',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  shineSweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 44,
  },
  shineGradient: {
    flex: 1,
    width: 44,
  },
});
