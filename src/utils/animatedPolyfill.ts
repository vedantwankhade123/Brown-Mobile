import { Animated } from 'react-native';

/**
 * Polyfill for Hermes / React Native Animated _tracking bug.
 * On Hermes engine with React Native, assigning `this._tracking = tracking` or `this._tracking = null`
 * can throw `TypeError: Cannot add new property '_tracking'` when AnimatedValue instances
 * are sealed, non-extensible, or created without `_tracking` initialized on the instance.
 * By defining `_tracking` on `Animated.Value.prototype` backed by a WeakMap, any assignment to
 * `this._tracking` invokes the prototype setter rather than attempting to define a new own property,
 * preventing Hermes from throwing `Cannot add new property '_tracking'`.
 */
export function installAnimatedTrackingPatch(): void {
  try {
    if (Animated && Animated.Value) {
      const trackingMap = new WeakMap<object, any>();
      const existingDesc = Object.getOwnPropertyDescriptor(Animated.Value.prototype, '_tracking');
      if (!existingDesc || existingDesc.configurable) {
        Object.defineProperty(Animated.Value.prototype, '_tracking', {
          get() {
            return trackingMap.get(this) ?? null;
          },
          set(val: any) {
            trackingMap.set(this, val);
          },
          configurable: true,
          enumerable: false,
        });
      }
    }
  } catch (err) {
    console.warn('[animatedPolyfill] Failed to install Animated._tracking patch:', err);
  }
}

// Automatically install immediately on module load
installAnimatedTrackingPatch();
