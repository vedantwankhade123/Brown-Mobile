import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { animateOnce } from '../utils/motion';
import { useReducedMotion } from '../utils/useReducedMotion';
interface Props {
  screen: string;
  renderScreen: (route: string, active: boolean) => React.ReactNode;
}
// Keep the opaque base until the incoming layer covers it, including interrupted transitions.
export const ScreenTransition: React.FC<Props> = ({ screen, renderScreen }) => {
  const [visited, setVisited] = useState<string[]>([screen]);
  const [settledScreen, setSettledScreen] = useState(screen);
  const previous = useRef(screen);
  const values = useRef<Record<string, InstanceType<typeof Animated.Value>>>({});
  const generation = useRef(0);
  const reduced = useReducedMotion();
  const changing = settledScreen !== screen;
  const routes = visited[visited.length - 1] === screen ? visited : [...visited.filter(route => route !== screen), screen];
  if (routes !== visited) setVisited(routes);
  routes.forEach(route => { if (!values.current[route]) values.current[route] = new Animated.Value(route === previous.current ? 1 : 0); });
  useEffect(() => {
    if (previous.current === screen && generation.current === 0) return;
    const token = ++generation.current;
    previous.current = screen;
    const finish = () => {
      if (token !== generation.current) return;
      values.current[screen].setValue(1);
      Object.entries(values.current).forEach(([route, value]) => { if (route !== screen) value.setValue(0); });
      setSettledScreen(screen);
    };
    if (reduced) {
      finish();
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(values.current[screen], { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    animateOnce(animation, 200, finish);
    return () => { ++generation.current; animation.stop(); };
  }, [screen, reduced]);
  return <View style={styles.container}>
    {routes.map((route, index) => {
      const active = route === screen;
      return <Animated.View key={route} style={[StyleSheet.absoluteFill, { opacity: values.current[route], display: active || changing ? 'flex' : 'none', zIndex: index }]}
        pointerEvents={active ? 'auto' : 'none'} accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
        <SafeAreaView edges={route === 'chat' || route === 'onboarding' ? [] : ['bottom']} style={styles.surface}>
          {renderScreen(route, active)}
        </SafeAreaView>
      </Animated.View>;
    })}
  </View>;
};
const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden' }, surface: { flex: 1, backgroundColor: '#000000' } });
