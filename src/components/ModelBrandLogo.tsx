import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { HuggingFaceLogo } from './HuggingFaceLogo';

const LOGO_GEMINI = require('../../Assets/gemini-logo.png');
const LOGO_OLLAMA = require('../../Assets/ollama-white-logo.png');
const LOGO_DEEPSEEK = require('../../Assets/deepseek-blue-logo.png');
const LOGO_CLAUDE = require('../../Assets/claude-logo.png');
const LOGO_OPENAI = require('../../Assets/openai-white-logo.png');

interface ModelBrandLogoProps {
  modelName?: string;
  provider?: string;
  size?: number;
}

export const ModelBrandLogo: React.FC<ModelBrandLogoProps> = ({
  modelName = '',
  provider = '',
  size = 22,
}) => {
  const name = (modelName || '').toLowerCase();
  const prov = (provider || '').toLowerCase();

  if (prov === 'gemini' || name.includes('gemini') || name.includes('gemma')) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image source={LOGO_GEMINI} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  if (prov === 'deepseek' || name.includes('deepseek')) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image source={LOGO_DEEPSEEK} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  if (prov === 'anthropic' || prov === 'claude' || name.includes('claude')) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image source={LOGO_CLAUDE} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  if (
    prov === 'openai' ||
    name.includes('gpt') ||
    name.includes('o1') ||
    name.includes('o3') ||
    name.includes('chatgpt')
  ) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image source={LOGO_OPENAI} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  if (
    prov === 'ollama' ||
    name.includes('ollama') ||
    name.includes(':latest') ||
    name.includes('phi') ||
    name.includes('llava') ||
    name.includes('mistral') ||
    name.includes('llama') ||
    name.includes('qwen')
  ) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image source={LOGO_OLLAMA} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <HuggingFaceLogo size={size} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
