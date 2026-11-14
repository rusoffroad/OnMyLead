/**
 * Quick Create a Ride: the answers the form starts with, so a ride takes a couple of taps. Pure
 * rules, shared by iPhone, iPad, Android and the website (the screen is app/ride/new.tsx; what a
 * rider picked last time is kept on the device by lib/quick-ride.ts).
 */
import { addDays, startOfDay } from './calendar';
import { distanceM, type LatLng } from './geo';
import { LAST_MINUTE_OF_DAY } from './time';

/** The time list's step, and the step "now" rounds up to. */
export const QUICK_TIME_STEP = 15;
/** The time a ride on another day starts from. */
export const QUICK_MORNING = 8 * 60;
/** How many meeting points the form remembers. */
export const RECENT_SPOTS_MAX = 3;
/** Two meeting points closer than this are the same place. */
export const SAME_SPOT_M = 75;

/**
 * The day and time the form opens on: today, at the next quarter hour. Too late in the day for
 * another quarter hour (after 11:45 pm), it is tomorrow at 8:00 am.
 */
export function defaultWhen(now: Date): { day: Date; minutes: number } {
  const next = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / QUICK_TIME_STEP) * QUICK_TIME_STEP;
  if (next > LAST_MINUTE_OF_DAY) return { day: addDays(startOfDay(now), 1), minutes: QUICK_MORNING };
  return { day: startOfDay(now), minutes: next };
}

/** Every time the list offers, in minutes after midnight: 12:00 am to 11:45 pm in quarter hours. */
export function quickTimes(): number[] {
  const out: number[] = [];
  for (let m = 0; m < 24 * 60; m += QUICK_TIME_STEP) out.push(m);
  return out;
}

/**
 * The times the list offers for a ride on `day`: every quarter hour, but for a ride today only
 * the ones still to come (a ride can't meet at 9:00 pm when it is already 9:18 pm).
 */
export function quickTimesOn(day: Date, now: Date): number[] {
  const all = quickTimes();
  if (startOfDay(day).getTime() !== startOfDay(now).getTime()) return all;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return all.filter((m) => m > nowMinutes);
}

/**
 * The meeting time after the rider picks `day`: the time they had, unless the ride is now today
 * and that time has passed, in which case the next quarter hour (null when today has none left).
 */
export function timeOnDay(day: Date, minutes: number | null, now: Date): number | null {
  if (minutes == null || startOfDay(day).getTime() !== startOfDay(now).getTime()) return minutes;
  if (minutes > now.getHours() * 60 + now.getMinutes()) return minutes;
  return quickTimesOn(day, now)[0] ?? null;
}

/** The time in the list nearest to `minutes` (the one the list scrolls to and marks). */
export function nearestQuickTime(minutes: number): number {
  const m = Math.round(minutes / QUICK_TIME_STEP) * QUICK_TIME_STEP;
  return Math.min(Math.max(m, 0), 24 * 60 - QUICK_TIME_STEP);
}

/** A meeting point the rider used before. */
export type RecentSpot = { lat: number; lng: number; label: string; state: string | null };

/** What the form remembers from the rider's last ride. */
export type RideDefaults = {
  kind: 'public' | 'private';
  vehicleTypes: string[] | null;
  joinPolicy: 'open' | 'approval' | null;
  spots: RecentSpot[];
};

/** A first ride: friends only (nothing goes public by accident), nothing remembered. */
export const FIRST_RIDE_DEFAULTS: RideDefaults = { kind: 'private', vehicleTypes: null, joinPolicy: null, spots: [] };

const isSpot = (s: unknown): s is RecentSpot => {
  const x = s as RecentSpot | null;
  return !!x && typeof x === 'object' && Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180
    && typeof x.label === 'string' && x.label.trim() !== '';
};

/** Reads what the device saved; anything unreadable is a first ride. */
export function parseRideDefaults(raw: string | null | undefined): RideDefaults {
  if (!raw) return FIRST_RIDE_DEFAULTS;
  try {
    const v = JSON.parse(raw) as Partial<RideDefaults> | null;
    if (!v || typeof v !== 'object') return FIRST_RIDE_DEFAULTS;
    const vehicles = Array.isArray(v.vehicleTypes) ? v.vehicleTypes.filter((x): x is string => typeof x === 'string' && x !== '') : [];
    return {
      kind: v.kind === 'public' ? 'public' : 'private',
      vehicleTypes: vehicles.length ? vehicles : null,
      joinPolicy: v.joinPolicy === 'open' || v.joinPolicy === 'approval' ? v.joinPolicy : null,
      spots: (Array.isArray(v.spots) ? v.spots : []).filter(isSpot)
        .map((s) => ({ lat: s.lat, lng: s.lng, label: s.label.trim(), state: typeof s.state === 'string' ? s.state : null }))
        .slice(0, RECENT_SPOTS_MAX),
    };
  } catch {
    return FIRST_RIDE_DEFAULTS;
  }
}

/**
 * The remembered meeting points after a ride is created at `spot`: newest first, the same place
 * (or the same name) listed once, three at most. A spot with no name isn't remembered: a chip
 * needs words on it.
 */
export function rememberSpot(spots: RecentSpot[], spot: RecentSpot): RecentSpot[] {
  const label = spot.label.trim();
  if (!label) return spots;
  const same = (s: RecentSpot) => distanceM(s, spot) < SAME_SPOT_M || s.label.trim().toLowerCase() === label.toLowerCase();
  return [{ ...spot, label }, ...spots.filter((s) => !same(s))].slice(0, RECENT_SPOTS_MAX);
}

/** Whether the meeting point is (still) this remembered spot, to mark its chip. */
export function atSpot(point: LatLng | null, spot: RecentSpot): boolean {
  return !!point && distanceM(point, spot) < SAME_SPOT_M;
}
