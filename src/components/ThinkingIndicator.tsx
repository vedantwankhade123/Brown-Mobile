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
 * Clean status line: zero background, shining text animation,
 * and three lively animated pulsing dots.
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  label = 'Thinking',
}) => {
  const shineX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.78)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Shimmer sweep across the text
    const shineLoop = Animated.loop(
      Animated.timing(shineX, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );

    // Subtle breathing pulse for the text
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.75,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Three animated pulsing wave dots
    const makeDotAnim = (dotVal: any, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dotVal, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(dotVal, {
            toValue: 0.25,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 700 - delay)),
        ])
      );

    const anim1 = makeDotAnim(dot1, 0);
    const anim2 = makeDotAnim(dot2, 200);
    const anim3 = makeDotAnim(dot3, 400);

    shineX.setValue(0);
    shineLoop.start();
    pulseLoop.start();
    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      shineLoop.stop();
      pulseLoop.stop();
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [shineX, pulse, dot1, dot2, dot3, label]);

  const translateX = shineX.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 240],
  });

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={label}>
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
              'rgba(255,255,255,0.65)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shineGradient}
          />
        </Animated.View>
      </View>

      {/* Three lively animated pulsing dots */}
      <View style={styles.dotsRow}>
        <Animated.View
          style={[
            styles.dot,
            {
              opacity: dot1,
              transform: [
                {
                  scale: dot1.interpolate({
                    inputRange: [0.25, 1],
                    outputRange: [0.85, 1.25],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            {
              opacity: dot2,
              transform: [
                {
                  scale: dot2.interpolate({
                    inputRange: [0.25, 1],
                    outputRange: [0.85, 1.25],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            {
              opacity: dot3,
              transform: [
                {
                  scale: dot3.interpolate({
                    inputRange: [0.25, 1],
                    outputRange: [0.85, 1.25],
                  }),
                },
              ],
            },
          ]}
        />
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
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  textClip: {
    overflow: 'hidden',
    position: 'relative',
    maxWidth: 280,
  },
  label: {
    color: '#e4e4e7',
    fontSize: 14.5,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  shineSweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
  },
  shineGradient: {
    flex: 1,
    width: 48,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    gap: 3.5,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#38bdf8',
  },
});
