import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { revealValues } from '../utils/motion';

interface Props {
  screen: string;
  renderScreen: (route: string, active: boolean) => React.ReactNode;
}

const DURATION = 220;

type AnimatedValue = InstanceType<typeof Animated.Value>;

/**
 * Every screen stays mounted after its first visit and inactive ones rest at
 * opacity 0, so a navigation cross-fades between two already-painted surfaces
 * instead of mounting a fresh screen mid-transition (that first paint is what
 * flashed black for a frame).
 */
export const ScreenTransition: React.FC<Props> = ({ screen, renderScreen }) => {
  const [visited, setVisited] = useState<string[]>([screen]);
  const activeRef = useRef(screen);
  const opacities = useRef(new Map<string, AnimatedValue>());

  const opacityFor = (route: string, initial: number): AnimatedValue => {
    let value = opacities.current.get(route);
    if (!value) {
      value = new Animated.Value(initial);
      opacities.current.set(route, value);
    }
    return value;
  };

  if (!visited.includes(screen)) {
    // Land on 0 before the first paint of the new screen, then the effect fades it in.
    opacityFor(screen, 0);
    setVisited((prev) => [...prev, screen]);
  }

  useEffect(() => {
    const from = activeRef.current;
    if (from === screen) return;
    activeRef.current = screen;

    const duration = from === 'onboarding' && screen === 'chat' ? 320 : DURATION;
    const fromOpacity = opacityFor(from, 1);
    const toOpacity = opacityFor(screen, 0);

    // Both fades go through revealValues so the end state is forced even if the
    // animation is interrupted: a stopped native-driver cross-fade used to leave the
    // incoming surface pinned at opacity 0 over the black container — a black screen.
    revealValues([{ value: toOpacity, from: 0, to: 1 }], duration, undefined, false);
    revealValues([{ value: fromOpacity, from: 1, to: 0 }], duration, undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  return (
    <View style={styles.container}>
      {visited.map((route) => {
        const active = route === screen;
        return (
          <Animated.View
            key={route}
            style={[StyleSheet.absoluteFill, { opacity: opacityFor(route, active ? 1 : 0) }]}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
          >
            <SafeAreaView edges={route === 'chat' ? [] : ['bottom']} style={styles.surface}>
              {renderScreen(route, active)}
            </SafeAreaView>
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  surface: { flex: 1, backgroundColor: '#000000' },
});
