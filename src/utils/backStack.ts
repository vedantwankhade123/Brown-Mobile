import { useEffect, useRef } from 'react';

type BackConsumer = () => boolean;

const layers: BackConsumer[] = [];

/**
 * The app keeps its own screen stack, so Android's back button has to be resolved in one
 * place: overlays first (drawer, scanner, sheet), then the screen stack, then let the
 * system exit the app. Each overlay registers itself while it is open; the newest owner
 * wins, matching how the user perceives what is on top.
 */
export function consumeBackPress(): boolean {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    try {
      if (layers[i]()) return true;
    } catch (err) {
      console.warn('[backStack] consumer threw:', err);
    }
  }
  return false;
}

/** Register `onBack` while `active` is true. Return true from `onBack` to swallow the press. */
export function useBackLayer(active: boolean, onBack: () => boolean): void {
  const handler = useRef(onBack);
  handler.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    const consumer: BackConsumer = () => handler.current();
    layers.push(consumer);
    return () => {
      const index = layers.indexOf(consumer);
      if (index >= 0) layers.splice(index, 1);
    };
  }, [active]);
}
