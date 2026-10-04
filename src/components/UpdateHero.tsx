import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

interface UpdateHeroProps {
  height?: number;
  /** Renders the hood mark in the middle of the arc — off for compact placements */
  showMark?: boolean;
}

/**
 * Brand artwork for the update screens: a download arc orbiting the Brown mark.
 * Vector so it stays crisp on every density and needs no bundled PNG.
 */
export const UpdateHero: React.FC<UpdateHeroProps> = ({ height = 168, showMark = true }) => (
  <View style={[styles.frame, { height }]}>
    <Svg viewBox="0 0 320 168" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="heroBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#131c33" />
          <Stop offset="0.55" stopColor="#0e1220" />
          <Stop offset="1" stopColor="#0a0b0f" />
        </LinearGradient>
        <RadialGradient id="heroGlow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#295294" stopOpacity="0.85" />
          <Stop offset="0.6" stopColor="#1b3357" stopOpacity="0" />
          <Stop offset="1" stopColor="#295294" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="heroArc" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#295294" />
          <Stop offset="0.5" stopColor="#60a5fa" />
          <Stop offset="1" stopColor="#dbeafe" />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width="320" height="168" rx="0" fill="url(#heroBg)" />
      <Ellipse cx="160" cy="150" rx="150" ry="62" fill="url(#heroGlow)" opacity="0.55" />

      {/* dotted grid, upper left */}
      <G fill="#93c5fd" opacity="0.22">
        {[0, 1, 2, 3, 4].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <Circle key={`g${row}-${col}`} cx={22 + col * 11} cy={26 + row * 11} r="1.4" />
          ))
        )}
      </G>

      {/* orbit rings */}
      <Circle cx="160" cy="84" r="60" stroke="#2a3a55" strokeWidth="1" fill="none" opacity="0.5" />
      <Circle cx="160" cy="84" r="46" stroke="#3b5c92" strokeWidth="1" fill="none" opacity="0.45" />

      {/* the download arc: 270° sweep around the mark, arrow head pointing onward at the top */}
      <Path
        d="M100 84 A60 60 0 1 0 160 24"
        stroke="url(#heroArc)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M168 17 L160 24 L168 31"
        stroke="#dbeafe"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* confetti accents, Samsung-style */}
      <G>
        <Circle cx="252" cy="44" r="9" fill="#60a5fa" opacity="0.9" />
        <Circle cx="276" cy="96" r="5" fill="#dbeafe" opacity="0.75" />
        <Circle cx="58" cy="112" r="6.5" fill="#295294" />
        <G transform="rotate(18 84 40)">
          <Rect x="76" y="32" width="16" height="16" rx="5" fill="#93c5fd" opacity="0.85" />
        </G>
        <G transform="rotate(-14 236 128)">
          <Rect x="228" y="120" width="17" height="17" rx="6" stroke="#dbeafe" strokeWidth="2" fill="none" opacity="0.6" />
        </G>
        <Path d="M296 52 l0 14 M289 59 l14 0" stroke="#dbeafe" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
        <Path d="M30 74 l0 12 M24 80 l12 0" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
      </G>
    </Svg>

    {showMark ? (
      <View style={styles.markWrap}>
        <Image source={require('../../Assets/browny_white.png')} style={styles.mark} resizeMode="contain" />
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0e1220',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 52,
    height: 50,
  },
});
