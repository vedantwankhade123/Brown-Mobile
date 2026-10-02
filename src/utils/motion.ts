import { Animated, Easing } from 'react-native';

/**
 * Transition animations here also carry state changes (which view to show, whether the
 * drawer is mounted). When the native driver drops an end event — interrupted animation,
 * view recycled, app backgrounded mid-flight — the JS callback never runs and the UI is
 * left stuck at its start values, which reads as a black screen or an un-closable panel.
 * These helpers guarantee the completion callback runs exactly once, and that reveal
 * animations always land visible.
 */

const SAFETY_MARGIN_MS = 260;

// Derived from the runtime values instead of the `Animated` namespace: the namespace is
// not reachable as a type through the react-native barrel in this RN version.
type Animatable = InstanceType<typeof Animated.Value>;
type Animation = ReturnType<typeof Animated.parallel>;
type Composite = Animation | Animation[];

function compositeOf(input: Composite): Animation {
  return Array.isArray(input) ? Animated.parallel(input) : input;
}

/** Start an animation; `done` fires once, either on completion or on the safety timeout. */
export function animateOnce(
  input: Composite,
  durationMs: number,
  done?: () => void
): void {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    timer = null;
    done?.();
  };
  timer = setTimeout(finish, durationMs + SAFETY_MARGIN_MS);
  try {
    compositeOf(input).start(finish);
  } catch (err) {
    console.warn('[motion] animation failed to start:', err);
    finish();
  }
}

/**
 * Enter reveal. The values are forced to their end state if the animation is lost, so a
 * screen can never remain invisible. Call from a mount (or view-change) effect.
 */
export function revealValues(
  targets: Array<{ value: Animatable; from: number; to: number }>,
  durationMs: number,
  easing: (t: number) => number = Easing.out(Easing.cubic),
  nativeDriver = true
): void {
  try {
    targets.forEach((t) => t.value.setValue(t.from));
  } catch (err) {
    // Values may already be detached; land them visible and bail out.
    targets.forEach((t) => {
      try {
        t.value.setValue(t.to);
      } catch {}
    });
    return;
  }

  const anims = targets.map((t) =>
    Animated.timing(t.value, {
      toValue: t.to,
      duration: durationMs,
      easing,
      useNativeDriver: nativeDriver,
    })
  );

  animateOnce(anims, durationMs, () => {
    targets.forEach((t) => {
      try {
        t.value.setValue(t.to);
      } catch {}
    });
  });
}

/** The same guarantee for a single Animated.Value. */
export function revealValue(
  value: Animatable,
  from: number,
  to: number,
  durationMs = 200,
  nativeDriver = true
): void {
  revealValues([{ value, from, to }], durationMs, undefined, nativeDriver);
}
