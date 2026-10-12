/**
 * A ride's planned route and where each rider is along it.
 *
 * The leader either taps waypoints on the map (straight lines between them, since trails rarely
 * match a road network) or imports a GPX track. The route is stored with the ride's private
 * details, so only the ride's riders can read it, and riders' positions are placed on it by
 * projecting each live fix onto the nearest part of the line. No turn-by-turn: just the line,
 * how far along everyone is, and who is ahead or behind.
 */
import { distanceM, formatDistance, metersToMiles, type LatLng } from './geo';

export type RouteSource = 'drawn' | 'gpx';

export type RideRoute = {
  /** The full line riders follow. */
  points: LatLng[];
  /** The leader's tapped points for a drawn route (empty for an imported track). */
  waypoints: LatLng[];
  source: RouteSource;
  name: string | null;
  lengthM: number;
  updatedAt: string | null;
};

/** Further than this from the line counts as off route. */
export const OFF_ROUTE_M = 150;
/** Long imported tracks are thinned to this many points so they stay quick to load and draw. */
export const MAX_ROUTE_POINTS = 2500;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validLatLng = (lat: unknown, lng: unknown) => isNum(lat) && isNum(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Total length of a line in meters. */
export function lineLengthM(points: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += distanceM(points[i - 1], points[i]);
  return m;
}

/** Distance from the start to each point, in meters. */
export function cumulativeM(points: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + distanceM(points[i - 1], points[i]));
  return out;
}

// Local flat projection around a reference latitude: plenty accurate over one segment.
const M_PER_DEG_LAT = 111_320;
function toXY(p: LatLng, ref: LatLng) {
  const kx = M_PER_DEG_LAT * Math.cos((ref.lat * Math.PI) / 180);
  return { x: (p.lng - ref.lng) * kx, y: (p.lat - ref.lat) * M_PER_DEG_LAT };
}

/** Distance from p to segment ab in meters, and how far along ab (0..1) the closest point is. */
function toSegment(p: LatLng, a: LatLng, b: LatLng) {
  const A = toXY(a, p);
  const B = toXY(b, p);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / len2));
  const x = A.x + t * dx;
  const y = A.y + t * dy;
  return { t, distM: Math.hypot(x, y) };
}

/** Thin a line (Douglas-Peucker) without moving it more than toleranceM, keeping at most maxPoints. */
export function simplifyLine(points: LatLng[], toleranceM = 4, maxPoints = MAX_ROUTE_POINTS): LatLng[] {
  if (points.length <= 2) return points.slice();
  let tol = toleranceM;
  for (;;) {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      let worst = -1;
      let worstD = tol;
      for (let i = s + 1; i < e; i++) {
        const d = toSegment(points[i], points[s], points[e]).distM;
        if (d > worstD) {
          worstD = d;
          worst = i;
        }
      }
      if (worst > 0) {
        keep[worst] = 1;
        stack.push([s, worst], [worst, e]);
      }
    }
    const out = points.filter((_, i) => keep[i]);
    if (out.length <= maxPoints) return out;
    tol *= 2;
  }
}

/** Drop repeated and invalid points. */
function clean(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of points) {
    if (!validLatLng(p.lat, p.lng)) continue;
    const last = out[out.length - 1];
    if (last && last.lat === p.lat && last.lng === p.lng) continue;
    out.push({ lat: p.lat, lng: p.lng });
  }
  return out;
}

export function makeRoute(opts: { points: LatLng[]; waypoints?: LatLng[]; source: RouteSource; name?: string | null; updatedAt?: string | null }): RideRoute {
  const points = simplifyLine(clean(opts.points));
  return {
    points,
    waypoints: clean(opts.waypoints ?? []),
    source: opts.source,
    name: opts.name?.trim() || null,
    lengthM: lineLengthM(points),
    updatedAt: opts.updatedAt ?? null,
  };
}

/** A route the leader drew by tapping: straight lines between the taps. */
export const routeFromWaypoints = (waypoints: LatLng[], name?: string | null) =>
  makeRoute({ points: waypoints, waypoints, source: 'drawn', name });

const decodeXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();

/**
 * Read a GPX file: the track if it has one, else its route, else its waypoints in order.
 * Throws with a plain message if there is nothing to draw.
 */
export function parseGpx(xml: string): { name: string | null; points: LatLng[] } {
  if (!/<gpx[\s>]/i.test(xml)) throw new Error('That file is not a GPX file. Export the track as GPX and try again.');
  const read = (tag: string) => {
    const out: LatLng[] = [];
    const re = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      const lat = /\blat\s*=\s*["']([^"']+)["']/i.exec(m[1]);
      const lon = /\blon\s*=\s*["']([^"']+)["']/i.exec(m[1]);
      if (lat && lon) out.push({ lat: Number(lat[1]), lng: Number(lon[1]) });
    }
    return clean(out);
  };
  let points = read('trkpt');
  if (points.length < 2) points = read('rtept');
  if (points.length < 2) points = read('wpt');
  if (points.length < 2) throw new Error('That GPX file has no track in it.');
  const nameMatch = /<(?:trk|rte|metadata)\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i.exec(xml);
  return { name: nameMatch ? decodeXml(nameMatch[1]) || null : null, points };
}

export const routeFromGpx = (xml: string) => {
  const { name, points } = parseGpx(xml);
  return makeRoute({ points, source: 'gpx', name });
};

/** What we keep in ride_private_details: GeoJSON for the line, [lng, lat] pairs for the taps. */
export function toStored(route: RideRoute) {
  return {
    route_geojson: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.points.map((p) => [round6(p.lng), round6(p.lat)]) },
      properties: { source: route.source, name: route.name, length_m: Math.round(route.lengthM), updated_at: route.updatedAt ?? new Date().toISOString() },
    },
    waypoints: route.waypoints.map((p) => [round6(p.lng), round6(p.lat)]),
  };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Read what the database (or the offline cache) holds; null when there is no usable route. */
export function fromStored(geojson: unknown, waypoints: unknown): RideRoute | null {
  if (!geojson || typeof geojson !== 'object') return null;
  const g = geojson as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
  if (g.geometry?.type !== 'LineString' || !Array.isArray(g.geometry.coordinates)) return null;
  const pairs = (raw: unknown) =>
    (Array.isArray(raw) ? raw : []).flatMap((c) => (Array.isArray(c) && validLatLng(c[1], c[0]) ? [{ lat: c[1] as number, lng: c[0] as number }] : []));
  const points = pairs(g.geometry.coordinates);
  if (points.length < 2) return null;
  const props = g.properties ?? {};
  return {
    points,
    waypoints: pairs(waypoints),
    source: props.source === 'gpx' ? 'gpx' : 'drawn',
    name: typeof props.name === 'string' ? props.name : null,
    lengthM: lineLengthM(points),
    updatedAt: typeof props.updated_at === 'string' ? props.updated_at : null,
  };
}

export type RoutePlace = { alongM: number; offRouteM: number; onRoute: boolean };

/**
 * Where a fix sits on the route. On loops and out-and-backs the line passes the same spot twice,
 * so when several parts of the line are about equally close, the one nearest the rider's last
 * known progress (hintAlongM) wins; that keeps someone on the way out from jumping to the way back.
 */
export function locateOnRoute(points: LatLng[], cum: number[], p: LatLng, hintAlongM?: number | null): RoutePlace | null {
  if (points.length < 2) return null;
  const hits: { alongM: number; distM: number }[] = [];
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const { t, distM } = toSegment(p, points[i - 1], points[i]);
    hits.push({ alongM: cum[i - 1] + t * (cum[i] - cum[i - 1]), distM });
    if (distM < best) best = distM;
  }
  const near = hits.filter((h) => h.distM <= best + Math.max(40, best * 0.25));
  const pick =
    hintAlongM != null
      ? near.reduce((a, b) => (Math.abs(b.alongM - hintAlongM) < Math.abs(a.alongM - hintAlongM) ? b : a))
      : near.reduce((a, b) => (b.distM < a.distM ? b : a));
  return { alongM: pick.alongM, offRouteM: pick.distM, onRoute: pick.distM <= OFF_ROUTE_M };
}

export type RouteRider = { id: string; role: 'leader' | 'sweep' | 'rider'; at: LatLng | null };
export type PlacedRider = RouteRider & { place: RoutePlace | null };

/** Place every rider with a position on the route. */
export function placeRiders(route: RideRoute, riders: RouteRider[], hints: Record<string, number> = {}): PlacedRider[] {
  const cum = cumulativeM(route.points);
  return riders.map((r) => ({ ...r, place: r.at ? locateOnRoute(route.points, cum, r.at, hints[r.id]) : null }));
}

export const miles = (m: number) => {
  const mi = metersToMiles(Math.max(0, m));
  return mi >= 100 ? Math.round(mi).toString() : mi.toFixed(1);
};

const gap = (m: number) => (metersToMiles(Math.abs(m)) < 0.1 ? formatDistance(Math.abs(m)) : `${miles(Math.abs(m))} mi`);

export type MyRouteSummary = {
  /** e.g. "12.3" */
  doneMi: string;
  /** e.g. "40.2" */
  totalMi: string;
  /** e.g. "27.9 mi to go" */
  toGo: string;
  /** One plain sentence comparing this rider with the group. */
  compared: string;
  offRoute: string | null;
};

/** This rider's place on the route, in words a rider can take in at a glance. */
export function summarizeMe(route: RideRoute, placed: PlacedRider[], meId: string | undefined): MyRouteSummary | null {
  const me = placed.find((r) => r.id === meId);
  if (!me?.place) return null;
  const along = me.place.alongM;
  const others = placed.filter((r) => r.id !== meId && r.place?.onRoute);
  const leader = others.find((r) => r.role === 'leader');
  const sweep = others.find((r) => r.role === 'sweep');
  const ahead = others.filter((r) => r.place!.alongM > along + 30).length;
  const behind = others.filter((r) => r.place!.alongM < along - 30).length;

  let compared: string;
  if (!others.length) compared = 'Nobody else is sharing a spot on the route yet.';
  else if (me.role === 'leader') {
    const last = Math.min(...others.map((r) => r.place!.alongM));
    compared = along - last < 30 ? 'The group is right with you.' : `You're out front. ${sweep ? 'Sweep' : 'The last rider'} is ${gap(along - (sweep?.place!.alongM ?? last))} back.`;
  } else if (leader) {
    const d = leader.place!.alongM - along;
    compared = Math.abs(d) < 30 ? "You're right with the leader." : d > 0 ? `The leader is ${gap(d)} ahead.` : `You're ${gap(d)} past the leader.`;
    if (me.role !== 'sweep' && behind === 0 && ahead > 0) compared += ' Nobody is behind you.';
  } else {
    compared = `${ahead} ${ahead === 1 ? 'rider' : 'riders'} ahead of you, ${behind} behind.`;
  }

  return {
    doneMi: miles(along),
    totalMi: miles(route.lengthM),
    toGo: `${miles(route.lengthM - along)} mi to go`,
    compared,
    offRoute: me.place.onRoute ? null : `You're ${gap(me.place.offRouteM)} off the route.`,
  };
}

/** A box around the route for fitting the map, padded a little. */
export function routeBounds(points: LatLng[]) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Places riders on one route over time, remembering each rider's progress between fixes. */
export class RouteTracker {
  private hints: Record<string, number> = {};

  place(route: RideRoute, riders: RouteRider[]): PlacedRider[] {
    const placed = placeRiders(route, riders, this.hints);
    for (const r of placed) if (r.place) this.hints[r.id] = r.place.alongM;
    return placed;
  }
}
