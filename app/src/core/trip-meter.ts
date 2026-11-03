/**
 * Map Mode's dash: the trip meter (miles ridden and time moving since the rider last reset it,
 * like the trip button on a truck's dash) and the compass point for the heading readout. Pure, so
 * it is tested without a phone.
 *
 * The trip meter only counts while Map Mode is open: it is the phone's own GPS, kept on this
 * phone, never shared, and nothing is tracked once the rider leaves the screen.
 */
import { MOVING_SPEED_MPS } from './bubble';
import { distanceM } from './geo';
import { MAX_FIX_ACCURACY_M } from './nav-trails';

export const TRIP_STORAGE_KEY = 'nav.trip.v1';

export type TripFix = { lat: number; lng: number; accuracy: number | null; speedMps: number | null; timestamp: number };

export type TripMeter = {
  distanceM: number;
  movingS: number;
  /** The last fix counted, so the next one adds the step between them. */
  last: { lat: number; lng: number; timestamp: number } | null;
};

export const EMPTY_TRIP: TripMeter = { distanceM: 0, movingS: 0, last: null };

/** Steps shorter than this while the phone says it's stopped are GPS wander, not riding. */
export const TRIP_JITTER_M = 8;
/** A jump this long between two fixes is a glitch or the phone was off: start over from here. */
export const TRIP_BREAK_M = 2_000;
/** A gap this long (screen closed, no signal) isn't counted as moving time. */
export const TRIP_GAP_S = 30;
/** Faster than this between two fixes (about 155 mph) is a GPS jump, not riding. */
const MAX_PLAUSIBLE_MPS = 70;

/** Add one GPS fix to the trip. Returns the same object when nothing changed. */
export function addTripFix(trip: TripMeter, fix: TripFix): TripMeter {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || !Number.isFinite(fix.timestamp)) return trip;
  if (fix.accuracy != null && fix.accuracy > MAX_FIX_ACCURACY_M) return trip;
  const here = { lat: fix.lat, lng: fix.lng, timestamp: fix.timestamp };
  const last = trip.last;
  if (!last) return { ...trip, last: here };
  const dt = (fix.timestamp - last.timestamp) / 1000;
  if (dt <= 0) return trip;
  const d = distanceM(last, fix);
  if (d > TRIP_BREAK_M || d / dt > MAX_PLAUSIBLE_MPS) return { ...trip, last: here };
  const moving = fix.speedMps != null && fix.speedMps >= MOVING_SPEED_MPS;
  // Parked: hold the anchor so small wobbles never add up into miles.
  if (!moving && d < TRIP_JITTER_M) return trip;
  return {
    distanceM: trip.distanceM + d,
    movingS: trip.movingS + (dt <= TRIP_GAP_S && (moving || d / dt >= MOVING_SPEED_MPS) ? dt : 0),
    last: here,
  };
}

/** Read what's stored; anything malformed starts a fresh trip. */
export function parseTrip(raw: unknown): TripMeter {
  if (!raw || typeof raw !== 'object') return EMPTY_TRIP;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  // The anchor isn't kept: the rider may have moved since, so the next fix starts a fresh step.
  return { distanceM: n(r.distanceM), movingS: n(r.movingS), last: null };
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** "N", "NE" … "NW" for a compass heading in degrees. */
export function compassPoint(deg: number): (typeof POINTS)[number] {
  const d = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(d / 45) % 8];
}

/** The heading readout: ["NW", "312°"], or a dash when the phone doesn't know which way it faces. */
export function headingReadout(deg: number | null | undefined): [string, string] {
  if (deg == null || !Number.isFinite(deg)) return ['–', ''];
  const d = Math.round(((deg % 360) + 360) % 360) % 360;
  return [compassPoint(d), `${d}°`];
}

/** Moving time: ["42", "min"] under an hour, ["1:05", "hr"] after. */
export function movingReadout(seconds: number): [string, string] {
  const m = Math.floor(Math.max(0, seconds) / 60);
  if (m < 60) return [String(m), 'min'];
  return [`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, 'hr'];
}

/**
 * Which way the rider faces for the dash: the GPS course while moving (true to the trail), else
 * the phone's compass when it has one (standing still, or a phone that sends no course). Null
 * when neither is known, as on the website.
 */
export function dashHeading(course: number | null, compass: number | null): number | null {
  if (course != null && Number.isFinite(course)) return course;
  if (compass != null && Number.isFinite(compass) && compass >= 0) return compass;
  return null;
}
