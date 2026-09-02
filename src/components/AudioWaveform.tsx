import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface AudioWaveformProps {
  isActive: boolean;
  barCount?: number;
  barColor?: string;
  maxHeight?: number;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive,
  barCount = 9,
  barColor,
  maxHeight = 24,
}) => {
  const minH = Math.max(4, Math.round(maxHeight * 0.25));
  const [heights, setHeights] = useState<number[]>(new Array(barCount).fill(minH));

  useEffect(() => {
    if (!isActive) {
      setHeights(new Array(barCount).fill(minH));
      return;
    }

    const interval = setInterval(() => {
      setHeights(
        Array.from({ length: barCount }, () => Math.floor(Math.random() * (maxHeight - minH)) + minH)
      );
    }, 120);

    return () => clearInterval(interval);
  }, [isActive, barCount, maxHeight, minH]);

  return (
    <View style={[styles.container, { height: maxHeight }]}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: barColor || (isActive ? colors.primary : colors.textGhost),
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: 4,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
});
