import { distanceM, type LatLng } from './geo';
import { lineLengthM, MAX_ROUTE_POINTS, simplifyLine, type RideRoute } from './route';

/**
 * A drawn route is the leader's taps joined by legs. A leg either follows the trails between its
 * two taps (core/trail-router) or is a straight line, for open ground, a wash or a park nobody
 * has mapped. Each leg keeps the way it was drawn, so moving a tap re-snaps only the legs that
 * were following trails.
 */
export type LegMode = 'trail' | 'straight';

export type Leg = {
  mode: LegMode;
  /** From one tap to the next, both ends included. */
  points: LatLng[];
  /** Still working out the trail line; drawn straight meanwhile. */
  pending?: boolean;
  /** Meant to follow trails, but none joins the two taps, so it's straight. */
  noTrail?: boolean;
};

export const straightLeg = (a: LatLng, b: LatLng, mode: LegMode = 'straight', extra: Partial<Leg> = {}): Leg => ({
  mode,
  points: [a, b],
  ...extra,
});

/** The whole line through every leg. */
export function joinLegs(taps: LatLng[], legs: Leg[]): LatLng[] {
  if (taps.length < 2 || !legs.length) return taps.slice();
  const out: LatLng[] = [taps[0]];
  legs.forEach((leg, i) => {
    const inner = leg.points.slice(1, -1);
    out.push(...inner, taps[i + 1]);
  });
  return out;
}

/**
 * The route to save. Each leg is thinned on its own so every tap stays a point on the line,
 * which is how legsFromRoute finds the legs again next time the route is opened.
 */
export function routeFromLegs(taps: LatLng[], legs: Leg[], name: string | null = null): RideRoute | null {
  if (taps.length < 2) return null;
  let tol = 3;
  let points: LatLng[];
  for (;;) {
    const thin = legs.map((l, i) => simplifyLine([taps[i], ...l.points.slice(1, -1), taps[i + 1]], tol, Infinity));
    points = [taps[0], ...thin.flatMap((l) => l.slice(1))];
    if (points.length <= MAX_ROUTE_POINTS) break;
    tol *= 2;
  }
  return { points, waypoints: taps.slice(), source: 'drawn', name: name?.trim() || null, lengthM: lineLengthM(points), updatedAt: null };
}

/** Taps saved to six decimals land within a meter of the line's own points. */
const SAME_M = 1.5;

/**
 * The legs of a saved drawn route. Routes drawn before snapping existed are straight between
 * their taps, which this reads as straight legs.
 */
export function legsFromRoute(route: Pick<RideRoute, 'points' | 'waypoints'>): Leg[] {
  const taps = route.waypoints;
  if (taps.length < 2) return [];
  const pts = route.points;
  const legs: Leg[] = [];
  let at = pts.length && distanceM(pts[0], taps[0]) <= SAME_M ? 0 : -1;
  for (let j = 1; j < taps.length && at >= 0; j++) {
    let k = at + 1;
    while (k < pts.length && distanceM(pts[k], taps[j]) > SAME_M) k++;
    if (k >= pts.length) {
      at = -1;
      break;
    }
    const inner = pts.slice(at + 1, k);
    legs.push({ mode: inner.length ? 'trail' : 'straight', points: [taps[j - 1], ...inner, taps[j]] });
    at = k;
  }
  if (at >= 0) return legs;
  return taps.slice(1).map((b, i) => straightLeg(taps[i], b));
}
