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
