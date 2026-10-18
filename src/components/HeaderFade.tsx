import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Solid black top band that ramps to transparent so content scrolls behind the header without a hard edge. */
export const HeaderFade: React.FC = () => {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['#000000', '#000000', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)']}
      locations={[0, 0.18, 0.68, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.fade}
    />
  );
};

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: -28,
  },
});
