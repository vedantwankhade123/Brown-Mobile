import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export function VoiceDownloadIcon({ busy }: { busy: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    rotation.setValue(0);
    if (!busy) return;
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [busy, rotation]);
  return <View style={styles.icon} pointerEvents="none">
    {busy && <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      <Svg width={40} height={40} viewBox="0 0 40 40"><Circle cx={20} cy={20} r={17} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="74 33" strokeLinecap="round" /></Svg>
    </Animated.View>}
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></Svg>
  </View>;
}
const styles = StyleSheet.create({ icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' } });
