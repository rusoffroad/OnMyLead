/**
 * Getting out of Map Mode and Ride Mode. Both screens have the same Exit button in the same place
 * (top left, and in the Full Map bar), the Android back button does the same, and the car screen
 * has one too. Exiting a screen never changes anything for the group: you stay on the ride, and
 * only Leave Ride takes you off it. So Exit only stops to ask when something keeps going after you
 * leave the screen (your location sharing in Ride Mode) or pauses (a recording in Map Mode).
 */
import { tc } from './i18n';

/** The words on the button. Same on both screens, so riders learn it once. */
export const EXIT_LABEL = 'Exit';

/** Where Exit goes: back to the screen you came from, or Home when Ride Mode or Map Mode was opened straight from a notification, a link or the car. */
export function exitTarget(canGoBack: boolean): 'back' | 'home' {
  return canGoBack ? 'back' : 'home';
}

/**
 * Ride Mode: exit straight away, or ask first. Sharing keeps going in the background after you
 * exit (that's what keeps you on the group's map), so the rider gets to choose to stop it. And the
 * Exit button is where a rider who's done with the ride looks for the way off it, so when they can
 * leave, the sheet opens to offer Leave Ride next to Exit (`canLeave`). The Android back gesture
 * (`viaBack`) stays quick: it only asks while sharing.
 */
export function rideExitAsks(sharing: boolean, canLeave = false, viaBack = false): boolean {
  return sharing || (canLeave && !viaBack);
}

export type RideExitPrompt = { title: string; message: string; keep: string; stop: string | null; stay: string; done: string };

/**
 * The Exit Ride Mode sheet. While sharing it asks whether the group keeps seeing you; either way
 * Leave Ride sits under the choices for riders who are done with the ride.
 */
export function rideExitPrompt(rideName: string, sharing = true): RideExitPrompt {
  return {
    title: tc('Exit Ride Mode?'),
    message: sharing
      ? tc('You stay on {rideName}, and the group keeps seeing your spot until your sharing ends. Come back any time from Home or the ride page.', { rideName })
      : tc('You stay on {rideName}. Come back any time from Home or the ride page.', { rideName }),
    keep: sharing ? tc('Exit and Keep Sharing') : tc('Exit Ride Mode'),
    stop: sharing ? tc('Stop Sharing and Exit') : null,
    stay: tc('Stay in Ride Mode'),
    done: tc('Done with this ride? Leaving takes you off it for good.'),
  };
}

export type MapExitPrompt = { title: string; message: string; confirm: string; stay: string };

/**
 * Map Mode: a recording that's running pauses when you exit (it's saved, and picks back up paused
 * the next time you open Map Mode), so ask. Paused or not recording: exit straight away.
 */
export function mapExitPrompt(recording: { paused: boolean } | null): MapExitPrompt | null {
  if (!recording || recording.paused) return null;
  return {
    title: tc('Exit Map Mode?'),
    message: tc('Your recording pauses while you’re out of Map Mode. It’s saved, and you can resume it when you come back.'),
    confirm: tc('Pause and Exit'),
    stay: tc('Stay in Map Mode'),
  };
}

/**
 * The Android back button: first it undoes what's covering the map (Full Map, an open search),
 * then it's Exit.
 */
export function backPress(s: { fullMap: boolean; searching?: boolean }): 'close_full_map' | 'close_search' | 'exit' {
  if (s.fullMap) return 'close_full_map';
  if (s.searching) return 'close_search';
  return 'exit';
}
