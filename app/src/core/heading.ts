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

/** This phone's own spot and arrow, from the map's location dot (or the phone's location watch). */
export type OwnFix = { lat: number; lng: number; headingDeg: number | null; /** The fix's own time (ms), when the phone gives one. */ atMs?: number };

/**
 * The phone's own fix as the map's blue dot reports it (react-native-maps onUserLocationChange:
 * iPhone and iPad send the GPS course, Android the bearing). iOS and Android draw that dot
 * themselves without any arrow, so OnMyLead adds its own arrow on top, by the same rule as every
 * other rider: only while moving faster than a walk.
 */
export function ownFix(
  c: { latitude?: number | null; longitude?: number | null; speed?: number | null; heading?: number | null; timestamp?: number | null } | null | undefined,
): OwnFix | null {
  if (!c || c.latitude == null || c.longitude == null || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  const f: OwnFix = { lat: c.latitude, lng: c.longitude, headingDeg: riderHeading({ speedMps: c.speed, headingDeg: c.heading }, true) };
  if (c.timestamp != null && Number.isFinite(c.timestamp)) f.atMs = c.timestamp;
  return f;
}

/**
 * The arrow on this phone's own dot, which always shows (2.1): the GPS course while moving faster
 * than a walk, else the phone's compass (the way the phone faces), else the last course it had.
 * `moving` tells the dot to draw its long beam rather than the short one.
 */
export function ownArrow(
  fix: { speedMps?: number | null; headingDeg?: number | null } | null | undefined,
  compassDeg: number | null | undefined,
  lastCourseDeg: number | null | undefined,
): { deg: number | null; moving: boolean } {
  const course = riderHeading(fix, true);
  if (course != null) return { deg: course, moving: true };
  if (compassDeg != null && Number.isFinite(compassDeg) && compassDeg >= 0) return { deg: ((compassDeg % 360) + 360) % 360, moving: false };
  return { deg: lastCourseDeg ?? null, moving: false };
}

/**
 * With no new fix for a while, your own dot counts you as stopped: phones send no location update
 * while standing still, so the last fix's speed would otherwise keep the dot in its moving look.
 * A stopped fix flips it at once. This is the shortest wait (ms), for a map getting a fix every
 * second; see ownStoppedAfterMs.
 */
export const OWN_STOPPED_AFTER_MS = 5000;

/**
 * How long your own dot waits with no new fix before counting you stopped, for a map that gets a
 * fix every `fixEveryMs` (Battery Saver sends one every 15 s): two and a half fix gaps, so it
 * never flips between fixes mid-ride or in a short GPS gap under trees, and never under 5 s.
 */
export function ownStoppedAfterMs(fixEveryMs = 1000): number {
  return Math.max(OWN_STOPPED_AFTER_MS, Math.round(2.5 * (Number.isFinite(fixEveryMs) ? fixEveryMs : 1000)));
}

/**
 * When your own dot last saw you moving: `nowMs` for a moving fix, null for a stopped one (the dot
 * takes its stopped look at once). A fix with the same own time `fixAtMs` as the last one (some
 * phones repeat the last spot when only the compass turned) changes nothing, so a stopped rider
 * turning the phone doesn't count as moving again. The fix's time is only compared with the last
 * fix's, never with the clock.
 */
export function ownMovingAt(
  prev: { movingAt: number | null; fixAt: number | null },
  moving: boolean,
  fixAtMs: number,
  nowMs: number,
): { movingAt: number | null; fixAt: number | null } {
  if (prev.fixAt != null && fixAtMs === prev.fixAt) return prev;
  return { movingAt: moving ? nowMs : null, fixAt: fixAtMs };
}

/** Whether your own dot still counts you as moving at `nowMs`, waiting `waitMs` (ownStoppedAfterMs). */
export function ownStillMoving(movingAt: number | null, nowMs: number, waitMs = OWN_STOPPED_AFTER_MS): boolean {
  return movingAt != null && nowMs - movingAt < waitMs;
}

/** How long another rider's dot keeps pointing their last way after they slow down (ms). */
export const HELD_HEADING_MS = 10 * 60_000;

/**
 * Another rider's arrow: their heading while moving, and their last heading for a while after they
 * stop (phones send no direction when standing still), so the arrow stays on while they're live.
 */
export function heldHeading(
  prev: { deg: number; at: number } | null | undefined,
  fix: { speedMps?: number | null; headingDeg?: number | null } | null | undefined,
  live: boolean,
  nowMs: number,
): { deg: number; at: number } | null {
  if (!live) return null;
  const h = riderHeading(fix, true);
  if (h != null) return { deg: h, at: nowMs };
  return prev && nowMs - prev.at <= HELD_HEADING_MS ? prev : null;
}
