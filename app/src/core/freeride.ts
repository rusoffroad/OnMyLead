/**
 * The rider line for a Freeride (a ride with no mapped route).
 *
 * With no route to measure along, the line measures along the leader's own path instead: each
 * phone keeps the leader's trail from the leader's live spots it already receives (it is never
 * uploaded, and only riders on the ride ever get those spots), and every other rider is placed by
 * how far they are behind the leader along that trail. That follows the trail round bends and
 * switchbacks, so a rider a quarter mile back on a twisty trail reads as a quarter mile back,
 * not the hundred yards a straight line would say. A rider who isn't on the leader's path (they
 * took another way, or were already behind when this phone started keeping the trail) is placed
 * by straight-line distance instead, and their dot is drawn hollow.
 *
 * The line runs from the rear of the group on the left to the leader on the right, scaled to the
 * group's spread (never less than half a mile, so a tight group sits bunched at the leader's end
 * rather than spread across the whole bar).
 */
import { distanceM, formatDistance, metersToMiles, type LatLng } from './geo';
import { cumulativeM, locateOnRoute, miles, type PlacedRider, type RouteRider } from './route';

/** The leader's trail grows a point each time the leader moves at least this far. */
export const TRAIL_STEP_M = 15;
/** Points kept; past this the oldest part of the trail is dropped (about 45 mi at one per 15 m). */
export const TRAIL_MAX_POINTS = 5000;
/** The line is never scaled to less than this, so a tight group bunches up at the front. */
export const MIN_SPAN_M = 805;
/** A trail saved on the phone is ignored once it is this old. */
export const TRAIL_MAX_AGE_MS = 18 * 60 * 60_000;
/** Riders this close count as together. */
const TOGETHER_M = 30;

export type LeaderTrail = {
  rideId: string;
  leaderId: string;
  points: LatLng[];
  /** Meters of trail dropped off the start, so remembered spots stay comparable. */
  droppedM: number;
  /** When the trail last grew (ms). */
  updatedAt: number;
};

/**
 * The trail with the leader's newest spot added. A new leader (or a new ride) starts a new trail.
 * Returns the same object when nothing changed, so React state doesn't churn on every fix.
 */
export function extendTrail(trail: LeaderTrail | null, rideId: string, leaderId: string, at: LatLng, now = Date.now()): LeaderTrail {
  if (!trail || trail.leaderId !== leaderId || trail.rideId !== rideId) {
    return { rideId, leaderId, points: [at], droppedM: 0, updatedAt: now };
  }
  const last = trail.points[trail.points.length - 1];
  if (last && distanceM(last, at) < TRAIL_STEP_M) return trail;
  let points = [...trail.points, at];
  let droppedM = trail.droppedM;
  if (points.length > TRAIL_MAX_POINTS) {
    const cut = points.length - TRAIL_MAX_POINTS;
    for (let i = 1; i <= cut; i++) droppedM += distanceM(points[i - 1], points[i]);
    points = points.slice(cut);
  }
  return { rideId, leaderId, points, droppedM, updatedAt: now };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A trail saved on the phone, if it is for this ride and still fresh; anything else is ignored. */
export function parseStoredTrail(raw: string | null | undefined, rideId: string, now = Date.now()): LeaderTrail | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<LeaderTrail>;
    if (t.rideId !== rideId || typeof t.leaderId !== 'string' || !Array.isArray(t.points) || !isNum(t.updatedAt)) return null;
    if (now - t.updatedAt > TRAIL_MAX_AGE_MS) return null;
    const points = t.points.filter((p): p is LatLng => !!p && isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
    if (!points.length) return null;
    return { rideId, leaderId: t.leaderId, points: points.slice(-TRAIL_MAX_POINTS), droppedM: isNum(t.droppedM) ? t.droppedM : 0, updatedAt: t.updatedAt };
  } catch {
    return null;
  }
}

export type FreerideLine = {
  /** Every rider, placed on a line `lengthM` long with the leader at the far (right) end. */
  placed: PlacedRider[];
  lengthM: number;
  /** Distance from the leader back to the last placed rider, in meters. */
  spanM: number;
  /** How far back each placed rider is from the leader, in meters (0 for the leader). */
  behindM: Record<string, number>;
  /** The leader the line is measured from, or null when no leader is sharing a spot. */
  leaderId: string | null;
};

/**
 * Place riders behind the leader along the leader's trail. `hints` remembers where each rider
 * last was on the trail (so on a loop or an out-and-back a rider doesn't jump to the other
 * pass), and is updated in place.
 */
export function placeOnTrail(
  trail: LeaderTrail | null,
  leaderId: string | null,
  riders: RouteRider[],
  hints: Record<string, number> = {},
): FreerideLine {
  const leader = leaderId ? riders.find((r) => r.id === leaderId && r.at) : undefined;
  if (!leader?.at) {
    return { placed: riders.map((r) => ({ ...r, place: null })), lengthM: MIN_SPAN_M, spanM: 0, behindM: {}, leaderId: null };
  }
  const usable = trail && trail.leaderId === leader.id && trail.points.length >= 2 ? trail : null;
  const cum = usable ? cumulativeM(usable.points) : [];
  const trailM = cum.length ? cum[cum.length - 1] : 0;

  const behindM: Record<string, number> = { [leader.id]: 0 };
  const offM: Record<string, number> = {};
  const onTrail: Record<string, boolean> = { [leader.id]: true };
  for (const r of riders) {
    if (r.id === leader.id || !r.at) continue;
    const straight = distanceM(r.at, leader.at);
    const hint = hints[r.id];
    const spot = usable ? locateOnRoute(usable.points, cum, r.at, hint != null ? hint - usable.droppedM : null) : null;
    if (spot && spot.onRoute) {
      // Along the trail is never shorter than the straight line; GPS wobble can make it look so.
      behindM[r.id] = Math.max(straight, trailM - spot.alongM);
      offM[r.id] = spot.offRouteM;
      onTrail[r.id] = true;
      hints[r.id] = usable!.droppedM + spot.alongM;
    } else {
      behindM[r.id] = straight;
      offM[r.id] = spot?.offRouteM ?? 0;
      onTrail[r.id] = false;
    }
  }
  const spanM = Math.max(0, ...Object.values(behindM));
  const lengthM = Math.max(MIN_SPAN_M, spanM);
  const placed = riders.map((r) => ({
    ...r,
    place: r.id in behindM ? { alongM: lengthM - behindM[r.id], offRouteM: offM[r.id] ?? 0, onRoute: onTrail[r.id] } : null,
  }));
  return { placed, lengthM, spanM, behindM, leaderId: leader.id };
}

/** Places riders on the leader's trail over time, remembering each rider's spot between fixes. */
export class FreerideTracker {
  private hints: Record<string, number> = {};
  private trailOf: string | null = null;

  place(trail: LeaderTrail | null, leaderId: string | null, riders: RouteRider[]): FreerideLine {
    const key = trail ? `${trail.rideId}:${trail.leaderId}` : null;
    if (key !== this.trailOf) {
      this.hints = {};
      this.trailOf = key;
    }
    return placeOnTrail(trail, leaderId, riders, this.hints);
  }
}

const gap = (m: number) => (metersToMiles(Math.abs(m)) < 0.1 ? formatDistance(Math.abs(m)) : `${miles(Math.abs(m))} mi`);

export type FreerideSummary = {
  /** The group's spread, e.g. "0.8 mi" or "450 ft"; null while the group is together or nobody else is placed. */
  spread: string | null;
  /** What the spread runs between, e.g. "Leader to Tail Gunner". */
  ends: string;
  /** One plain sentence about this rider, or null when this phone has no spot for them. */
  compared: string | null;
};

/** The group's spread and this rider's place behind the leader, in words. */
export function summarizeFreeride(line: FreerideLine, meId: string | undefined): FreerideSummary {
  const placed = line.placed.filter((r) => r.place);
  const others = placed.filter((r) => r.id !== line.leaderId);
  const rear = others.reduce<PlacedRider | null>((a, b) => (!a || line.behindM[b.id] > line.behindM[a.id] ? b : a), null);
  const sweep = others.find((r) => r.role === 'sweep');
  const together = !others.length || line.spanM < TOGETHER_M;
  const ends = !others.length
    ? 'Only the leader on the line'
    : together
      ? `${placed.length} riders together`
      : `Leader to ${rear?.role === 'sweep' ? 'Tail Gunner' : 'Last Rider'}`;

  const me = placed.find((r) => r.id === meId);
  let compared: string | null = null;
  if (me) {
    if (!others.length) compared = 'Nobody else is sharing a spot yet.';
    else if (me.id === line.leaderId) {
      const back = sweep ? line.behindM[sweep.id] : line.spanM;
      compared = together ? 'The group is right with you.' : `You're out front. ${sweep ? 'The tail gunner' : 'The last rider'} is ${gap(back)} back.`;
    } else {
      const d = line.behindM[me.id];
      const off = !me.place!.onRoute;
      compared = d < TOGETHER_M ? "You're right with the leader." : `The leader is ${gap(d)} ahead${off ? ' in a straight line' : ''}.`;
      if (me.role !== 'sweep' && rear?.id === me.id && others.length > 1) compared += ' Nobody is behind you.';
    }
  }
  return { spread: together ? null : gap(line.spanM), ends, compared };
}
