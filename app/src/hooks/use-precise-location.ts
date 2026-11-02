import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { locationProblem, roughFixTips, type LocationProblem } from '@/core/precise-location';
import { showNotice } from '@/lib/confirm';
import { askForGoogleAccuracy, askForPreciseLocation, googleAccuracyOn, hasApproximateLocation } from '@/lib/location';

/**
 * What keeps this phone's dot from being where the rider is (see core/precise-location), checked
 * when the screen opens and each time the app comes back (from Settings or a system prompt).
 * `fix` runs the remedy: Android's precise or Google Location Accuracy prompt, Settings, or tips.
 * @param ownAccuracyM accuracy of this phone's latest shared fix, meters.
 */
export function usePreciseLocation(ownAccuracyM: number | null | undefined) {
  const [approximate, setApproximate] = useState(false);
  const [networkAvailable, setNetworkAvailable] = useState<boolean | null>(null);

  const check = useCallback(() => {
    hasApproximateLocation().then(setApproximate, () => {});
    googleAccuracyOn().then(setNetworkAvailable, () => {});
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  // A browser's fix is often rough on a computer and has no fix to offer, so the web shows no tip.
  const problem: LocationProblem | null = locationProblem({
    approximate,
    networkAvailable,
    ownAccuracyM: Platform.OS === 'web' ? null : ownAccuracyM,
  });

  const fix = useCallback(async () => {
    if (problem === 'approximate') await askForPreciseLocation();
    else if (problem === 'google_accuracy_off') await askForGoogleAccuracy();
    else if (problem === 'rough_fix') showNotice('Get a Sharper Location', roughFixTips(Platform.OS));
    check();
  }, [problem, check]);

  return { problem, fix };
}
