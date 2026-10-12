import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

import { distanceM, type LatLng } from './geo';
import { tilesInBox, type Tile } from './trails';

/**
 * Snap-to-trail routing for the route builder, worked out on the phone (or in the browser) from
 * the same free OpenStreetMap squares the trail layer already draws (core/osm-trails). No routing
 * server, no key and nothing sent anywhere: the squares around two taps are turned into a little
 * road-and-trail network, both taps are pulled onto the nearest line, and the shortest way along
 * the lines between them becomes that part of the route.
 *
 * Squares are cut and simplified one at a time, so lines from neighbouring squares don't share
 * exact points and some junctions lose their shared point. The network stitches those back:
 * points within a meter or so are one point, crossing lines are joined where they cross, and a
 * line that stops right next to another (a T junction, or a square's edge) is joined to it.
 */

/** Routing reads the closest squares made (zoom 14), whatever the map's zoom. */
export const ROUTE_Z = 14;
/** The most squares one leg may read (about 13 km across); further apart than that draws straight. */
export const ROUTE_MAX_TILES = 49;
/** A tap further than this from any line can't snap, at any zoom. */
export const MAX_SNAP_M = 250;

/** How far a tap may snap: about a fingertip (24 points) at the map's zoom, at least 15 m. */
export const snapRadiusM = (metersPerPoint: number) => Math.min(MAX_SNAP_M, Math.max(15, metersPerPoint * 24));

/** One line of the network: its OpenMapTiles class and how much slower than a dirt track it counts. */
export type RoadLine = { cost: number; pts: LatLng[]; /** A bridge or tunnel: lines crossing it aren't joined to it. */ over?: boolean };

/**
 * How each kind of line is weighed: the shortest way wins, but a highway counts as several times
 * its length so a route stays on dirt and back roads where it can. Classes not listed (rail,
 * ferries, buildings' corridors, lines still under construction) are never followed.
 */
const CLASS_COST: Record<string, number> = {
  track: 1,
  minor: 1,
  service: 1.05,
  tertiary: 1.05,
  raceway: 1,
  path: 1.25,
  secondary: 1.15,
  primary: 1.4,
  trunk: 2.5,
  motorway: 6,
};
/** Paths made for walkers and bikes are only followed when nothing else goes there. */
const FOOT_PATHS = new Set(['footway', 'pedestrian', 'cycleway']);
const NEVER_PATHS = new Set(['steps', 'corridor', 'platform', 'elevator']);

/** A point inside a square (0..extent) to lat/lng. */
function toLatLng(t: Tile, extent: number, px: number, py: number): LatLng {
  const n = 2 ** t.z;
  const lng = ((t.x + px / extent) / n) * 360 - 180;
  const yy = (t.y + py / extent) / n;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * yy))) * 180) / Math.PI, lng };
}

/** Every road and trail in one OpenMapTiles square that a vehicle could follow. */
export function decodeRoadLines(data: Uint8Array, t: Tile): RoadLine[] {
  let tile: VectorTile;
  try {
    tile = new VectorTile(new Pbf(data));
  } catch {
    return [];
  }
  const layer = tile.layers.transportation;
  if (!layer) return [];
  const out: RoadLine[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 2) continue;
    const cls = String(f.properties.class ?? '');
    let cost = CLASS_COST[cls];
    if (!cost) continue;
    if (cls === 'path') {
      const sub = String(f.properties.subclass ?? '');
      if (NEVER_PATHS.has(sub)) continue;
      if (FOOT_PATHS.has(sub)) cost = 3;
    }
    for (const ring of f.loadGeometry()) {
      if (ring.length < 2) continue;
      const over = f.properties.brunnel === 'bridge' || f.properties.brunnel === 'tunnel';
      out.push({ cost, pts: ring.map((p) => toLatLng(t, layer.extent, p.x, p.y)), ...(over ? { over } : {}) });
    }
  }
  return out;
}

/** The squares a leg from a to b needs, with room around it for a trail that bends away; null when too many. */
export function tilesForLeg(a: LatLng, b: LatLng, z = ROUTE_Z, cap = ROUTE_MAX_TILES): Tile[] | null {
  const padM = Math.max(400, distanceM(a, b) * 0.3);
  const dLat = padM / 111_320;
  const dLng = padM / (111_320 * Math.max(0.1, Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)));
  const tiles = tilesInBox(
    {
      minLat: Math.min(a.lat, b.lat) - dLat,
      maxLat: Math.max(a.lat, b.lat) + dLat,
      minLng: Math.min(a.lng, b.lng) - dLng,
      maxLng: Math.max(a.lng, b.lng) + dLng,
    },
    z,
  );
  return tiles.length > cap ? null : tiles;
}

/** The squares needed to snap one tap (its own square and the ones next to it). */
export function tilesAround(p: LatLng, z = ROUTE_Z): Tile[] {
  return tilesForLeg(p, p, z) ?? [];
}

// ---------------------------------------------------------------------------------------------
// The network, in meters on a flat local grid around the first tap (plenty accurate over a leg).

type Proj = { kx: number; ky: number; ref: LatLng };
const projFor = (ref: LatLng): Proj => ({ ref, ky: 111_320, kx: 111_320 * Math.cos((ref.lat * Math.PI) / 180) });

/** Points this close together are the same point (squares round to about half a meter). */
const MERGE_M = 1.2;
/** A line that stops this close to another line is joined to it. */
const JOIN_M = 8;
const SEG_CELL = 40;

type Edge = { a: number; b: number; cost: number };

class Network {
  xs: number[] = [];
  ys: number[] = [];
  adj: { to: number; w: number }[][] = [];
  edges: Edge[] = [];
  private cells = new Map<string, number[]>();

  constructor(readonly proj: Proj) {}

  x(p: LatLng) {
    return (p.lng - this.proj.ref.lng) * this.proj.kx;
  }
  y(p: LatLng) {
    return (p.lat - this.proj.ref.lat) * this.proj.ky;
  }
  latLng(n: number): LatLng {
    return { lat: this.proj.ref.lat + this.ys[n] / this.proj.ky, lng: this.proj.ref.lng + this.xs[n] / this.proj.kx };
  }

  /** The point at x,y, reusing one already within MERGE_M. */
  node(x: number, y: number): number {
    const cx = Math.floor(x / (MERGE_M * 2));
    const cy = Math.floor(y / (MERGE_M * 2));
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const n of this.cells.get(`${cx + i},${cy + j}`) ?? []) {
          if (Math.hypot(this.xs[n] - x, this.ys[n] - y) <= MERGE_M) return n;
        }
      }
    }
    const n = this.xs.length;
    this.xs.push(x);
    this.ys.push(y);
    this.adj.push([]);
    const key = `${cx},${cy}`;
    const cell = this.cells.get(key);
    if (cell) cell.push(n);
    else this.cells.set(key, [n]);
    return n;
  }

  link(a: number, b: number, factor: number) {
    if (a === b) return;
    const w = Math.hypot(this.xs[a] - this.xs[b], this.ys[a] - this.ys[b]) * factor;
    this.adj[a].push({ to: b, w });
    this.adj[b].push({ to: a, w });
    this.edges.push({ a, b, cost: factor });
  }
}

type Seg = { line: number; i: number; ax: number; ay: number; bx: number; by: number };

/** Where segment p crosses segment q, as fractions along each, or null. */
function crossing(p: Seg, q: Seg): [number, number] | null {
  const rx = p.bx - p.ax, ry = p.by - p.ay;
  const sx = q.bx - q.ax, sy = q.by - q.ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qpx = q.ax - p.ax, qpy = q.ay - p.ay;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [t, u] : null;
}

/** Closest point on segment s to x,y: fraction along it and distance in meters. */
function onSeg(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  const px = ax + t * dx, py = ay + t * dy;
  return { t, px, py, d: Math.hypot(x - px, y - py) };
}

export function buildNetwork(lines: RoadLine[], ref: LatLng): Network {
  const net = new Network(projFor(ref));
  const xy = lines.map((l) => l.pts.map((p) => [net.x(p), net.y(p)] as const));

  const segs: Seg[] = [];
  const grid = new Map<string, number[]>();
  xy.forEach((pts, line) => {
    for (let i = 1; i < pts.length; i++) {
      const s: Seg = { line, i: i - 1, ax: pts[i - 1][0], ay: pts[i - 1][1], bx: pts[i][0], by: pts[i][1] };
      const id = segs.push(s) - 1;
      const x0 = Math.floor((Math.min(s.ax, s.bx) - JOIN_M) / SEG_CELL), x1 = Math.floor((Math.max(s.ax, s.bx) + JOIN_M) / SEG_CELL);
      const y0 = Math.floor((Math.min(s.ay, s.by) - JOIN_M) / SEG_CELL), y1 = Math.floor((Math.max(s.ay, s.by) + JOIN_M) / SEG_CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const key = `${cx},${cy}`;
          const cell = grid.get(key);
          if (cell) cell.push(id);
          else grid.set(key, [id]);
        }
      }
    }
  });

  // Extra points along a segment: crossings and joins, as [fraction, node].
  const splits = new Map<number, [number, number][]>();
  const split = (seg: number, t: number, n: number) => {
    const list = splits.get(seg);
    if (list) list.push([t, n]);
    else splits.set(seg, [[t, n]]);
  };

  const seen = new Set<string>();
  for (const cell of grid.values()) {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        const p = segs[cell[i]], q = segs[cell[j]];
        if (p.line === q.line && Math.abs(p.i - q.i) <= 1) continue;
        // A bridge passes over the road under it; they only meet at the bridge's ends.
        if (lines[p.line].over !== lines[q.line].over) continue;
        const key = cell[i] < cell[j] ? `${cell[i]}:${cell[j]}` : `${cell[j]}:${cell[i]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hit = crossing(p, q);
        if (!hit) continue;
        const n = net.node(p.ax + hit[0] * (p.bx - p.ax), p.ay + hit[0] * (p.by - p.ay));
        split(cell[i], hit[0], n);
        split(cell[j], hit[1], n);
      }
    }
  }

  // A line that stops beside another is joined to it with a short link.
  const joins: [number, number, number][] = [];
  xy.forEach((pts, line) => {
    for (const end of [0, pts.length - 1]) {
      const [x, y] = pts[end];
      const own = end === 0 ? 0 : pts.length - 2;
      let best: { seg: number; t: number; px: number; py: number; d: number } | null = null;
      const cell = grid.get(`${Math.floor(x / SEG_CELL)},${Math.floor(y / SEG_CELL)}`) ?? [];
      for (const id of cell) {
        const s = segs[id];
        if (s.line === line && Math.abs(s.i - own) <= 1) continue;
        const o = onSeg(x, y, s.ax, s.ay, s.bx, s.by);
        if (o.d <= JOIN_M && (!best || o.d < best.d)) best = { seg: id, ...o };
      }
      if (!best) continue;
      const at = net.node(best.px, best.py);
      split(best.seg, best.t, at);
      joins.push([net.node(x, y), at, lines[line].cost]);
    }
  });

  segs.forEach((s, id) => {
    const cost = lines[s.line].cost;
    const along: [number, number][] = [[0, net.node(s.ax, s.ay)], ...(splits.get(id) ?? []), [1, net.node(s.bx, s.by)]];
    along.sort((p, q) => p[0] - q[0]);
    for (let k = 1; k < along.length; k++) net.link(along[k - 1][1], along[k][1], cost);
  });
  for (const [a, b, cost] of joins) net.link(a, b, cost);
  return net;
}

type Snap = { edge: Edge; t: number; x: number; y: number; d: number };

function snapOnto(net: Network, p: LatLng, radiusM: number): Snap | null {
  const x = net.x(p), y = net.y(p);
  let best: Snap | null = null;
  for (const e of net.edges) {
    const o = onSeg(x, y, net.xs[e.a], net.ys[e.a], net.xs[e.b], net.ys[e.b]);
    if (o.d <= radiusM && (!best || o.d < best.d)) best = { edge: e, t: o.t, x: o.px, y: o.py, d: o.d };
  }
  return best;
}

/** A small binary heap of [priority, node]. */
class Heap {
  private h: [number, number][] = [];
  get size() {
    return this.h.length;
  }
  push(v: [number, number]) {
    const h = this.h;
    h.push(v);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const h = this.h;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}

export type TrailLeg = {
  /** The leg's line, from the snapped start to the snapped end. */
  points: LatLng[];
  /** Where the two taps landed on the trails. */
  from: LatLng;
  to: LatLng;
};

/** A trail route this much longer than the straight line is a detour nobody meant. */
const MAX_DETOUR = 5;

/**
 * The way along the trails from a to b, or null when either tap is too far from a line, the
 * lines don't connect, or the only way round is a long detour.
 */
export function routeAlongTrails(lines: RoadLine[], a: LatLng, b: LatLng, radiusM: number): TrailLeg | null {
  if (!lines.length) return null;
  const r = Math.min(MAX_SNAP_M, radiusM);
  const net = buildNetwork(lines, a);
  const sa = snapOnto(net, a, r);
  const sb = snapOnto(net, b, r);
  if (!sa || !sb) return null;

  // The two snapped taps join the network partway along their lines.
  const s = net.node(sa.x, sa.y);
  const g = net.node(sb.x, sb.y);
  const hook = (snap: Snap, n: number) => {
    net.link(n, snap.edge.a, snap.edge.cost);
    net.link(n, snap.edge.b, snap.edge.cost);
  };
  hook(sa, s);
  hook(sb, g);
  if (sa.edge === sb.edge) net.link(s, g, sa.edge.cost);

  const from = net.latLng(s);
  const to = net.latLng(g);
  if (s === g) return { points: [from, to], from, to };

  const gx = net.xs[g], gy = net.ys[g];
  const h = (n: number) => Math.hypot(net.xs[n] - gx, net.ys[n] - gy);
  const best = new Map<number, number>([[s, 0]]);
  const prev = new Map<number, number>();
  const open = new Heap();
  open.push([h(s), s]);
  let visits = 0;
  while (open.size && visits++ < 400_000) {
    const [, n] = open.pop();
    if (n === g) break;
    const gn = best.get(n)!;
    for (const { to: m, w } of net.adj[n]) {
      const cost = gn + w;
      if (cost < (best.get(m) ?? Infinity)) {
        best.set(m, cost);
        prev.set(m, n);
        open.push([cost + h(m), m]);
      }
    }
  }
  if (!prev.has(g)) return null;
  const path = [g];
  while (path[path.length - 1] !== s) path.push(prev.get(path[path.length - 1])!);
  path.reverse();
  const points = path.map((n) => net.latLng(n));
  let len = 0;
  for (let i = 1; i < points.length; i++) len += distanceM(points[i - 1], points[i]);
  if (len > Math.max(MAX_DETOUR * distanceM(from, to), 600)) return null;
  return { points, from, to };
}

/** Where a tap lands on the nearest trail or road, or null when there's none within radiusM. */
export function snapToTrails(lines: RoadLine[], p: LatLng, radiusM: number): LatLng | null {
  if (!lines.length) return null;
  let best: { d: number; at: LatLng } | null = null;
  const pr = projFor(p);
  for (const l of lines) {
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], b = l.pts[i];
      const o = onSeg(0, 0, (a.lng - p.lng) * pr.kx, (a.lat - p.lat) * pr.ky, (b.lng - p.lng) * pr.kx, (b.lat - p.lat) * pr.ky);
      if (o.d <= Math.min(MAX_SNAP_M, radiusM) && (!best || o.d < best.d)) {
        best = { d: o.d, at: { lat: p.lat + o.py / pr.ky, lng: p.lng + o.px / pr.kx } };
      }
    }
  }
  return best?.at ?? null;
}
