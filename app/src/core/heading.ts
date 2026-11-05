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
  const at = fixTimeMs(c.timestamp);
  if (at != null) f.atMs = at;
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
 * Your own dot, moving or stopped (2.1). A stopped fix shows the stopped look at once. Phones send
 * no location update while standing still, so a quiet spell with no new fix also means stopped:
 * two and a half of the map's update intervals (Ride Mode's battery plans on Android's flat map;
 * once a second elsewhere), never under 8 s, so the dot doesn't flip between fixes mid-ride.
 */
export type OwnMoveState = {
  moving: boolean;
  /** The last fix's own time (ms) when the phone gave one, only ever compared with other fixes' times. */
  fixAt: number | null;
};
export const OWN_MOVE_START: OwnMoveState = { moving: false, fixAt: null };

/** The shortest quiet spell that means stopped (ms): longer than a brief GPS dropout on a once-a-second map. */
export const OWN_STOPPED_AFTER_MS = 8000;
/** The longest map update interval the wait follows (ms). */
const OWN_EVERY_MAX_MS = 30_000;

/** A fix's own time, or null when it has none (a missing, non-finite, or 0-or-less time; some map builds send 0). */
export function fixTimeMs(t: number | null | undefined): number | null {
  return t != null && Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * The next state for a fix (moving or not, its own time when the phone gives one). A fix with the
 * same own time as the last one (some phones repeat the last spot when only the compass turned)
 * returns `prev` itself: nothing changes, so a stopped rider turning the phone doesn't count as
 * moving. A fix with no time keeps the last fix time, so a later repeat of that fix is still caught.
 */
export function ownMoveStep(prev: OwnMoveState, moving: boolean, fixAtMs: number | null | undefined): OwnMoveState {
  const fixAt = fixTimeMs(fixAtMs);
  if (fixAt != null && fixAt === prev.fixAt) return prev;
  return { moving, fixAt: fixAt ?? prev.fixAt };
}

/** How long to wait with no new fix before counting you stopped (ms), for a map updating every `everyMs` (default once a second). */
export function ownStopWaitMs(everyMs?: number | null): number {
  const every = everyMs != null && Number.isFinite(everyMs) && everyMs > 0 ? Math.min(everyMs, OWN_EVERY_MAX_MS) : 1000;
  return Math.max(OWN_STOPPED_AFTER_MS, Math.round(2.5 * every));
}

/** Whether a fix counts as moving for your own dot: faster than a walk with a real course (riderHeading). */
export function ownFixMoving(fix: { speedMps?: number | null; headingDeg?: number | null }): boolean {
  return riderHeading(fix, true) != null;
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
