import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface AudioWaveformProps {
  isActive: boolean;
  barCount?: number;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive,
  barCount = 9,
}) => {
  const [heights, setHeights] = useState<number[]>(new Array(barCount).fill(6));

  useEffect(() => {
    if (!isActive) {
      setHeights(new Array(barCount).fill(6));
      return;
    }

    const interval = setInterval(() => {
      setHeights(
        Array.from({ length: barCount }, () => Math.floor(Math.random() * 24) + 6)
      );
    }, 120);

    return () => clearInterval(interval);
  }, [isActive, barCount]);

  return (
    <View style={styles.container}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: isActive ? colors.primary : colors.textGhost,
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
