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
/** The Crash Alert countdown: it comes before every other urgent screen (the Emergency Siren). */
let critical = 0;
/** Lesser urgent screens (the siren) on screen, which the countdown waits for on iPhone and iPad. */
let lesserUp = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Whether the Crash Alert countdown is up (the siren stays quiet for it, lib/siren). */
export function criticalUrgentUp(): boolean {
  return critical > 0;
}

/** Listens to urgent screens and sheets coming and going. */
export function onUrgentChange(l: () => void): () => void {
  return subscribe(l);
}

/**
 * For an urgent screen: true once it can show (no sheet is still up on iPhone and iPad). The
 * critical one (the Crash Alert countdown) also waits for a lesser urgent screen (the siren) to
 * step aside; a lesser one is shown with useLesserUrgentShown.
 */
export function useUrgentModal(opts: { critical?: boolean } = {}): boolean {
  const isCritical = !!opts.critical;
  useEffect(() => {
    urgent++;
    if (isCritical) critical++;
    emit();
    return () => {
      // Sheets come back only once the urgent screen has left the screen (iPhone and iPad).
      afterLeaving(() => {
        urgent--;
        if (isCritical) critical--;
        emit();
      });
    };
  }, [isCritical]);
  const up = useSyncExternalStore(subscribe, () => sheetsUp + (isCritical ? lesserUp : 0), () => sheetsUp + (isCritical ? lesserUp : 0));
  return !ONE_SHEET_AT_A_TIME || up === 0;
}

/**
 * For a lesser urgent screen (the Emergency Siren): whether to show it now, and the function for
 * its Modal's onDismiss. It steps aside while the Crash Alert countdown is up, and comes back after.
 */
export function useLesserUrgentShown(): [boolean, () => void] {
  const ready = useUrgentModal();
  const blocked = useSyncExternalStore(subscribe, () => critical > 0, () => critical > 0);
  const shown = ready && !blocked;
  const dismissed = useSheetUp(shown, 'lesser');
  return [shown, dismissed];
}

/** For a sheet: whether an urgent screen is up (the sheet hides until it's gone). */
export function useUrgentWaiting(): boolean {
  return useSyncExternalStore(subscribe, () => urgent > 0, () => urgent > 0);
}

function countUp(lesser: boolean, n: number) {
  if (lesser) lesserUp += n;
  else sheetsUp += n;
  emit();
}

/**
 * For a sheet: counts it as up while `visible`, until it has finished closing. Call the returned
 * function from the Modal's onDismiss (iPhone and iPad report when the close animation is done).
 */
export function useSheetUp(visible: boolean, kind: 'sheet' | 'lesser' = 'sheet'): () => void {
  const counted = useRef(false);
  const lesser = useRef(kind === 'lesser');
  const up = () => {
    if (counted.current) return;
    counted.current = true;
    countUp(lesser.current, 1);
  };
  const down = () => {
    if (!counted.current) return;
    counted.current = false;
    countUp(lesser.current, -1);
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
    // A sheet that was never up has nothing to wait for.
    if (!counted.current) return;
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
