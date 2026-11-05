import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Urgent screens (the Crash Alert countdown) over sheets like Map Settings. iPhone and iPad can't
 * show a second sheet over one already up, so while an urgent screen is waiting, any open sheet
 * closes itself, and the urgent screen shows once the sheet has finished closing. Elsewhere it
 * shows at once.
 */
const ONE_SHEET_AT_A_TIME = Platform.OS === 'ios';

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
      urgent--;
      emit();
    };
  }, []);
  const up = useSyncExternalStore(subscribe, () => sheetsUp, () => sheetsUp);
  return !ONE_SHEET_AT_A_TIME || up === 0;
}

/**
 * For a sheet: whether it should close for an urgent screen. Only on iPhone and iPad; elsewhere
 * the urgent screen shows over the sheet, which stays as it was (and keeps what the rider typed).
 */
export function useUrgentWaiting(): boolean {
  const waiting = useSyncExternalStore(subscribe, () => urgent > 0, () => urgent > 0);
  return ONE_SHEET_AT_A_TIME && waiting;
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
  useEffect(() => down, []);
  return () => {
    if (!visible) down();
  };
}
