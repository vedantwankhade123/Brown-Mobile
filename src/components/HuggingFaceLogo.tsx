import React from 'react';
import { Image } from 'react-native';

const HF_LOGO = require('../../Assets/hf-logo.png');

interface HuggingFaceLogoProps {
  size?: number;
  style?: any;
}

export const HuggingFaceLogo: React.FC<HuggingFaceLogoProps> = ({ size = 22, style }) => {
  return (
    <Image
      source={HF_LOGO}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
};
