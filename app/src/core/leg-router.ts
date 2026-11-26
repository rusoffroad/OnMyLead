import type { ActivityId } from './activities';
import { distanceM, type LatLng } from './geo';
import { MAX_SNAP_M, routeAlongTrails, ROUTE_Z, tilesForLeg, type RoadLine, type RouteProfile, type TrailLeg } from './trail-router';
import { tileFor, type Tile } from './trails';

/**
 * Finding one leg of a drawn route (two taps) along the roads and trails, however far apart the
 * taps are. core/trail-router does the snapping inside a box of squares; this decides which
 * squares to read:
 *
 * 1. The box round the two taps (the quick way for close taps).
 * 2. A wider box, for a road that bends out of the first one (mountain roads, a river crossing
 *    a little way off). This was the main reason a leg used to draw straight.
 * 3. For taps too far apart for close squares (a motorcycle ride tapped town to town), the way is
 *    first found on wider, simpler squares, then worked out again on the close squares along it,
 *    so the line still follows every bend.
 *
 * Nothing here touches the network: `load` reads squares (lib/trail-tiles), so it is tested with
 * real squares saved in __tests__/fixtures.
 */
export type LoadLines = (tiles: Tile[]) => Promise<RoadLine[]>;

/** Which lines each activity prefers (see RouteProfile). */
export function routeProfileFor(activity: ActivityId | null | undefined): RouteProfile {
  return activity === 'motorcycle' || activity === 'road_trip' ? 'roads' : 'trails';
}

/** The wider box (step 2): this many times the leg's length round it, at least WIDE_MIN_PAD_M. */
const WIDE_PAD = 0.8;
const WIDE_MIN_PAD_M = 1500;
/** The most close squares the wider box or the corridor may read. */
export const WIDE_MAX_TILES = 100;
export const CORRIDOR_MAX_TILES = 160;
/** The wide squares for a long leg (step 3): the closest zoom that covers it in this many squares. */
const COARSE_MAX_TILES = 36;
const COARSE_ZOOMS = [12, 11, 10, 9];
const COARSE_PAD = 0.3;
const COARSE_WIDE_PAD = 0.8;
const COARSE_MIN_PAD_M = 3000;
/** Round each tap of a long leg, room for its own road to reach the main road. */
const TAP_AREA_PAD_M = 1500;
const TAP_AREA_MAX_TILES = 25;
/** A tap may be this far from a road on the wide squares (they leave out small roads and tracks). */
const COARSE_SNAP_M = 5000;

/** Near a long leg's taps, walking and bike paths stay in (see findLeg). */
const NEAR_TAP_M = 2500;

/** Every square at zoom z the line passes through, with `ring` squares round each. */
export function tilesAlong(points: LatLng[], z: number, ring = 1): Tile[] {
  const seen = new Map<string, Tile>();
  const add = (p: LatLng) => {
    const c = tileFor(p, z);
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const t = { z, x: c.x + dx, y: c.y + dy };
        seen.set(`${t.x}/${t.y}`, t);
      }
    }
  };
  // Fill in long straight stretches so no square in between is missed (squares ~1 km apart at most).
  for (let i = 0; i < points.length; i++) {
    add(points[i]);
    if (i === 0) continue;
    const a = points[i - 1], b = points[i];
    const steps = Math.ceil(distanceM(a, b) / 500);
    for (let k = 1; k < steps; k++) add({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lng: a.lng + ((b.lng - a.lng) * k) / steps });
  }
  return [...seen.values()];
}

/**
 * Wide squares to find a long leg's way on, tried in turn: the closest zoom that holds the box
 * round a and b in COARSE_MAX_TILES or fewer, then a much wider box for a way that swings far
 * round (a lake, a mountain range), then the next zoom out.
 */
export function coarseTiles(a: LatLng, b: LatLng): Tile[][] {
  const pick = (pad: number, after = 0) => {
    for (const z of COARSE_ZOOMS.slice(after)) {
      const t = tilesForLeg(a, b, z, COARSE_MAX_TILES, pad, COARSE_MIN_PAD_M);
      if (t) return { z, t };
    }
    return null;
  };
  const near = pick(COARSE_PAD);
  const far = pick(COARSE_WIDE_PAD);
  const out = [near?.t, far?.t, far ? pick(COARSE_WIDE_PAD, COARSE_ZOOMS.indexOf(far.z) + 1)?.t : undefined];
  const keys = new Set<string>();
  return out.filter((t): t is Tile[] => {
    if (!t) return false;
    const k = `${t[0].z}/${t[0].x}/${t[0].y}/${t.length}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

/** The close squares round a tap and the spot where its way joins the wide squares' road. */
const tapArea = (tap: LatLng, joins: LatLng) => tilesForLeg(tap, joins, ROUTE_Z, TAP_AREA_MAX_TILES, 0.6, TAP_AREA_PAD_M) ?? [];

/**
 * The leg from a to b along the lines, or null when there is no way (a tap far from any line,
 * lines that never meet, or a way round that's an absurd detour). `radiusM` is how far the taps
 * may snap (about a fingertip at the zoom they were made).
 */
export async function findLeg(a: LatLng, b: LatLng, radiusM: number, load: LoadLines, profile: RouteProfile = 'trails'): Promise<TrailLeg | null> {
  const tried = new Set<string>();
  const attempt = async (tiles: Tile[] | null, keep?: (l: RoadLine) => boolean) => {
    if (!tiles?.length) return null;
    const key = tiles.map((t) => `${t.z}/${t.x}/${t.y}`).sort().join(',');
    if (tried.has(key)) return null;
    tried.add(key);
    const all = await load(tiles);
    const lines = keep ? all.filter(keep) : all;
    return lines.length ? routeAlongTrails(lines, a, b, radiusM, profile) : null;
  };

  // 1. The box round the taps.
  const close = tilesForLeg(a, b);
  if (close) {
    const leg = await attempt(close);
    if (leg) return leg;
    // 2. Room for a road that bends out of it.
    const wide = await attempt(tilesForLeg(a, b, ROUTE_Z, WIDE_MAX_TILES, WIDE_PAD, WIDE_MIN_PAD_M));
    if (wide) return wide;
  }

  // 3. Find the way on wide squares, then follow it on the close squares along it.
  let rough: TrailLeg | null = null;
  for (const coarse of coarseTiles(a, b)) {
    const big = await load(coarse);
    rough = big.length ? routeAlongTrails(big, a, b, COARSE_SNAP_M, profile, COARSE_SNAP_M) : null;
    if (rough) break;
  }
  if (!rough) return null;
  // The squares along the rough way, plus the taps' own squares and the stretch from each tap to it.
  const path = [a, ...rough.points, b];
  // On the roads profile a long leg leaves out the walking and bike paths along the way (a city
  // has thousands, and they only slow the phone down); near the taps they stay in.
  const keep =
    profile === 'roads'
      ? (l: RoadLine) => !l.foot || l.pts.some((p, i) => i % 8 === 0 && (distanceM(p, a) < NEAR_TAP_M || distanceM(p, b) < NEAR_TAP_M))
      : undefined;
  for (const ring of [1, 2]) {
    const seen = new Map<string, Tile>();
    for (const t of [...tilesAlong(path, ROUTE_Z, ring), ...tapArea(a, rough.from), ...tapArea(b, rough.to)]) seen.set(`${t.x}/${t.y}`, t);
    const corridor = [...seen.values()];
    if (corridor.length > CORRIDOR_MAX_TILES) break;
    const leg = await attempt(corridor, keep);
    if (leg) return leg;
  }
  // Too far for close squares all the way (or they didn't join up): the wide squares' way is
  // still far better than a straight line, as long as both taps are on it.
  const onIt = distanceM(a, rough.from) <= MAX_SNAP_M && distanceM(b, rough.to) <= MAX_SNAP_M;
  return onIt ? rough : null;
}
