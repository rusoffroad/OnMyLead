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

/** Never sooner than this between uploads, however many points are waiting. */
export const TRACK_FLUSH_MIN_GAP_MS = 15_000;
/** The longest wait after uploads keep failing. */
export const TRACK_FLUSH_MAX_BACKOFF_MS = 10 * 60_000;
/** The most points kept waiting for one ride (about 3 hours at one a second); the oldest go first. */
export const TRACK_QUEUE_MAX_POINTS = 10_000;

/**
 * Whether queued track points should go up now. `failures` counts uploads in a row that didn't
 * get through: each one doubles the wait, so a server that keeps saying no isn't asked again on
 * every fix. (3.1 asked on every fix once 60 points were waiting and an upload was refused, so
 * the phone sent the whole track again about once a second until iOS closed the app.)
 */
export function shouldFlushTrack(lastFlushAt: number | null, now: number, pending: number, failures = 0): boolean {
  if (pending <= 0) return false;
  if (lastFlushAt == null) return true;
  const since = now - lastFlushAt;
  if (failures > 0) {
    return since >= Math.min(TRACK_FLUSH_EVERY_MS * 2 ** (failures - 1), TRACK_FLUSH_MAX_BACKOFF_MS);
  }
  if (since < TRACK_FLUSH_MIN_GAP_MS) return false;
  if (pending >= TRACK_FLUSH_MAX_PENDING) return true;
  return since >= TRACK_FLUSH_EVERY_MS;
}

/**
 * True when the server refused the upload for good: this rider isn't a joined member of that
 * ride any more (left, removed, or the ride was deleted), so retrying can never succeed.
 */
export function isTrackRefused(error: { code?: string | null; status?: number | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42501' || error.code === '23503' || error.status === 403;
}

/** The newest points, at most TRACK_QUEUE_MAX_POINTS. */
export function capTrackQueue<T>(points: T[]): T[] {
  return points.length > TRACK_QUEUE_MAX_POINTS ? points.slice(points.length - TRACK_QUEUE_MAX_POINTS) : points;
}
