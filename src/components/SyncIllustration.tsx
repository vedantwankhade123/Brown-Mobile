import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image, Platform } from 'react-native';
import { SyncCycleIcon } from './Icons';

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
  const syncRotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous rotation of the center sync node
    const rotateLoop = Animated.loop(
      Animated.timing(syncRotateAnim, {
        toValue: 1,
        duration: 3600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Pulse particle animation back and forth
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    rotateLoop.start();
    pulseLoop.start();

    return () => {
      rotateLoop.stop();
      pulseLoop.stop();
    };
  }, []);

  const spin = syncRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const particleX = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-15, 25],
  });

  return (
    <View style={[styles.container, { minHeight: height }]}>
      {/* Desktop Laptop Graphic */}
      <View style={styles.deviceWrap}>
        <Image
          source={require('../../Assets/computer-connect.png')}
          style={styles.computerImg}
          resizeMode="contain"
        />
      </View>

      {/* Connection Bridge with Pulsing Tracks and Sync Node */}
      <View style={styles.bridgeWrapper}>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.particle,
              { transform: [{ translateX: particleX }] },
            ]}
          />
        </View>

        <Animated.View
          style={[
            styles.syncNode,
            { transform: [{ rotate: spin }] },
          ]}
        >
          <SyncCycleIcon size={15} color="#ffffff" />
        </Animated.View>

        <View style={styles.track}>
          <Animated.View
            style={[
              styles.particle,
              {
                transform: [
                  {
                    translateX: particleX.interpolate({
                      inputRange: [-15, 25],
                      outputRange: [25, -15],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </View>

      {/* Mobile Phone Graphic */}
      <View style={styles.deviceWrap}>
        <Image
          source={require('../../Assets/connect-mobile.png')}
          style={styles.mobileImg}
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 10,
    width: '100%',
  },
  deviceWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  computerImg: {
    width: 124,
    height: 70,
  },
  mobileImg: {
    width: 42,
    height: 68,
  },
  bridgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    gap: 4,
  },
  track: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(129, 140, 248, 0.3)',
    borderRadius: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  particle: {
    position: 'absolute',
    top: -1,
    width: 16,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c084fc',
    shadowColor: '#818cf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  syncNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192, 132, 252, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
