/**
 * Precise vs Approximate location. Android 12+ and iOS 14+ let a rider grant "Approximate"
 * (Android) or turn "Precise" off (iOS). The phone then reports a point snapped to a grid a mile
 * or two across, so a rider sitting next to you shows up a mile or more away and the Ride Bubble
 * calls them separated. Pure, no I/O.
 */

/** A fix this uncertain (meters) is an approximate one; GPS and Wi-Fi fixes are well under it. */
export const APPROXIMATE_M = 500;

/** The parts of expo-location's permission answer this needs. */
export type LocationPermissionInfo = {
  status: string;
  canAskAgain: boolean;
  ios?: { accuracy?: 'full' | 'reduced' } | null;
  android?: { accuracy?: 'fine' | 'coarse' | 'none' } | null;
};

/** Whether the phone gives this app only an approximate location. Unknown details count as precise. */
export function isApproximatePermission(p: LocationPermissionInfo | null | undefined): boolean {
  if (!p || p.status !== 'granted') return false;
  return p.android?.accuracy === 'coarse' || p.ios?.accuracy === 'reduced';
}

/**
 * Whether to ask Android again so the rider sees "Change to precise location". Only Android can
 * ask in the app (iOS needs Settings), only while the system will still show it, and only once per
 * app launch: asking pauses the app, and Ride Mode resumes sharing each time it comes back.
 */
export function shouldAskForPrecise(p: LocationPermissionInfo | null | undefined, os: string, askedThisLaunch: boolean): boolean {
  return os === 'android' && !askedThisLaunch && p?.android?.accuracy === 'coarse' && p.canAskAgain && p.status === 'granted';
}

/** Whether a shared fix is approximate, from the accuracy its phone reported (older rows have none). */
export function isApproximateFix(accuracyM: number | null | undefined): boolean {
  return accuracyM != null && Number.isFinite(accuracyM) && accuracyM >= APPROXIMATE_M;
}

/** How far off an approximate fix may be; precise fixes count as exact for spacing riders. */
export const fixUncertaintyM = (accuracyM: number | null | undefined): number =>
  isApproximateFix(accuracyM) ? (accuracyM as number) : 0;

/**
 * The distance two riders are certainly apart: the distance between their dots less how far off
 * an approximate dot may be. Two riders side by side, one on Approximate, read as together.
 */
export function certainGapM(distanceM: number, accuracyAM?: number | null, accuracyBM?: number | null): number {
  return Math.max(0, distanceM - fixUncertaintyM(accuracyAM) - fixUncertaintyM(accuracyBM));
}

/**
 * Whether to ask Android to turn on Google Location Accuracy (Android's "improve accuracy" dialog).
 * With it off the phone has no network provider, and a fix indoors or under trees can be miles off.
 * Once per app launch, for the same reason as `shouldAskForPrecise`.
 */
export function shouldAskForGoogleAccuracy(networkAvailable: boolean | null | undefined, os: string, askedThisLaunch: boolean): boolean {
  return os === 'android' && !askedThisLaunch && networkAvailable === false;
}

/** A fix of this own phone this uncertain (meters) gets the calibration tip; a good fix is under 50 m. */
export const ROUGH_FIX_M = 300;

export type LocationProblem = 'approximate' | 'google_accuracy_off' | 'rough_fix';

/**
 * What, if anything, keeps this phone's shared dot from being where the rider is, worst first:
 * the app only allowed an approximate location; Android's Google Location Accuracy is off; or the
 * phone reports its latest fix is rough (needs a clear sky or, on Android, a compass calibration).
 */
export function locationProblem(s: {
  approximate: boolean;
  /** Android's network provider (Google Location Accuracy); null where unknown or not Android. */
  networkAvailable: boolean | null;
  /** Accuracy of this phone's latest shared fix, meters, or null when not sharing. */
  ownAccuracyM: number | null | undefined;
}): LocationProblem | null {
  if (s.approximate) return 'approximate';
  if (s.networkAvailable === false) return 'google_accuracy_off';
  if (s.ownAccuracyM != null && Number.isFinite(s.ownAccuracyM) && s.ownAccuracyM >= ROUGH_FIX_M) return 'rough_fix';
  return null;
}

/** The Ride Mode banner for each problem, Title Case. */
export const LOCATION_PROBLEM_BANNER: Record<LocationProblem, string> = {
  approximate: 'Precise Location Is Off. Riders See You Up to a Few Miles Away. Tap to Turn It On',
  google_accuracy_off: 'Google Location Accuracy Is Off, So Your Dot Can Be Miles Off. Tap to Turn It On',
  rough_fix: 'Your Phone Has a Rough Location Right Now. Tap for How to Fix It',
};

/** Steps for a rough fix, shown when the rider taps that banner. */
export function roughFixTips(os: string): string {
  const common = 'Go outside or near a window with a clear view of the sky for a minute, and make sure Location is on.';
  if (os === 'android')
    return `${common} In Settings > Location > Location Services, turn on Google Location Accuracy. Then calibrate: open Google Maps, tap your blue dot and choose Calibrate, and follow the steps.`;
  return `${common} In Settings > Privacy & Security > Location Services > OnMyLead, keep Precise Location on. If the dot still wanders, open Settings > Privacy & Security > Location Services > System Services and turn on Compass Calibration.`;
}
