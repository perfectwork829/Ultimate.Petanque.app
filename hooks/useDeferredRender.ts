/**
 * useDeferredRender — Defers heavy content rendering until after navigation animations complete.
 * Uses InteractionManager on native, setTimeout on web.
 */
import { useState, useEffect } from 'react';
import { InteractionManager, Platform } from 'react-native';

export function useDeferredRender(delayMs: number = 0): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web: use setTimeout since InteractionManager is a no-op
      const timer = setTimeout(() => setReady(true), delayMs || 50);
      return () => clearTimeout(timer);
    }

    // Native: wait for animations to complete, then optionally delay
    const task = InteractionManager.runAfterInteractions(() => {
      if (delayMs > 0) {
        setTimeout(() => setReady(true), delayMs);
      } else {
        setReady(true);
      }
    });

    return () => task.cancel();
  }, [delayMs]);

  return ready;
}
