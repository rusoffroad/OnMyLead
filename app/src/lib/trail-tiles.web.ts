import type { LatLng } from '@/core/geo';
import {
  decodeOsmTrails, OSM_TILEJSON, osmTilesForRegion, osmTileZoom, templateFromTileJson, type OsmTrail, type ViewRegion,
} from '@/core/osm-trails';
import { decodeRoadLines, type RoadLine } from '@/core/trail-router';
import { fillTemplate, type Tile, type TrailInfo, type TrailSourceId } from '@/core/trails';

/**
 * The website's side of the trail layer. The agency and topo layers are phone-only, but the
 * OpenStreetMap squares are fetched here too (the browser keeps them in its own cache), so the
 * website's route builder can draw trails and snap a route to them. tiles.openfreemap.org is
 * allowed in deploy/security-headers.conf.
 */
export type TileLayerId = 'imagery' | 'topo' | 'osm' | TrailSourceId;

export const TILE_MAX_AGE_S = 30 * 24 * 3600;
export const tileCachePath = (_layer: TileLayerId) => '';
export const savedTilesMb = () => 0;
export function clearSavedTiles() {}
export async function identifyTrail(_p: LatLng, _sources: TrailSourceId[], _radiusM: number): Promise<TrailInfo | null> {
  return null;
}

let template: Promise<string | null> | null = null;
function osmTemplate(): Promise<string | null> {
  if (!template) {
    template = fetch(OSM_TILEJSON)
      .then((r) => r.json())
      .then(templateFromTileJson)
      .catch(() => null)
      .then((t) => {
        if (!t) template = null;
        return t;
      });
  }
  return template;
}

const bytes = new Map<string, Promise<Uint8Array | null>>();
function tileBytes(t: Tile): Promise<Uint8Array | null> {
  const key = `${t.z}/${t.x}/${t.y}`;
  let hit = bytes.get(key);
  if (!hit) {
    hit = osmTemplate()
      .then((tpl) => (tpl ? fetch(fillTemplate(tpl, t)) : null))
      .then((r) => (r?.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? new Uint8Array(b) : null))
      .catch(() => null);
    hit.then((b) => {
      if (!b) bytes.delete(key);
    });
    bytes.set(key, hit);
    while (bytes.size > 96) bytes.delete(bytes.keys().next().value!);
  }
  return hit;
}

const trails = new Map<string, OsmTrail[]>();
const roads = new Map<string, RoadLine[]>();
function decoded<T>(cache: Map<string, T[]>, t: Tile, decode: (d: Uint8Array, t: Tile) => T[]): Promise<T[]> {
  const key = `${t.z}/${t.x}/${t.y}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  return tileBytes(t).then((d) => {
    if (!d) return [];
    const out = decode(d, t);
    cache.set(key, out);
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
    return out;
  });
}

/** OpenStreetMap tracks for a map view; empty when the map is too far out. */
export async function loadOsmView(r: ViewRegion, zoom: number, _offline: boolean): Promise<OsmTrail[]> {
  const z = osmTileZoom(zoom);
  if (z == null) return [];
  const parts = await Promise.all(osmTilesForRegion(r, z).map((t) => decoded(trails, t, decodeOsmTrails)));
  return parts.flat();
}

/** Every road and trail in these squares, for snapping a drawn route to them. */
export async function loadRoadLines(tiles: Tile[], _offline: boolean): Promise<RoadLine[]> {
  const parts = await Promise.all(tiles.map((t) => decoded(roads, t, decodeRoadLines)));
  return parts.flat();
}
