import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { HuggingFaceLogo } from './HuggingFaceLogo';

const LOGO_GEMINI = require('../../Assets/gemini-logo.png');
const LOGO_OLLAMA = require('../../Assets/ollama-logo.png');
const LOGO_DEEPSEEK = require('../../Assets/deepseek-blue-logo.png');
const LOGO_CLAUDE = require('../../Assets/claude-logo.png');
const LOGO_OPENAI = require('../../Assets/openai-black-logo.png');
const LOGO_GROQ = require('../../Assets/groq-black-logo.png');
const LOGO_VLLM = require('../../Assets/vllm-color.png');
const LOGO_OPENROUTER = require('../../Assets/openrouter-black-logo.png');
const LOGO_LMSTUDIO = require('../../Assets/lm-studio.png');

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

  const radius = Math.max(4, Math.round(size * 0.25));
  const innerSize = Math.max(size - 4, 12);

  if (
    prov === 'custom' ||
    prov === 'openrouter' ||
    name.includes('custom') ||
    name.includes('openrouter') ||
    name.includes('lm studio') ||
    name.includes('vllm')
  ) {
    // 3 stacked logos: vLLM, OpenRouter, LM Studio
    const singleSize = Math.round(size * 0.88);
    const overlap = Math.round(singleSize * 0.38);
    return (
      <View style={[styles.stackedContainer, { height: size }]}>
        <View style={[styles.whiteBgBadge, { width: singleSize, height: singleSize, borderRadius: radius, zIndex: 3 }]}>
          <Image source={LOGO_VLLM} style={{ width: singleSize - 4, height: singleSize - 4 }} resizeMode="contain" />
        </View>
        <View style={[styles.whiteBgBadge, { width: singleSize, height: singleSize, borderRadius: radius, marginLeft: -overlap, zIndex: 2 }]}>
          <Image source={LOGO_OPENROUTER} style={{ width: singleSize - 4, height: singleSize - 4 }} resizeMode="contain" />
        </View>
        <View style={[styles.whiteBgBadge, { width: singleSize, height: singleSize, borderRadius: radius, marginLeft: -overlap, zIndex: 1 }]}>
          <Image source={LOGO_LMSTUDIO} style={{ width: singleSize - 4, height: singleSize - 4 }} resizeMode="contain" />
        </View>
      </View>
    );
  }

  if (prov === 'gemini' || name.includes('gemini') || name.includes('gemma')) {
    return (
      <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
        <Image source={LOGO_GEMINI} style={{ width: innerSize, height: innerSize }} resizeMode="contain" />
      </View>
    );
  }

  if (prov === 'deepseek' || name.includes('deepseek')) {
    return (
      <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
        <Image source={LOGO_DEEPSEEK} style={{ width: innerSize, height: innerSize }} resizeMode="contain" />
      </View>
    );
  }

  if (prov === 'anthropic' || prov === 'claude' || name.includes('claude')) {
    return (
      <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
        <Image source={LOGO_CLAUDE} style={{ width: innerSize, height: innerSize }} resizeMode="contain" />
      </View>
    );
  }

  if (
    prov === 'openai' ||
    name.includes('gpt') ||
    name.includes('o1') ||
    name.includes('o3') ||
    name.includes('o4') ||
    name.includes('chatgpt')
  ) {
    return (
      <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
        <Image source={LOGO_OPENAI} style={{ width: innerSize, height: innerSize }} resizeMode="contain" />
      </View>
    );
  }

  if (
    prov === 'groq' ||
    prov === 'grok' ||
    name.includes('(groq)') ||
    name.includes('groq') ||
    name.includes('grok')
  ) {
    return (
      <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
        <Image source={LOGO_GROQ} style={{ width: innerSize, height: innerSize }} resizeMode="contain" />
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
      <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
        <Image source={LOGO_OLLAMA} style={{ width: innerSize, height: innerSize }} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.whiteBgContainer, { width: size, height: size, borderRadius: radius }]}>
      <HuggingFaceLogo size={innerSize} />
    </View>
  );
};

const styles = StyleSheet.create({
  whiteBgContainer: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  stackedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  whiteBgBadge: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
});
