import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
interface Props {
  screen: string;
  renderScreen: (route: string, active: boolean) => React.ReactNode;
}
// Visibility follows navigation state; delayed animations cannot hide an active route.
export const ScreenTransition: React.FC<Props> = ({ screen, renderScreen }) => {
  const [visited, setVisited] = useState<string[]>([screen]);
  const routes = visited.includes(screen) ? visited : [...visited, screen];
  if (routes !== visited) setVisited(routes);
  return <View style={styles.container}>
    {routes.map(route => {
      const active = route === screen;
      return <View key={route} style={[StyleSheet.absoluteFill, { display: active ? 'flex' : 'none' }]}
        pointerEvents={active ? 'auto' : 'none'} accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
        <SafeAreaView edges={route === 'chat' ? [] : ['bottom']} style={styles.surface}>
          {renderScreen(route, active)}
        </SafeAreaView>
      </View>;
    })}
  </View>;
};
const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden' }, surface: { flex: 1, backgroundColor: '#000000' } });
