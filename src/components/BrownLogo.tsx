import React from 'react';
import { Image, StyleProp, ViewStyle } from 'react-native';

type Props = {
  size: number;
  theme?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
};

export function BrownLogo({ size, theme = 'dark', style }: Props) {
  return (
    <Image
      source={theme === 'light' ? require('../../Assets/browny_black.png') : require('../../Assets/browny_white.png')}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="Brown"
    />
  );
}
