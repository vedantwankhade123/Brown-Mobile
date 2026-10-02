import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

// Transparent by default so the screen background continues behind system controls.
// Full-screen overlays can temporarily claim an opaque surface.
let current = 'transparent';

function apply(color: string) {
  current = color;
  if (Platform.OS !== 'android') return;
  NavigationBar.setBackgroundColorAsync(color).catch(() => {});
}

export function setNavBarColor(color: string): void {
  apply(color);
}

/** Tints the bar for an overlay and restores the owner's color on teardown. */
export function pushNavBarColor(color: string): () => void {
  const previous = current;
  apply(color);
  return () => {
    // Only restore if nobody else claimed the bar in the meantime.
    if (current === color) apply(previous);
  };
}
