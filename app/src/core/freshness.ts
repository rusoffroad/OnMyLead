/**
 * How fresh a rider's location is, and how to say so.
 *
 * A dot on the map must never look live when the phone behind it has gone quiet. Sharing phones
 * send a fix at least every 15 seconds while they have service (even when parked), so:
 * - live: the last fix is under a minute old; draw the rider as a solid dot.
 * - delayed: a minute or more; draw where they were last seen, hollow, with the age.
 * - lost: three minutes or more; their phone has lost service or stopped sending.
 *
 * When it is this phone that has no service, nobody else's silence proves anything, so riders who
 * were fine when we lost service show as delayed (last seen, with the age), never as lost.
 */

export type Freshness = 'live' | 'delayed' | 'lost';

/** A fix older than this is no longer drawn as the rider's current position. */
export const LIVE_SEC = 60;
/** No fix for this long means the rider's phone has lost service (or stopped sending). */
export const LOST_SEC = 180;
/** How often a sharing phone sends a fix even when it has not moved. */
export const HEARTBEAT_SEC = 15;
/** Without a successful refresh or live update for this long, this phone counts as offline. */
export const VIEWER_OFFLINE_SEC = 35;

export type RiderFreshness = {
  state: Freshness;
  /** Whole seconds since the fix; never negative, even if the other phone's clock runs ahead. */
  ageSec: number;
  /** "Just Now", "2 Min Ago", "1 Hr 5 Min Ago". */
  ago: string;
  /** One line for tags and rows: "Live", "2 Min Ago", "No Signal, 8 Min Ago". */
  label: string;
};

export function formatAgo(ageSec: number): string {
  const s = Math.max(0, Math.floor(ageSec));
  if (s < 60) return 'Just Now';
  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return `${totalMin} Min Ago`;
  const totalHr = Math.floor(totalMin / 60);
  if (totalHr >= 24) {
    const d = Math.floor(totalHr / 24);
    return `${d} ${d === 1 ? 'Day' : 'Days'} Ago`;
  }
  const m = totalMin % 60;
  return m === 0 ? `${totalHr} Hr Ago` : `${totalHr} Hr ${m} Min Ago`;
}

/**
 * @param fixAt epoch ms of the rider's last fix (when the phone took it, not when it arrived).
 * @param viewerOfflineSince epoch ms since which this phone has heard nothing, or null when online.
 */
export function riderFreshness(fixAt: number, now: number, viewerOfflineSince: number | null = null): RiderFreshness {
  const ageSec = Math.max(0, Math.floor((now - fixAt) / 1000));
  let state: Freshness = ageSec < LIVE_SEC ? 'live' : ageSec < LOST_SEC ? 'delayed' : 'lost';
  // While we are offline, the fix only goes stale because we stopped hearing. Call a rider lost
  // only if they were already quiet for LOST_SEC before our own service dropped.
  if (viewerOfflineSince != null && state === 'lost' && (viewerOfflineSince - fixAt) / 1000 < LOST_SEC) {
    state = 'delayed';
  }
  // A fix taken before we went offline cannot be shown as live, however recent it was.
  if (viewerOfflineSince != null && state === 'live' && fixAt < viewerOfflineSince) state = 'delayed';
  const ago = formatAgo(ageSec);
  const label = state === 'live' ? 'Live' : state === 'lost' ? `No Signal, ${ago}` : ago;
  return { state, ageSec, ago, label };
}

/**
 * This phone's own connection in Ride Mode: offline once nothing has come in (a refresh or a
 * live update) for VIEWER_OFFLINE_SEC. Returns when the silence started, or null when online.
 */
export function viewerOfflineSince(lastHeardAt: number, now: number): number | null {
  return now - lastHeardAt >= VIEWER_OFFLINE_SEC * 1000 ? lastHeardAt : null;
}

/**
 * Should this phone send the newest fix? Sends on the first fix, after moving `minMoveM`, or once
 * `heartbeatSec` has passed, so a parked rider still shows as live rather than lost. Battery Saver
 * (core/battery.ts) passes larger values, always under LIVE_SEC.
 */
export function shouldSendFix(
  last: { at: number; lat: number; lng: number } | null,
  next: { at: number; lat: number; lng: number },
  distanceM: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
  minMoveM = 25,
  heartbeatSec = HEARTBEAT_SEC,
): boolean {
  if (!last) return true;
  if (next.at - last.at >= heartbeatSec * 1000) return true;
  return distanceM(last, next) >= minMoveM;
}

/** Sharing stops on this phone at the share's own end time, even with no service to hear it. */
export function shareStillOn(until: number | null | undefined, now: number): boolean {
  return until == null || now < until;
}
