/**
 * Mechanical Issue: one tap in Ride Mode tells the leader and tail gunner that a rider's
 * machine has broken down, and where it is. It is an ordinary rider status ('mechanical'),
 * so it rides the same table, live updates, outbox and push as the other status buttons.
 */
import type { LatLng } from './geo';

export type StatusKind =
  | 'ok' | 'stopped' | 'need_fuel' | 'mechanical' | 'flat_tire' | 'stuck' | 'lost' | 'need_help' | 'emergency';

export type TappedStatus = { status: StatusKind; tapped_at: string; lat?: number | null; lng?: number | null };

export const MECHANICAL_LABEL = 'Mechanical Issue';

/** Other statuses drop off the alert list after this long. */
export const STATUS_SHOWN_MS = 30 * 60_000;

/**
 * Whether a rider's latest status still needs the group's attention. A breakdown stays up
 * until that rider sends another status (OK once it's fixed), however long the repair takes.
 */
export function isActiveCall(s: TappedStatus | undefined, now: number): boolean {
  if (!s || s.status === 'ok') return false;
  if (s.status === 'mechanical') return true;
  return now - Date.parse(s.tapped_at) < STATUS_SHOWN_MS;
}

/**
 * Where to show a broken-down rider: their live shared position when there is one, otherwise
 * the spot their phone reported when they tapped the button (riders on the ride can already
 * read that location with the status). Null for any other status.
 */
export function breakdownSpot(s: TappedStatus | undefined, live: LatLng | null | undefined): LatLng | null {
  if (!s || s.status !== 'mechanical') return null;
  if (live) return live;
  return s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null;
}

/** Leader and tail gunner hear this once per tap, so nobody has to look down to know. */
export function spokenBreakdown(name: string): string {
  return `${name} has a mechanical issue. Their location is on the map.`;
}

/** Key for "already announced": a new tap of the same button is a new breakdown. */
export const breakdownKey = (userId: string, s: TappedStatus) => `${userId}:${s.tapped_at}`;

/** Don't read out a breakdown that was already old when Ride Mode opened. */
export const BREAKDOWN_SPEAK_WITHIN_MS = 10 * 60_000;
