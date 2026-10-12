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
/** The most squares fetched for one view, and the most lines drawn, so a dense area stays smooth. */
export const OSM_MAX_TILES = 16;
export const OSM_MAX_LINES = 500;

export type OsmTrail = {
  /** Square plus feature index: stable while the square is on screen. */
  key: string;
  name: string | null;
  /** Unpaved or paved, when the mapper said. */
  surface: string | null;
  parts: LatLng[][];
};

/** Which square zoom to read for a map zoom, or null when the map is too far out for tracks. */
export function osmTileZoom(mapZoom: number): number | null {
  if (mapZoom < OSM_MIN_Z - 0.25) return null;
  return Math.max(OSM_MIN_Z, Math.min(OSM_MAX_Z, Math.round(mapZoom)));
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
      out.push({ key: `${t.z}/${t.x}/${t.y}/${layerName === 'transportation' ? 'l' : 'n'}${i}`, name, surface: str(f.properties.surface), parts });
    }
  }
  return out;
}

/**
 * Lines worth drawing, at most `limit` line pieces in all (squares come middle first, so the cut
 * falls at the edges). The named copies are only for tap lookups, so they aren't drawn twice.
 */
export function drawableOsm(trails: OsmTrail[], limit = OSM_MAX_LINES): OsmTrail[] {
  const out: OsmTrail[] = [];
  let left = limit;
  for (const t of trails) {
    if (left <= 0) break;
    if (!t.key.includes('/l')) continue;
    const parts = t.parts.slice(0, left);
    left -= parts.length;
    out.push(parts.length === t.parts.length ? t : { ...t, parts });
  }
  return out;
}

/** The track under a tap, from what is already on screen. Named copies win a near tie. */
export function nearestOsmTrail(p: LatLng, trails: OsmTrail[], maxM: number): TrailInfo | null {
  let best: { d: number; t: OsmTrail } | null = null;
  for (const t of trails) {
    for (const part of t.parts) {
      const d = distanceToLineM(p, { type: 'LineString', coordinates: part.map((q) => [q.lng, q.lat]) }) - (t.name ? 3 : 0);
      if (d <= maxM && (!best || d < best.d)) best = { d, t };
    }
  }
  if (!best) return null;
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
  };
}
