import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  screen: string;
  renderScreen: (route: string) => React.ReactNode;
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
  const generation = useRef(0);

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

    const fromOpacity = opacityFor(from, 1);
    const toOpacity = opacityFor(screen, 0);
    toOpacity.setValue(0);
    const token = ++generation.current;
    const animation = Animated.parallel([
      Animated.timing(fromOpacity, {
        toValue: 0,
        duration: DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(toOpacity, {
        toValue: 1,
        duration: DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }: { finished: boolean }) => {
      if (!finished || generation.current !== token) return;
      fromOpacity.setValue(0);
      toOpacity.setValue(1);
    });
    return () => {
      generation.current += 1;
      animation.stop();
    };
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
              {renderScreen(route)}
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
