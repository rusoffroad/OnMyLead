import type { LatLng } from './geo';
import { DIFFICULTIES } from './nav-trails';
import { decodePolyline } from './polyline';
import { TRAIL_INK } from './trails';

import { tc } from './i18n';
/**
 * Park Trails: the trails of offroad parks (private parks, state OHV parks and OHV areas), drawn on
 * every map for every rider. The lines come from OpenStreetMap, where many parks are mapped trail
 * by trail with the park's own names and levels (Hidden Falls Adventure Park is one), pulled into
 * the park_trails table by app/scripts/parks/import.mjs (migration 20261104180000_park_trails.sql).
 * Parks' own copyrighted maps are never copied; OpenStreetMap's license allows this with credit.
 */

export const PARK_TRAILS_ATTRIBUTION = '© OpenStreetMap contributors';
/** Park trails load once the map is in this far (about 40 miles across a phone), like rider trails. */
export const PARK_TRAILS_MIN_Z = 10;
/** Park names are drawn from this far out, so a rider panning the state sees where the parks are. */
export const PARK_NAMES_MIN_Z = 7;
/** The most lines kept on screen on a phone (every line of the biggest parks is under this). */
export const PARK_TRAILS_MAX_LINES = 900;

export type ParkTrail = {
  id: string;
  parkOsmId: number;
  parkName: string;
  parkState: string | null;
  parkWebsite: string | null;
  name: string | null;
  /** The park's own rating when its name carried one: 1 easiest to 5 hardest. */
  level: number | null;
  kind: 'trail' | 'road';
  closed: boolean;
  oneway: boolean;
  surface: string | null;
  points: LatLng[];
  lengthM: number;
  attribution: string;
  box: { minLat: number; minLng: number; maxLat: number; maxLng: number };
};

export type ParkSummary = {
  parkOsmId: number;
  parkName: string;
  parkState: string | null;
  parkWebsite: string | null;
  trailCount: number;
  trailM: number;
  center: LatLng;
  box: { minLat: number; minLng: number; maxLat: number; maxLng: number };
};

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const box4 = (v: unknown) => {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [minLat, minLng, maxLat, maxLng] = v.map(num);
  if (minLat == null || minLng == null || maxLat == null || maxLng == null) return null;
  return { minLat, minLng, maxLat, maxLng };
};

/** Reads one park_trail_json row; null when it's not usable. */
export function parseParkTrail(v: unknown): ParkTrail | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const id = str(r.id);
  const parkOsmId = num(r.park_osm_id);
  const parkName = str(r.park_name);
  const enc = str(r.route_enc);
  const box = box4(r.box);
  if (!id || parkOsmId == null || !parkName || !enc || !box) return null;
  const points = decodePolyline(enc);
  if (points.length < 2) return null;
  const level = num(r.level);
  return {
    id,
    parkOsmId,
    parkName,
    parkState: str(r.park_state),
    parkWebsite: str(r.park_website),
    name: str(r.name),
    level: level != null && level >= 1 && level <= 5 ? Math.round(level) : null,
    kind: r.kind === 'road' ? 'road' : 'trail',
    closed: r.closed === true,
    oneway: r.oneway === true,
    surface: str(r.surface),
    points,
    lengthM: num(r.length_m) ?? 0,
    attribution: str(r.attribution) ?? PARK_TRAILS_ATTRIBUTION,
    box,
  };
}

export const parseParkTrails = (v: unknown): ParkTrail[] =>
  (Array.isArray(v) ? v : []).map(parseParkTrail).filter((t): t is ParkTrail => !!t);

export function parseParkSummary(v: unknown): ParkSummary | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const parkOsmId = num(r.park_osm_id);
  const parkName = str(r.park_name);
  const box = box4(r.box);
  const c = r.center as Record<string, unknown> | undefined;
  const lat = num(c?.lat);
  const lng = num(c?.lng);
  if (parkOsmId == null || !parkName || !box || lat == null || lng == null) return null;
  return {
    parkOsmId,
    parkName,
    parkState: str(r.park_state),
    parkWebsite: str(r.park_website),
    trailCount: num(r.trail_count) ?? 0,
    trailM: num(r.trail_m) ?? 0,
    center: { lat, lng },
    box,
  };
}

export const parseParkSummaries = (v: unknown): ParkSummary[] =>
  (Array.isArray(v) ? v : []).map(parseParkSummary).filter((p): p is ParkSummary => !!p);

// --- How they are drawn ---------------------------------------------------------------------------

/**
 * Park trail colors follow the trailhead sign: green for the easy ones, blue, then white for the
 * hard ones and red for the extreme, the same colors rider trails use for their difficulty, so a
 * level 3 park trail and a Moderate rider trail read alike. Unrated trails are amber, like every
 * other trail; park roads are the road white; closed trails red.
 */
export const PARK_LEVEL_COLORS: Record<number, string> = {
  1: DIFFICULTIES[0].color,
  2: DIFFICULTIES[0].color,
  3: DIFFICULTIES[1].color,
  4: DIFFICULTIES[2].color,
  5: DIFFICULTIES[3].color,
};

export function parkTrailColor(t: Pick<ParkTrail, 'level' | 'kind' | 'closed'>): string {
  if (t.closed) return TRAIL_INK.closed;
  if (t.kind === 'road') return TRAIL_INK.road;
  return (t.level != null && PARK_LEVEL_COLORS[t.level]) || TRAIL_INK.trail;
}

/** "Level 3 of 5", or the kind when the park gave no level. */
export function parkLevelLabel(t: Pick<ParkTrail, 'level' | 'kind' | 'closed'>): string {
  if (t.closed) return tc('Closed');
  if (t.level != null) return tc('Level {n} of 5', { n: t.level });
  return t.kind === 'road' ? tc('Park Road') : tc('Trail');
}

/** The park's levels on one line for the legend: 1-2 easiest ... 5 hardest. */
export const PARK_LEVEL_LEGEND: { level: number; label: string }[] = [
  { level: 1, label: '1-2' },
  { level: 3, label: '3' },
  { level: 4, label: '4' },
  { level: 5, label: '5' },
];

/** Miles with one decimal, or feet under a quarter mile, in the rider's units. */
export function parkTrailLength(lengthM: number, metric = false): string {
  if (metric) return lengthM < 1000 ? tc('{n} m', { n: Math.round(lengthM) }) : tc('{n} km', { n: (lengthM / 1000).toFixed(1) });
  const miles = lengthM / 1609.344;
  return miles < 0.25 ? tc('{n} ft', { n: Math.round(lengthM * 3.28084) }) : tc('{n} mi', { n: miles.toFixed(1) });
}

// --- What to draw -----------------------------------------------------------------------------

/**
 * Lines for the map at this zoom: all of them close in; far out, the longest first so the main
 * trails of a park are there before its spurs, and roads only when there is room.
 */
export function drawableParkTrails(trails: ParkTrail[], zoom: number, limit = PARK_TRAILS_MAX_LINES): ParkTrail[] {
  if (trails.length <= limit) return trails;
  const sorted = [...trails].sort((a, b) => b.lengthM - a.lengthM);
  return sorted.slice(0, zoom >= 13 ? limit : Math.round(limit / 2));
}

export type ParkLabel = { key: string; name: string; at: LatLng; closed: boolean; level: number | null };

/**
 * One tag per named trail in view, at the middle of the line; `gap` (degrees) is about one tag
 * on screen so tags don't pile on each other. Closed trails say so.
 */
export function parkTrailLabels(trails: ParkTrail[], limit: number, gap?: { lat: number; lng: number }): ParkLabel[] {
  const seen = new Set<string>();
  const out: ParkLabel[] = [];
  const longestFirst = [...trails].filter((t) => t.name).sort((a, b) => b.lengthM - a.lengthM);
  for (const t of longestFirst) {
    if (out.length >= limit) break;
    const key = `${t.parkOsmId}:${t.name}`;
    if (seen.has(key)) continue;
    const at = midpoint(t.points);
    if (gap && out.some((o) => Math.abs(o.at.lat - at.lat) < gap.lat && Math.abs(o.at.lng - at.lng) < gap.lng)) continue;
    seen.add(key);
    out.push({ key: t.id, name: t.name!, at, closed: t.closed, level: t.level });
  }
  return out;
}

/** The point halfway along a line (by distance along it, not by index). */
export function midpoint(points: LatLng[]): LatLng {
  if (points.length === 1) return points[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].lat - points[i - 1].lat, (points[i].lng - points[i - 1].lng) * Math.cos((points[i].lat * Math.PI) / 180));
    segs.push(d);
    total += d;
  }
  let run = 0;
  for (let i = 0; i < segs.length; i++) {
    if (run + segs[i] >= total / 2) {
      const f = segs[i] ? (total / 2 - run) / segs[i] : 0;
      return { lat: points[i].lat + (points[i + 1].lat - points[i].lat) * f, lng: points[i].lng + (points[i + 1].lng - points[i].lng) * f };
    }
    run += segs[i];
  }
  return points[points.length - 1];
}

/** Parks whose box crosses the view, for the park name tags drawn from far out. */
export function parksInView(parks: ParkSummary[], view: { minLat: number; minLng: number; maxLat: number; maxLng: number }): ParkSummary[] {
  return parks.filter((p) => p.box.maxLat >= view.minLat && p.box.minLat <= view.maxLat && p.box.maxLng >= view.minLng && p.box.minLng <= view.maxLng);
}

const inBox = (pt: LatLng, b: ParkSummary['box']) => pt.lat >= b.minLat && pt.lat <= b.maxLat && pt.lng >= b.minLng && pt.lng <= b.maxLng;

/**
 * The OpenStreetMap track lines and name tags that fall inside a mapped park's box, dropped: the
 * park's own trails (the same lines, colored by level and named without the "(lvl 3)" tag) are
 * drawn there instead, so the two never sit on top of each other. Lines outside every park stay.
 */
export function outsideParks<T extends { parts?: LatLng[][]; at?: LatLng }>(items: T[], parks: ParkSummary[]): T[] {
  const boxes = parks.filter((p) => p.trailCount > 0).map((p) => p.box);
  if (!boxes.length || !items.length) return items;
  const covered = (pt: LatLng | undefined) => !!pt && boxes.some((b) => inBox(pt, b));
  return items.filter((it) => !covered(it.at ?? it.parts?.[0]?.[0]));
}

/** "57 trails · 28.8 mi" under a park's name. */
export function parkSummaryLine(p: ParkSummary, metric = false): string {
  return tc('{n} trails · {len}', { n: p.trailCount, len: parkTrailLength(p.trailM, metric) });
}

/** Lines ready for a map: each with its color, so every map draws a park the same way. */
export type ParkPiece = { key: string; points: LatLng[]; color: string; closed: boolean; road: boolean };
export const parkPieces = (trails: ParkTrail[]): ParkPiece[] =>
  trails.map((t) => ({ key: `park-${t.id}`, points: t.points, color: parkTrailColor(t), closed: t.closed, road: t.kind === 'road' }));
