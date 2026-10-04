import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';


/** A subtle black fade protects controls without creating an opaque header bar. */
export const HeaderFade: React.FC = () => {
  return <LinearGradient pointerEvents="none"
    colors={['rgba(0,0,0,1)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
    locations={[0, 0.3, 0.65, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
    style={styles.fade} />;
};
const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: -28 },
});
