import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Path,
  G,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

interface SyncIllustrationProps {
  width?: number;
  height?: number;
}

const Easing = (Animated as any).Easing || {
  linear: (t: any) => t,
  inOut: (f: any) => f,
  ease: (t: any) => t,
};

export const SyncIllustration: React.FC<SyncIllustrationProps> = ({
  width = 280,
  height = 110,
}) => {
  // Pulse 1: Phone -> Laptop (x: 88 -> 232)
  const pulse1Anim = useRef(new Animated.Value(0)).current;
  // Pulse 2: Laptop -> Phone (x: 232 -> 88)
  const pulse2Anim = useRef(new Animated.Value(0)).current;
  // Sync Icon rotation
  const syncRotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 3.6s loop
    const loop = Animated.loop(
      Animated.parallel([
        // Pulse 1: 0% -> 44% (0 to 1 in 1.6s, then wait)
        Animated.sequence([
          Animated.timing(pulse1Anim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.delay(2000),
          Animated.timing(pulse1Anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: false,
          }),
        ]),
        // Pulse 2: 50% -> 94% (delay 1.8s, then 0 to 1 in 1.6s)
        Animated.sequence([
          Animated.delay(1800),
          Animated.timing(pulse2Anim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.delay(200),
          Animated.timing(pulse2Anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: false,
          }),
        ]),
        // Sync Icon Rotation
        Animated.timing(syncRotateAnim, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, []);

  const pulse1X = pulse1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [88, 232],
  });

  const pulse1Opacity = pulse1Anim.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  const pulse2X = pulse2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [232, 88],
  });

  const pulse2Opacity = pulse2Anim.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  const syncSpin = syncRotateAnim.interpolate({
    inputRange: [0, 0.42, 0.5, 0.92, 1],
    outputRange: ['0deg', '180deg', '180deg', '360deg', '360deg'],
  });

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 320 120"
        fill="none"
      >
        <Defs>
          <LinearGradient id="mobile-sync-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
          </LinearGradient>
        </Defs>

        {/* 1. Background Connection Guides */}
        <Line
          x1="88"
          y1="60"
          x2="138"
          y2="60"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Line
          x1="182"
          y1="60"
          x2="232"
          y2="60"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />

        {/* 2. Dotted Flow Paths */}
        <Line
          x1="88"
          y1="60"
          x2="138"
          y2="60"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="3, 4"
        />
        <Line
          x1="182"
          y1="60"
          x2="232"
          y2="60"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="3, 4"
        />

        {/* 3. Traveling Data Pulses */}
        <AnimatedCircle
          cx={pulse1X}
          cy="60"
          r="2.5"
          fill="#ffffff"
          opacity={pulse1Opacity}
        />
        <AnimatedCircle
          cx={pulse2X}
          cy="60"
          r="2.5"
          fill="#ffffff"
          opacity={pulse2Opacity}
        />

        {/* 4. Smartphone (Left) */}
        <G transform="translate(42, 22)">
          {/* Outer Body */}
          <Rect
            x="0"
            y="0"
            width="46"
            height="76"
            rx="8"
            ry="8"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={1.5}
            fill="rgba(255, 255, 255, 0.02)"
          />
          {/* Screen Inner Outline */}
          <Rect
            x="4"
            y="7"
            width="38"
            height="62"
            rx="4"
            ry="4"
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth={1}
            fill="none"
          />
          {/* Dynamic Island / Notch */}
          <Rect
            x="16"
            y="3"
            width="14"
            height="2.5"
            rx="1.2"
            fill="rgba(255, 255, 255, 0.6)"
          />
          {/* Micro-UI Lines */}
          <Line
            x1="9"
            y1="18"
            x2="25"
            y2="18"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Line
            x1="9"
            y1="24"
            x2="35"
            y2="24"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Line
            x1="9"
            y1="30"
            x2="29"
            y2="30"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Status Indicator */}
          <Circle
            cx="23"
            cy="50"
            r="4"
            stroke="rgba(96, 165, 250, 0.7)"
            strokeWidth={1}
            fill="rgba(96, 165, 250, 0.15)"
          />
          <Circle cx="23" cy="50" r="1.5" fill="#60a5fa" />
          {/* Home Bar */}
          <Line
            x1="16"
            y1="72"
            x2="30"
            y2="72"
            stroke="rgba(255, 255, 255, 0.5)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </G>

        {/* 5. Center Sync Badge */}
        <G>
          {/* Ring */}
          <Circle
            cx={160}
            cy={60}
            r={18}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={1}
            fill="url(#mobile-sync-ring)"
          />
          {/* Dual Sync Arrows */}
          <AnimatedG
            origin="160, 60"
            style={{
              transform: [{ rotate: syncSpin }],
            }}
          >
            <Path
              d="M 152 54 A 10 10 0 0 1 168 57"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M 165 55 L 168 57 L 166 60"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M 168 66 A 10 10 0 0 1 152 63"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M 155 65 L 152 63 L 154 60"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </AnimatedG>
        </G>

        {/* 6. Laptop / Desktop Screen (Right) */}
        <G transform="translate(232, 26)">
          {/* Bezel */}
          <Rect
            x="6"
            y="0"
            width="76"
            height="52"
            rx="4"
            ry="4"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={1.5}
            fill="rgba(255, 255, 255, 0.02)"
          />
          {/* Display */}
          <Rect
            x="10"
            y="4"
            width="68"
            height="42"
            rx="2"
            ry="2"
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth={1}
            fill="none"
          />
          {/* Camera */}
          <Circle cx="44" cy="2" r="0.8" fill="rgba(255, 255, 255, 0.5)" />
          {/* UI Lines */}
          <Line
            x1="16"
            y1="12"
            x2="36"
            y2="12"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Line
            x1="16"
            y1="18"
            x2="54"
            y2="18"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Line
            x1="16"
            y1="24"
            x2="46"
            y2="24"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Base */}
          <Path
            d="M 0 54 H 88 L 83 61 H 5 Z"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            fill="rgba(255, 255, 255, 0.04)"
          />
          {/* Trackpad */}
          <Line
            x1="38"
            y1="55"
            x2="50"
            y2="55"
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
