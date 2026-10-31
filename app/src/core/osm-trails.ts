import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

import type { LatLng } from './geo';
import { distanceToLineM, tileFor, type Tile, type TrailInfo } from './trails';

/**
 * Dirt tracks from OpenStreetMap, the source that covers what the Forest Service and BLM don't:
 * private off-road parks, state land and county roads (Hidden Falls Adventure Park's named trails,
 * with their difficulty levels, are mapped there). onX builds its own network from thousands of
 * agency files plus paid trail guides and doesn't license it; OpenStreetMap is the open version of
 * that same crowd-and-agency work.
 *
 * The squares come from OpenFreeMap, a free public tile host that allows commercial apps with no
 * key and no request limit, as long as OpenMapTiles and OpenStreetMap are credited. They are
 * vector squares (the lines themselves, not a picture), so the app draws them as map lines and
 * can name the one a rider taps without asking a server.
 */

export const OSM_TILEJSON = 'https://tiles.openfreemap.org/planet';
// ODbL asks for "© OpenStreetMap contributors"; OpenFreeMap asks for OpenMapTiles too (its own name is optional).
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap';
/** OpenMapTiles puts dirt tracks in squares from zoom 13; zoom 14 is the closest square made. */
export const OSM_MIN_Z = 13;
export const OSM_MAX_Z = 14;
/**
 * The farthest out (real map zoom) tracks are drawn: about 15 miles across a phone. Wider than the
 * squares that carry them, so a view this far out reads many zoom 13 squares, which are small
 * (about 10 KB) and kept on the phone once seen.
 */
export const OSM_VIEW_MIN_Z = 11;
/** The most squares read for one view (middle first), so a tablet zoomed far out stays quick. */
export const OSM_MAX_TILES = 96;
/** The most line pieces drawn: the longest win, so a wide view still shows the main trails everywhere. */
export const OSM_MAX_LINES = 500;

export type OsmTrail = {
  /** Square plus feature index: stable while the square is on screen. */
  key: string;
  name: string | null;
  /** Unpaved or paved, when the mapper said. */
  surface: string | null;
  /**
   * Mapped with no public access (OpenMapTiles folds OSM's access=no and access=private into
   * "no"): gated, closed or private. Only the drawn copies carry it; the named copies don't.
   */
  closed: boolean;
  parts: LatLng[][];
};

/**
 * Which square zoom to read for a (real) map zoom, or null when the map is too far out for tracks.
 * Zoom 13 squares serve every view out to OSM_VIEW_MIN_Z; zoom 14 adds the finest detail up close.
 */
export function osmTileZoom(mapZoom: number): number | null {
  if (!(mapZoom >= OSM_VIEW_MIN_Z)) return null;
  return mapZoom >= OSM_MAX_Z ? OSM_MAX_Z : OSM_MIN_Z;
}

export type ViewRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** The squares covering a map view, nearest the middle first, capped. */
export function osmTilesForRegion(r: ViewRegion, z: number, cap = OSM_MAX_TILES): Tile[] {
  const a = tileFor({ lat: r.latitude + r.latitudeDelta / 2, lng: r.longitude - r.longitudeDelta / 2 }, z);
  const b = tileFor({ lat: r.latitude - r.latitudeDelta / 2, lng: r.longitude + r.longitudeDelta / 2 }, z);
  const c = tileFor({ lat: r.latitude, lng: r.longitude }, z);
  const out: Tile[] = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ z, x, y });
  out.sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y));
  return out.slice(0, cap);
}

/** The versioned square URL from OpenFreeMap's TileJSON (the host moves to a new version weekly). */
export function templateFromTileJson(json: unknown): string | null {
  const tiles = (json as { tiles?: unknown })?.tiles;
  const url = Array.isArray(tiles) ? tiles[0] : null;
  return typeof url === 'string' && url.includes('{z}') && url.startsWith('https://') ? url : null;
}

/** A point inside a square (0..extent) to lat/lng. */
function toLatLng(t: Tile, extent: number, px: number, py: number): LatLng {
  const n = 2 ** t.z;
  const lng = ((t.x + px / extent) / n) * 360 - 180;
  const yy = (t.y + py / extent) / n;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * yy))) * 180) / Math.PI;
  return { lat, lng };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Dirt tracks in one square. Lines come from the `transportation` layer (every track, named or
 * not); names come from `transportation_name`, which carries the same tracks merged and named.
 */
export function decodeOsmTrails(data: Uint8Array, t: Tile): OsmTrail[] {
  let tile: VectorTile;
  try {
    tile = new VectorTile(new Pbf(data));
  } catch {
    return [];
  }
  const out: OsmTrail[] = [];
  for (const layerName of ['transportation', 'transportation_name'] as const) {
    const layer = tile.layers[layerName];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 2 || f.properties.class !== 'track') continue;
      const name = str(f.properties.name);
      // The name layer only adds names; its unnamed lines are already in `transportation`.
      if (layerName === 'transportation_name' && !name) continue;
      const parts = f
        .loadGeometry()
        .map((ring) => ring.map((p) => toLatLng(t, layer.extent, p.x, p.y)))
        .filter((part) => part.length > 1);
      if (!parts.length) continue;
      out.push({
        key: `${t.z}/${t.x}/${t.y}/${layerName === 'transportation' ? 'l' : 'n'}${i}`,
        name,
        surface: str(f.properties.surface),
        closed: f.properties.access === 'no',
        parts,
      });
    }
  }
  return out;
}

/**
 * Lines worth drawing, one item per line piece (key "<track key>#<piece>", so a piece keeps its
 * key while it stays in view). The named copies are only for tap lookups, so they aren't drawn
 * twice. Past `limit` pieces the longest are kept, so a wide view shows the main trails everywhere
 * rather than every short spur in the middle. The result is sorted by key: map lines that stay put
 * are never re-created as the view moves, which is what made the lines flash when zooming.
 */
export function drawableOsm(trails: OsmTrail[], limit = OSM_MAX_LINES): OsmTrail[] {
  const pieces: { t: OsmTrail; i: number; len: number }[] = [];
  for (const t of trails) {
    if (!t.key.includes('/l')) continue;
    t.parts.forEach((part, i) => pieces.push({ t, i, len: pieceLength(part) }));
  }
  const kept = pieces.length > limit ? pieces.map((p, n) => ({ ...p, n })).sort((a, b) => b.len - a.len || a.n - b.n).slice(0, Math.max(0, limit)) : pieces;
  const out = kept.map(({ t, i }) => drawnPiece(t, i));
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Pieces handed out by drawableOsm, reused so an unchanged piece is the same object on every call. */
const pieceCache = new WeakMap<OsmTrail, OsmTrail[]>();

function drawnPiece(t: OsmTrail, i: number): OsmTrail {
  let list = pieceCache.get(t);
  if (!list) pieceCache.set(t, (list = []));
  return (list[i] ??= { ...t, key: `${t.key}#${i}`, parts: [t.parts[i]] });
}

/** Length in degrees (longitude scaled for latitude), only for ranking pieces against each other. */
function pieceLength(part: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < part.length; i++) m += Math.hypot(part[i].lat - part[i - 1].lat, (part[i].lng - part[i - 1].lng) * Math.cos((part[i].lat * Math.PI) / 180));
  return m;
}

/** The track under a tap, from what is already on screen. Named copies win a near tie. */
export function nearestOsmTrail(p: LatLng, trails: OsmTrail[], maxM: number): TrailInfo | null {
  let best: { d: number; t: OsmTrail } | null = null;
  // The drawn copy under the tap says whether it's closed; the named copy only carries the name.
  let line: { d: number; t: OsmTrail } | null = null;
  for (const t of trails) {
    for (const part of t.parts) {
      const raw = distanceToLineM(p, { type: 'LineString', coordinates: part.map((q) => [q.lng, q.lat]) });
      const d = raw - (t.name ? 3 : 0);
      if (d <= maxM && (!best || d < best.d)) best = { d, t };
      if (t.key.includes('/l') && raw <= maxM && (!line || raw < line.d)) line = { d: raw, t };
    }
  }
  if (!best) return null;
  const closed = best.t.closed || !!line?.t.closed;
  return {
    source: 'osm',
    kind: 'trail',
    title: best.t.name ?? 'Unnamed Track',
    where: null,
    allowed: [],
    seasonal: false,
    miles: null,
    surface: best.t.surface ? best.t.surface.charAt(0).toUpperCase() + best.t.surface.slice(1) : null,
    attribution: OSM_ATTRIBUTION,
    closure: closed ? { label: 'No Public Access', detail: 'OpenStreetMap marks this track closed or private.' } : null,
  };
}

export type TrailLabel = { key: string; name: string; at: LatLng; closed: boolean };

/**
 * One name tag per named track in view, at the middle of its longest stretch. Squares come middle
 * first, so a trail crossing several squares is tagged in the one nearest the middle of the map.
 * `gap` (degrees) is about one tag's size on screen, so tags don't pile on each other.
 */
export function trailLabels(trails: OsmTrail[], limit: number, gap?: { lat: number; lng: number }): TrailLabel[] {
  const closedLines = trails.filter((t) => t.closed);
  const seen = new Set<string>();
  const out: TrailLabel[] = [];
  for (const t of trails) {
    if (out.length >= limit) break;
    if (!t.name || seen.has(t.name)) continue;
    let longest: LatLng[] = [];
    let longestM = 0;
    for (const part of t.parts) {
      let m = 0;
      for (let i = 1; i < part.length; i++) m += Math.hypot(part[i].lat - part[i - 1].lat, (part[i].lng - part[i - 1].lng) * Math.cos((part[i].lat * Math.PI) / 180));
      if (m > longestM) [longest, longestM] = [part, m];
    }
    if (longest.length < 2) continue;
    const at = midpoint(longest);
    // Tags that would sit on top of one already placed are skipped (the nearer-the-middle one stays).
    if (gap && out.some((o) => Math.abs(o.at.lat - at.lat) < gap.lat && Math.abs(o.at.lng - at.lng) < gap.lng)) continue;
    seen.add(t.name);
    // Names live on separate copies of the lines; a closed drawn line under the tag marks it closed.
    const closed = closedLines.some((c) => c.parts.some((part) => distanceToLineM(at, { type: 'LineString', coordinates: part.map((q) => [q.lng, q.lat]) }) < 12));
    out.push({ key: `${t.key}-label`, name: t.name, at, closed });
  }
  // A steady order, so tags that stay in view aren't redrawn when the view moves.
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The point halfway along a line. */
function midpoint(line: LatLng[]): LatLng {
  const seg = (i: number) => Math.hypot(line[i].lat - line[i - 1].lat, (line[i].lng - line[i - 1].lng) * Math.cos((line[i].lat * Math.PI) / 180));
  let total = 0;
  for (let i = 1; i < line.length; i++) total += seg(i);
  let left = total / 2;
  for (let i = 1; i < line.length; i++) {
    const s = seg(i);
    if (s >= left && s > 0) {
      const f = left / s;
      return { lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * f, lng: line[i - 1].lng + (line[i].lng - line[i - 1].lng) * f };
    }
    left -= s;
  }
  return line[Math.floor(line.length / 2)];
}
