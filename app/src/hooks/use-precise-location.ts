import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { askForPreciseLocation, hasApproximateLocation } from '@/lib/location';

/**
 * Whether this phone only lets the app have an approximate location, checked when the screen
 * opens and each time the app comes back (from Settings, or from Android's precise prompt).
 * `fix` asks for Precise Location (Android) or opens Settings (iPhone and iPad).
 */
export function usePreciseLocation() {
  const [approximate, setApproximate] = useState(false);

  const check = useCallback(() => {
    hasApproximateLocation().then(setApproximate, () => {});
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const fix = useCallback(async () => {
    await askForPreciseLocation();
    check();
  }, [check]);

  return { approximate, fix };
}
