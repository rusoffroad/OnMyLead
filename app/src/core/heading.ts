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
 * Your own dot, moving or stopped (2.1). A stopped fix shows the stopped look at once. Phones send
 * no location update while standing still, so a quiet spell with no new fix also means stopped:
 * two and a half of the longest recent gap between back-to-back moving fixes (the map's fix rate;
 * Battery Saver on Android sends one every 15 s), never under 5 s, so the dot never flips between
 * fixes mid-ride or in a short GPS gap under trees.
 */
export type OwnMoveState = {
  moving: boolean;
  /** The last fix's own time (ms) when the phone gave one, only ever compared with other fixes' times. */
  fixAt: number | null;
  /** The clock time (ms) of the last fix. */
  seenAt: number | null;
  /** Recent gaps between back-to-back moving fixes (ms), newest last. */
  gaps: number[];
  /** Stopped only because the quiet spell ran out (no stopped fix came). */
  quiet: boolean;
  /** The gap before a moving fix that came after a quiet spell, waiting for a second like it (ms). */
  pendingGap: number | null;
};
export const OWN_MOVE_START: OwnMoveState = { moving: false, fixAt: null, seenAt: null, gaps: [], quiet: false, pendingGap: null };

/** The shortest quiet spell that means stopped (ms). */
export const OWN_STOPPED_AFTER_MS = 5000;
/** The wait before the map's fix rate is known (a map just opened): just over Battery Saver's 15 s. */
export const OWN_STOPPED_UNKNOWN_MS = 16_000;
/** A gap between moving fixes longer than this is a dead spot, not the map's fix rate (ms): just over Battery Saver's 15 s, so the wait never grows past 50 s. */
export const OWN_FIX_GAP_MAX_MS = 20_000;
/** How many recent fix gaps your dot remembers (the longest of them sets the wait). */
export const OWN_FIX_GAPS_KEPT = 5;

/**
 * The next state for a fix (moving or not, its own time when the phone gives one, the clock now).
 * A fix with the same own time as the last one (some phones repeat the last spot when only the
 * compass turned) returns `prev` itself: nothing changes, so a stopped rider turning the phone
 * doesn't count as moving. Gaps are measured between the fixes' own times when both have one, so
 * a burst of fixes the phone held back (the app coming back from the background) keeps their real
 * spacing; otherwise by when they arrived.
 */
export function ownMoveStep(prev: OwnMoveState, moving: boolean, fixAtMs: number | null | undefined, nowMs: number): OwnMoveState {
  const fixAt = fixAtMs != null && Number.isFinite(fixAtMs) ? fixAtMs : null;
  if (fixAt != null && prev.fixAt != null && fixAt === prev.fixAt) return prev;
  let gaps = prev.gaps;
  let pendingGap = prev.pendingGap;
  const gap = fixAt != null && prev.fixAt != null ? fixAt - prev.fixAt : prev.seenAt == null ? 0 : nowMs - prev.seenAt;
  const fits = gap > 0 && gap <= OWN_FIX_GAP_MAX_MS;
  if (moving && prev.moving) {
    // Back-to-back moving fixes show the map's fix rate (and end any half-learned slower rate).
    if (fits) gaps = [...gaps, gap].slice(-OWN_FIX_GAPS_KEPT);
    pendingGap = null;
  } else if (moving && prev.quiet && !fits) {
    pendingGap = null;
  } else if (moving && prev.quiet) {
    // A moving fix right after the quiet spell ran out: either a short stop or slower fixes
    // (Battery Saver came on). Two such gaps of about the same length in a row are the new rate.
    if (pendingGap != null && Math.abs(gap - pendingGap) <= pendingGap / 2) {
      gaps = [...gaps, pendingGap, gap].slice(-OWN_FIX_GAPS_KEPT);
      pendingGap = null;
    } else pendingGap = gap;
  } else if (!moving) pendingGap = null;
  return { moving, fixAt: fixAt ?? prev.fixAt, seenAt: nowMs, gaps, quiet: false, pendingGap };
}

/** The quiet spell had no new fix: stopped (the learned fix rate stays). */
export function ownMoveTimedOut(prev: OwnMoveState): OwnMoveState {
  return { ...prev, moving: false, quiet: true };
}

/** How long to wait with no new fix before counting you stopped (ms). */
export function ownStopWaitMs(s: OwnMoveState): number {
  if (!s.gaps.length) return OWN_STOPPED_UNKNOWN_MS;
  return Math.max(OWN_STOPPED_AFTER_MS, Math.round(2.5 * Math.max(...s.gaps)));
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
