/**
 * Ride Bubble: detects riders separating from the group.
 *
 * Each rider is measured against the nearest other rider (not only the leader), so a rider
 * who is far ahead counts too, and the Sweep at the back is measured against the last rider
 * rather than the whole pack.
 */
import { distanceM, formatDistance, LatLng, milesToMeters } from './geo';

export type RideRole = 'leader' | 'sweep' | 'rider';
export type BubbleStatus = 'green' | 'yellow' | 'red' | 'unknown';
export type BubbleReason = 'ok' | 'distance' | 'stopped' | 'no_update' | 'not_sharing';

export type RiderFix = LatLng & {
  at: number; // epoch ms of the fix
  speedMps?: number | null;
  headingDeg?: number | null;
};

export type BubbleRider = {
  id: string;
  name: string;
  role: RideRole;
  sharing: boolean;
  fix?: RiderFix | null;
  /** Last time this rider was seen moving faster than the moving threshold. */
  lastMovedAt?: number | null;
};

export type BubbleSettings = {
  yellowDistanceM: number;
  redDistanceM: number;
  yellowStopSec: number;
  redStopSec: number;
  /** No update for this long is treated as red (lost signal or app closed). */
  staleSec: number;
};

export type BubblePreset = 'default' | 'tight_trail' | 'desert' | 'highway';

export const BUBBLE_PRESETS: Record<BubblePreset, BubbleSettings> = {
  default: preset(0.5, 1.5),
  tight_trail: preset(0.1, 0.25),
  desert: preset(0.75, 2),
  highway: preset(1, 3),
};

function preset(yellowMi: number, redMi: number): BubbleSettings {
  return {
    yellowDistanceM: milesToMeters(yellowMi),
    redDistanceM: milesToMeters(redMi),
    yellowStopSec: 120,
    redStopSec: 300,
    staleSec: 300,
  };
}

/** Speed above which a rider counts as moving (about 4.5 mph). */
export const MOVING_SPEED_MPS = 2;

export type RiderBubbleState = {
  riderId: string;
  status: BubbleStatus;
  reason: BubbleReason;
  /** Distance to the nearest other rider with a fresh fix. */
  nearestM: number | null;
  stoppedSec: number | null;
  sinceUpdateSec: number | null;
  /** Ready-to-show alert text for yellow/red, e.g. "Mike is 1.7 miles behind the group. Last moving 4 minutes ago." */
  message: string | null;
};

export type GroupBubbleState = {
  groupMoving: boolean;
  riders: RiderBubbleState[];
  /** Riders currently red, for alerting Leader and Sweep. */
  alerts: RiderBubbleState[];
};

const rank: Record<BubbleStatus, number> = { unknown: -1, green: 0, yellow: 1, red: 2 };
const worse = (a: BubbleStatus, b: BubbleStatus) => (rank[b] > rank[a] ? b : a);

export function computeBubble(
  riders: BubbleRider[],
  settings: BubbleSettings,
  now: number,
): GroupBubbleState {
  const isFresh = (r: BubbleRider) =>
    r.sharing && !!r.fix && (now - r.fix.at) / 1000 <= settings.staleSec;
  const fresh = riders.filter(isFresh);

  const movingCount = fresh.filter((r) => (r.fix!.speedMps ?? 0) >= MOVING_SPEED_MPS).length;
  const groupMoving = fresh.length > 0 && movingCount * 2 >= fresh.length;

  const leader = fresh.find((r) => r.role === 'leader');

  const states = riders.map((r): RiderBubbleState => {
    const base = { riderId: r.id, nearestM: null, stoppedSec: null, sinceUpdateSec: null, message: null };
    if (!r.sharing) return { ...base, status: 'unknown', reason: 'not_sharing' };
    if (!r.fix) return { ...base, status: 'unknown', reason: 'no_update' };

    const sinceUpdateSec = Math.max(0, (now - r.fix.at) / 1000);
    const lastMoved = r.lastMovedAt ?? r.fix.at;
    const stoppedSec = Math.max(0, (now - lastMoved) / 1000);

    const others = fresh.filter((o) => o.id !== r.id);
    const nearestM = others.length
      ? Math.min(...others.map((o) => distanceM(r.fix!, o.fix!)))
      : null;

    let status: BubbleStatus = 'green';
    let reason: BubbleReason = 'ok';
    const bump = (s: BubbleStatus, why: BubbleReason) => {
      if (rank[s] > rank[status]) reason = why;
      status = worse(status, s);
    };

    if (nearestM != null) {
      if (nearestM > settings.redDistanceM) bump('red', 'distance');
      else if (nearestM > settings.yellowDistanceM) bump('yellow', 'distance');
    }
    // Stopping only matters while the rest of the group keeps moving.
    if (groupMoving && (r.fix.speedMps ?? 0) < MOVING_SPEED_MPS) {
      if (stoppedSec > settings.redStopSec) bump('red', 'stopped');
      else if (stoppedSec > settings.yellowStopSec) bump('yellow', 'stopped');
    }
    if (sinceUpdateSec > settings.staleSec && others.length > 0) bump('red', 'no_update');

    const state: RiderBubbleState = {
      ...base,
      status,
      reason,
      nearestM,
      stoppedSec,
      sinceUpdateSec,
    };
    const final = status as BubbleStatus;
    state.message = final === 'yellow' || final === 'red' ? alertMessage(r, state, leader, fresh) : null;
    return state;
  });

  return {
    groupMoving,
    riders: states,
    alerts: states.filter((s) => s.status === 'red'),
  };
}

function minutes(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} minute${m === 1 ? '' : 's'}`;
}

function alertMessage(
  r: BubbleRider,
  s: RiderBubbleState,
  leader: BubbleRider | undefined,
  fresh: BubbleRider[],
): string {
  if (s.reason === 'no_update') {
    return `No update from ${r.name} for ${minutes(s.sinceUpdateSec ?? 0)}. Showing last known location.`;
  }
  const where = s.nearestM != null ? `${formatDistance(s.nearestM)} ${direction(r, leader, fresh)} the group` : 'away from the group';
  const moving =
    s.stoppedSec != null && s.stoppedSec >= 60 ? ` Last moving ${minutes(s.stoppedSec)} ago.` : '';
  if (s.reason === 'stopped' && (s.nearestM ?? 0) < 100) {
    return `${r.name} has stopped.${moving}`;
  }
  return `${r.name} is ${where}.${moving}`;
}

/**
 * "behind" or "ahead of": project the rider's offset from the rest of the group onto the
 * group's direction of travel (the leader's heading, else the average heading of moving riders).
 */
function direction(r: BubbleRider, leader: BubbleRider | undefined, fresh: BubbleRider[]): string {
  const rest = fresh.filter((o) => o.id !== r.id);
  if (!r.fix || !rest.length) return 'away from';
  const heading = groupHeading(leader, rest);
  if (heading == null) return 'away from';
  const c = {
    lat: rest.reduce((n, o) => n + o.fix!.lat, 0) / rest.length,
    lng: rest.reduce((n, o) => n + o.fix!.lng, 0) / rest.length,
  };
  // Local flat projection is plenty at group scale.
  const north = r.fix.lat - c.lat;
  const east = (r.fix.lng - c.lng) * Math.cos((c.lat * Math.PI) / 180);
  const h = (heading * Math.PI) / 180;
  const along = north * Math.cos(h) + east * Math.sin(h);
  return along < 0 ? 'behind' : 'ahead of';
}

function groupHeading(leader: BubbleRider | undefined, rest: BubbleRider[]): number | null {
  if (leader?.fix?.headingDeg != null && leader.fix.headingDeg >= 0) return leader.fix.headingDeg;
  const moving = rest.filter(
    (o) => o.fix!.headingDeg != null && o.fix!.headingDeg! >= 0 && (o.fix!.speedMps ?? 0) >= MOVING_SPEED_MPS,
  );
  if (!moving.length) return null;
  const x = moving.reduce((n, o) => n + Math.sin((o.fix!.headingDeg! * Math.PI) / 180), 0);
  const y = moving.reduce((n, o) => n + Math.cos((o.fix!.headingDeg! * Math.PI) / 180), 0);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}
