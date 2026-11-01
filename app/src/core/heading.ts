import { MOVING_SPEED_MPS } from './bubble';

/**
 * Which way a rider is heading, for the arrow on their map dot, or null for no arrow.
 *
 * Phones only know a direction from GPS while they move: iPhones send -1 and Android phones often
 * send 0 (due north) when they're standing still. So a direction counts only while the rider is
 * moving faster than a walk (about 4 mph) and the fix is live; a parked rider shows a plain dot rather
 * than an arrow pointing a made-up way.
 */
export function riderHeading(fix: { speedMps?: number | null; headingDeg?: number | null } | null | undefined, live: boolean): number | null {
  if (!live || !fix) return null;
  const { speedMps, headingDeg } = fix;
  if (headingDeg == null || !Number.isFinite(headingDeg) || headingDeg < 0) return null;
  if (speedMps == null || !(speedMps >= MOVING_SPEED_MPS)) return null;
  return ((headingDeg % 360) + 360) % 360;
}

/**
 * The arrow's angle on screen, in degrees clockwise from straight up: the rider's compass heading
 * less the way the map is turned, so the arrow stays true when the map is rotated.
 */
export function screenAngle(headingDeg: number, mapHeadingDeg: number | null | undefined): number {
  const a = headingDeg - (mapHeadingDeg ?? 0);
  return ((a % 360) + 360) % 360;
}
