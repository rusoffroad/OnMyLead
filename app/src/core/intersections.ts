/**
 * Zoom In at Intersections (2.1): while following the rider, the map zooms in as they come up on
 * a road or trail junction, so they see it close up, and zooms back to where it was once they're
 * through it. A rider switch on the You tab, on by default.
 *
 * The roads come from what the map has drawn around the rider (Mapbox road, track and path lines),
 * so this works wherever a line is on the map, online or from a downloaded area. Pure, so the rules
 * are tested without a phone.
 */
import { MOVING_SPEED_MPS } from './bubble';
import { distanceM, type LatLng } from './geo';

/** Line classes that count as a road or trail (Mapbox Streets and OpenMapTiles names). */
export const JUNCTION_CLASSES = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'street', 'street_limited', 'minor', 'residential', 'unclassified', 'service',
  'track', 'path', 'link',
]);

/**
 * The map query's filter: only road and trail lines (and the app's own track copies, which carry
 * `path`) come back, so the lookup stays small however much else the map draws.
 */
export const JUNCTION_QUERY_FILTER = ['any', ['match', ['get', 'class'], [...JUNCTION_CLASSES], true, false], ['has', 'path']];

/** Look for the next junction at most this often (ms): a junction 220 m ahead is seconds away. */
export const JUNCTION_LOOK_EVERY_MS = 2000;

/** Whether a drawn map line is a road or trail worth zooming in for. */
export function isJunctionLine(props: Record<string, unknown> | null | undefined): boolean {
  if (!props) return false;
  const c = props.class;
  if (typeof c === 'string') return JUNCTION_CLASSES.has(c);
  // The app's own OpenStreetMap track copies carry `path` and `closed` instead of a class.
  return typeof props.path === 'boolean';
}

/** Lines from a GeoJSON query of the drawn map: every road or trail piece as a list of points. */
export function junctionLines(features: readonly { geometry?: { type: string; coordinates: unknown } | null; properties?: Record<string, unknown> | null }[]): LatLng[][] {
  const out: LatLng[][] = [];
  for (const f of features) {
    if (!f.geometry || !isJunctionLine(f.properties)) continue;
    const g = f.geometry;
    const parts = g.type === 'LineString' ? [g.coordinates as number[][]] : g.type === 'MultiLineString' ? (g.coordinates as number[][][]) : [];
    for (const p of parts) if (p.length >= 2) out.push(p.map((c) => ({ lng: c[0], lat: c[1] })));
  }
  return out;
}

/** Look this far ahead for a junction (m). */
export const JUNCTION_AHEAD_M = 220;
/** A junction counts when it is within this angle either side of the way the rider is heading. */
export const JUNCTION_CONE_DEG = 40;
/** Two lines meeting at less than this angle are one road split in two pieces, not a junction. */
export const JUNCTION_MIN_ANGLE_DEG = 25;
/** An end of one line this close to another line is a T junction (m). */
const TOUCH_M = 4;

type XY = { x: number; y: number };
type Seg = { a: XY; b: XY; line: number };

/** The nearest junction ahead of the rider within JUNCTION_AHEAD_M, or null. */
export function nextJunction(at: LatLng, headingDeg: number | null, lines: LatLng[][], aheadM = JUNCTION_AHEAD_M): { at: LatLng; distM: number } | null {
  if (headingDeg == null || !Number.isFinite(headingDeg) || lines.length < 2) return null;
  // Flat meters around the rider: x east, y north.
  const kx = 111_320 * Math.cos((at.lat * Math.PI) / 180);
  const ky = 110_540;
  const toXY = (p: LatLng): XY => ({ x: (p.lng - at.lng) * kx, y: (p.lat - at.lat) * ky });
  const reach = aheadM + 60;
  const segs: Seg[] = [];
  lines.forEach((l, i) => {
    for (let k = 1; k < l.length; k++) {
      const a = toXY(l[k - 1]);
      const b = toXY(l[k]);
      if (Math.min(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y)) > reach + Math.hypot(b.x - a.x, b.y - a.y)) continue;
      segs.push({ a, b, line: i });
    }
  });
  const h = (headingDeg * Math.PI) / 180;
  const dir = { x: Math.sin(h), y: Math.cos(h) };
  let best: { p: XY; d: number } | null = null;
  const consider = (p: XY, s1: Seg, s2: Seg) => {
    if (!crossAngleOk(s1, s2)) return;
    const d = Math.hypot(p.x, p.y);
    if (d > aheadM || d < 1) return;
    const cos = (p.x * dir.x + p.y * dir.y) / d;
    if (cos < Math.cos((JUNCTION_CONE_DEG * Math.PI) / 180)) return;
    if (!best || d < best.d) best = { p, d };
  };
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];
      if (s1.line === s2.line) continue;
      // Far apart: skip the arithmetic.
      if (Math.min(s1.a.x, s1.b.x) > Math.max(s2.a.x, s2.b.x) + TOUCH_M || Math.min(s2.a.x, s2.b.x) > Math.max(s1.a.x, s1.b.x) + TOUCH_M) continue;
      if (Math.min(s1.a.y, s1.b.y) > Math.max(s2.a.y, s2.b.y) + TOUCH_M || Math.min(s2.a.y, s2.b.y) > Math.max(s1.a.y, s1.b.y) + TOUCH_M) continue;
      const x = crossing(s1, s2);
      if (x) {
        consider(x, s1, s2);
        continue;
      }
      // A line ending on (or very near) another: a T junction or two pieces meeting.
      for (const [end, other, mine] of [[s1.a, s2, s1], [s1.b, s2, s1], [s2.a, s1, s2], [s2.b, s1, s2]] as const) {
        if (distToSeg(end, other) <= TOUCH_M) consider(end, mine, other);
      }
    }
  }
  if (!best) return null;
  const b = best as { p: XY; d: number };
  return { at: { lat: at.lat + b.p.y / ky, lng: at.lng + b.p.x / kx }, distM: b.d };
}

function crossing(s1: Seg, s2: Seg): XY | null {
  const r = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
  const s = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const qp = { x: s2.a.x - s1.a.x, y: s2.a.y - s1.a.y };
  const t = (qp.x * s.y - qp.y * s.x) / den;
  const u = (qp.x * r.y - qp.y * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: s1.a.x + t * r.x, y: s1.a.y + t * r.y };
}

function distToSeg(p: XY, s: Seg): number {
  const vx = s.b.x - s.a.x;
  const vy = s.b.y - s.a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / len2)) : 0;
  return Math.hypot(p.x - (s.a.x + t * vx), p.y - (s.a.y + t * vy));
}

/** The two lines meet at a real angle (not one road continuing straight on in a second piece). */
function crossAngleOk(s1: Seg, s2: Seg): boolean {
  const a1 = Math.atan2(s1.b.y - s1.a.y, s1.b.x - s1.a.x);
  const a2 = Math.atan2(s2.b.y - s2.a.y, s2.b.x - s2.a.x);
  let d = (Math.abs(a1 - a2) * 180) / Math.PI % 180;
  if (d > 90) d = 180 - d;
  return d >= JUNCTION_MIN_ANGLE_DEG;
}

/** Zoom in when a junction is this close: about 9 seconds out, never closer than 70 m nor farther than 200 m. */
export function junctionTriggerM(speedMps: number | null): number {
  return Math.max(70, Math.min(200, (speedMps ?? 0) * 9));
}
/** How close the zoom goes (Mapbox zoom): enough to see the turn, never past street level. */
export const JUNCTION_ZOOM = 17;
export const JUNCTION_MAX_ZOOM = 18;
/** Through it: this far past the junction and moving away (m). */
export const JUNCTION_CLEAR_M = 35;
/** Never hold the close-up longer than this (ms), in case the rider stops at the junction. */
export const JUNCTION_HOLD_MAX_MS = 60_000;

export type JunctionZoom =
  | { state: 'idle' }
  | { state: 'in'; restoreZoom: number; at: LatLng; closestM: number; sinceMs: number };
export const JUNCTION_ZOOM_START: JunctionZoom = { state: 'idle' };

/**
 * One step of Zoom In at Intersections, from the rider's newest fix. Returns the next state and,
 * when the camera should change, the zoom to go to.
 */
export function junctionZoomStep(
  s: JunctionZoom,
  ctx: { on: boolean; nowMs: number; zoom: number; at: LatLng; speedMps: number | null; junction: { at: LatLng; distM: number } | null },
): { next: JunctionZoom; zoom: number | null } {
  if (s.state === 'in') {
    if (!ctx.on) return { next: JUNCTION_ZOOM_START, zoom: s.restoreZoom };
    const d = distanceM(ctx.at, s.at);
    const closestM = Math.min(s.closestM, d);
    const through = d >= JUNCTION_CLEAR_M && d > closestM + 15;
    if (through || ctx.nowMs - s.sinceMs >= JUNCTION_HOLD_MAX_MS) return { next: JUNCTION_ZOOM_START, zoom: s.restoreZoom };
    return { next: { ...s, closestM }, zoom: null };
  }
  if (!ctx.on || !ctx.junction || !(ctx.speedMps != null && ctx.speedMps >= MOVING_SPEED_MPS)) return { next: s, zoom: null };
  if (ctx.junction.distM > junctionTriggerM(ctx.speedMps)) return { next: s, zoom: null };
  const target = Math.min(JUNCTION_MAX_ZOOM, Math.max(JUNCTION_ZOOM, ctx.zoom + 1.5));
  // Already zoomed in that far: nothing to do.
  if (target <= ctx.zoom + 0.5) return { next: s, zoom: null };
  return {
    next: { state: 'in', restoreZoom: ctx.zoom, at: ctx.junction.at, closestM: ctx.junction.distM, sinceMs: ctx.nowMs },
    zoom: target,
  };
}
