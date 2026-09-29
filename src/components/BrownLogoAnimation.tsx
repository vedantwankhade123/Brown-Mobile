import React from 'react';
import { Image, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

// The mark animation ships as Lottie JSON next to the static logo it replaces.
const animationData = require('../../Assets/brown-logo-animation.json');
const staticLogo = require('../../Assets/Brown-white.png');

// Linked native module only exists in a rebuilt binary; on an older one the module
// throws while loading, so keep the static mark instead of crashing the app.
let LottieView: React.ComponentType<any> | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch (err) {
  LottieView = null;
}

type Props = {
  size: number;
  style?: StyleProp<ViewStyle>;
};

export function BrownLogoAnimation({ size, style }: Props) {
  if (!LottieView || Platform.OS === 'web') {
    return (
      <Image
        source={staticLogo}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
      />
    );
  }

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {/* SOFTWARE, not HARDWARE: Android's hardware surface ignores the scale the chat hero animates with. */}
      <LottieView
        source={animationData}
        style={StyleSheet.absoluteFill}
        renderMode="SOFTWARE"
        autoPlay
        loop
      />
    </View>
  );
}
