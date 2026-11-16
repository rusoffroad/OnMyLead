/**
 * A ride with no service: what this phone keeps so Ride Mode opens on the trail, and what it does
 * with Start Ride Mode and Leave Ride when the server can't be reached. lib/ride-cache.ts keeps the
 * last ride and riders this phone saw; lib/outbox.ts sends the queued start or leave once there is
 * signal. Pure, so it is unit tested.
 */

import type { LeaveKind } from './leaving';

type RideStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

/** Start Ride Mode pressed with no service: this phone treats the ride as live at once. */
export function startedHere<R extends { status: RideStatus }>(ride: R | null): R | null {
  return ride && ride.status === 'scheduled' ? { ...ride, status: 'live' } : ride;
}

/** Leave Ride pressed with no service: this phone no longer counts the rider as on the ride. */
export function leftHere<M extends { user_id: string; status: string }>(members: M[], me: string): M[] {
  return members.map((m) => (m.user_id === me ? { ...m, status: 'cancelled' } : m));
}

/**
 * A queued Start Ride Mode reaching the server later only starts a ride that is still waiting to
 * start. One that someone else started, ended or cancelled in the meantime is left as it is, so a
 * late start can never bring back a ride that is over.
 */
export const startStillWanted = (status: RideStatus | null | undefined) => status === 'scheduled';

/** How long a queued start or leave keeps trying before it is dropped. */
export const QUEUED_RIDE_ACTION_MS = 24 * 3600_000;

/**
 * Drop a queued start or leave after a try? Once the server took it, yes. A turn-down from the
 * server (not a missing answer) won't change by trying again, so it is dropped too, as is one
 * that is a day old.
 */
export function dropQueuedRideAction(outcome: 'sent' | 'no_answer' | 'refused', ageMs: number): boolean {
  return outcome !== 'no_answer' || ageMs > QUEUED_RIDE_ACTION_MS;
}

/**
 * Which ways of leaving can wait for signal. Leaving yourself (or a waitlist or request) is only
 * about this rider, so it is safe to do on the phone now and tell the server later. Handing the
 * ride over and cancelling it change the ride for everyone, so they still need service.
 */
export const leaveWorksOffline = (kind: LeaveKind) => kind === 'leave' || kind === 'withdraw';
