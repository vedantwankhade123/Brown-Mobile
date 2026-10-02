import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * Bottom inset to reserve for the soft keyboard.
 *
 * The window keeps its full height while the IME is open (the system nav bar draws over the
 * content), so `adjustResize` never shrinks the layout and every bottom-anchored field ends up
 * under the keyboard. React Native still reports the IME frame here because on API 30+ it reads
 * the inset instead of measuring a resize.
 *
 * @param navBarInset how much of the view's own bottom edge sits behind the system nav bar;
 *                    pass 0 when the screen already ends inside a SafeAreaView.
 */
export function useKeyboardInset(navBarInset: number): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const max = Dimensions.get('window').height - 140;
    const shown = Keyboard.addListener('keyboardDidShow', (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      setInset(height > 0 ? Math.min(height + navBarInset, max) : 0);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [navBarInset]);

  return inset;
}
