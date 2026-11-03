/**
 * Keeping server work (and the monthly bill) in proportion to what a rider actually needs.
 *
 * 1. Ride Mode listens only to its own riders' positions. Listening to the whole positions table
 *    makes the server check every rider's update against every open map, which grows with the
 *    square of the number of people riding at once.
 * 2. The ride track goes up in batches. Each upload re-sends the whole track, so sending it on
 *    every fix moved the track hundreds of times per ride; the live dot (positions_latest) still
 *    goes up on every fix.
 */

/** Supabase Realtime accepts at most this many values in an `in` filter. */
export const MAX_REALTIME_IN_VALUES = 100;

/**
 * The Realtime filter for positions of these riders, or null when there is nobody to listen to.
 * A ride bigger than Realtime's `in` limit falls back to listening to everything the rider may
 * see (the old behaviour), so nobody goes missing from the map.
 */
export function positionsFilter(userIds: Iterable<string>): { filter?: string } | null {
  const ids = [...new Set(userIds)].filter(Boolean).sort();
  if (!ids.length) return null;
  if (ids.length > MAX_REALTIME_IN_VALUES) return {};
  return { filter: `user_id=in.(${ids.join(',')})` };
}

/** A stable key for a set of riders, so the live subscription restarts only when the roster changes. */
export const rosterKey = (userIds: Iterable<string>): string => [...new Set(userIds)].filter(Boolean).sort().join(',');

/** How often queued track points go up during a ride. Stopping the share always sends the rest. */
export const TRACK_FLUSH_EVERY_MS = 2 * 60_000;
/** Send sooner if this many points are waiting (a long time offline, then back in service). */
export const TRACK_FLUSH_MAX_PENDING = 60;

/** Whether queued track points should go up now. */
export function shouldFlushTrack(lastFlushAt: number | null, now: number, pending: number): boolean {
  if (pending <= 0) return false;
  if (lastFlushAt == null) return true;
  if (pending >= TRACK_FLUSH_MAX_PENDING) return true;
  return now - lastFlushAt >= TRACK_FLUSH_EVERY_MS;
}
