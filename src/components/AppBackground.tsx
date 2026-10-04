import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Chat variant is intentionally pure black — it renders nothing and lets the ChatScreen
 * container (#000000) show through. The sidebar variant keeps the reference gradient
 * image plus a black strip so it stops above the system bar.
 */
export const AppBackground: React.FC<{ variant?: 'chat' | 'sidebar' }> = ({ variant = 'chat' }) => {
  const insets = useSafeAreaInsets();
  if (variant === 'chat') {
    return null;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={require('../../Assets/chat-background.png')}
        resizeMode="stretch"
        style={StyleSheet.absoluteFill}
        accessible={false}
        fadeDuration={0}
      />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: insets.bottom, backgroundColor: '#000000' }} />
    </View>
  );
};
