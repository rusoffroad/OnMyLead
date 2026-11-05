import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Urgent screens (the Crash Alert countdown) over sheets like Map Settings. While an urgent screen
 * is up, every sheet steps out of the way (hidden, not closed: it comes back as it was afterwards),
 * so nothing can cover the urgent screen. iPhone and iPad can't show a second sheet over one
 * already up, so there the urgent screen shows once the sheet has finished hiding; elsewhere at
 * once.
 */
const ONE_SHEET_AT_A_TIME = Platform.OS === 'ios';
/** How long iPhone and iPad take to finish taking a Modal off screen once it's gone (ms). */
const LEAVING_MS = 600;
/** On iPhone and iPad, run `f` once a Modal that just went away has finished leaving the screen. */
function afterLeaving(f: () => void): void {
  if (ONE_SHEET_AT_A_TIME) setTimeout(f, LEAVING_MS);
  else f();
}

let urgent = 0;
let sheetsUp = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** For an urgent screen: true once it can show (no sheet is still up on iPhone and iPad). */
export function useUrgentModal(): boolean {
  useEffect(() => {
    urgent++;
    emit();
    return () => {
      // Sheets come back only once the urgent screen has left the screen (iPhone and iPad).
      afterLeaving(() => {
        urgent--;
        emit();
      });
    };
  }, []);
  const up = useSyncExternalStore(subscribe, () => sheetsUp, () => sheetsUp);
  return !ONE_SHEET_AT_A_TIME || up === 0;
}

/** For a sheet: whether an urgent screen is up (the sheet hides until it's gone). */
export function useUrgentWaiting(): boolean {
  return useSyncExternalStore(subscribe, () => urgent > 0, () => urgent > 0);
}

/**
 * For a sheet: counts it as up while `visible`, until it has finished closing. Call the returned
 * function from the Modal's onDismiss (iPhone and iPad report when the close animation is done).
 */
export function useSheetUp(visible: boolean): () => void {
  const counted = useRef(false);
  const up = () => {
    if (counted.current) return;
    counted.current = true;
    sheetsUp++;
    emit();
  };
  const down = () => {
    if (!counted.current) return;
    counted.current = false;
    sheetsUp--;
    emit();
  };
  useEffect(() => {
    if (visible) {
      up();
      return;
    }
    if (!ONE_SHEET_AT_A_TIME) {
      down();
      return;
    }
    // iPhone and iPad: onDismiss reports the end of the close; in case it never comes, give up
    // waiting well after the close animation (about 0.3 s) would have finished, even on a busy phone.
    const t = setTimeout(down, 1500);
    return () => clearTimeout(t);
  }, [visible]);
  // A sheet taken away while up still needs a moment to leave the screen (iPhone and iPad).
  useEffect(() => () => afterLeaving(down), []);
  return () => {
    if (!visible) down();
  };
}
