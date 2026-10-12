import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import type { LatLng } from '@/core/geo';
import { USGS_IMAGERY, type OfflineLayer } from '@/core/offline-maps';
import {
  decodeOsmTrails, OSM_TILEJSON, osmTilesForRegion, osmTileZoom, templateFromTileJson, type OsmTrail, type ViewRegion,
} from '@/core/osm-trails';
import {
  fillTemplate, identifyUrl, nearestTrail, TRAIL_SOURCE_IDS, TRAIL_SOURCES, trailTileTemplate, USGS_TOPO, type GeoJsonLine,
  type Tile, type TrailInfo, type TrailSourceId,
} from '@/core/trails';

/**
 * Trail tiles live in the documents folder (iOS never clears it), one folder per layer, laid out
 * as {z}/{x}/{y}: the layout react-native-maps reads through tileCachePath. Tiles a rider has
 * looked at are kept automatically; downloads (lib/offline-maps) fill in whole areas ahead of time.
 */
const ROOT = new Directory(Paths.document, 'map-tiles');

export type TileLayerId = OfflineLayer;

export function tileCachePath(layer: TileLayerId): string {
  return new Directory(ROOT, layer).uri.replace(/\/+$/, '');
}

/** Saved tiles refresh in the background after 30 days; a stale tile still shows while it does. */
export const TILE_MAX_AGE_S = 30 * 24 * 3600;

/**
 * The URL each layer's squares come from ({z}/{x}/{y}, or a box for the agency trail layers).
 * OpenStreetMap's address carries a weekly version, so it is looked up first (see osmTemplate).
 */
export async function templateFor(layer: TileLayerId): Promise<string> {
  if (layer === 'imagery') return USGS_IMAGERY;
  if (layer === 'osm') {
    const t = await osmTemplate();
    if (!t) throw new Error('OpenStreetMap squares unavailable');
    return t;
  }
  return layer === 'topo' ? USGS_TOPO : trailTileTemplate(TRAIL_SOURCES[layer]);
}

// ---------------------------------------------------------------------------------------------
// OpenStreetMap tracks (core/osm-trails): fetched as vector squares, kept on the phone in the same
// folders as every other layer, and drawn by the app as map lines.

const OSM_TEMPLATE_KEY = 'osm-template.v1';
let osmTemplateNow: Promise<string | null> | null = null;

/** The current square address, asked once per app launch; the last one known works offline. */
export function osmTemplate(): Promise<string | null> {
  if (!osmTemplateNow) {
    osmTemplateNow = (async () => {
      const saved = await AsyncStorage.getItem(OSM_TEMPLATE_KEY).catch(() => null);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(OSM_TILEJSON, { signal: controller.signal });
        clearTimeout(timer);
        const fresh = templateFromTileJson(await res.json());
        if (fresh) {
          if (fresh !== saved) AsyncStorage.setItem(OSM_TEMPLATE_KEY, fresh).catch(() => {});
          return fresh;
        }
      } catch {
        // No signal: fall back to the last address.
      }
      // Try again next time a map needs it, rather than staying stuck on a failed lookup.
      osmTemplateNow = null;
      return saved;
    })();
  }
  return osmTemplateNow;
}

/** Decoded squares in memory, newest last, so panning back and forth doesn't re-read files. */
const osmMemory = new Map<string, OsmTrail[]>();
const OSM_MEMORY_MAX = 48;

function remember(key: string, trails: OsmTrail[]) {
  osmMemory.delete(key);
  osmMemory.set(key, trails);
  while (osmMemory.size > OSM_MEMORY_MAX) osmMemory.delete(osmMemory.keys().next().value!);
}

function isFresh(file: File): boolean {
  const t = file.modificationTime;
  if (t == null) return true;
  const ms = t < 1e12 ? t * 1000 : t;
  return Date.now() - ms < TILE_MAX_AGE_S * 1000;
}

async function loadOsmTile(t: Tile, offline: boolean): Promise<OsmTrail[]> {
  const key = `${t.z}/${t.x}/${t.y}`;
  const hit = osmMemory.get(key);
  if (hit) return hit;
  const file = tileFile('osm', t.z, t.x, t.y);
  const saved = file.exists;
  let data: Uint8Array | null = null;
  if (saved && (offline || isFresh(file))) data = await file.bytes().catch(() => null);
  if (!data && !offline) {
    try {
      const template = await osmTemplate();
      if (template) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const res = await fetch(fillTemplate(template, t), { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          data = new Uint8Array(await res.arrayBuffer());
          const dir = file.parentDirectory;
          if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
          file.write(data);
        }
      }
    } catch {
      // Fall through to a stale saved square, if there is one.
    }
  }
  if (!data && saved) data = await file.bytes().catch(() => null);
  if (!data) return [];
  const trails = decodeOsmTrails(data, t);
  remember(key, trails);
  return trails;
}

/** OpenStreetMap tracks for a map view; empty when the map is too far out. */
export async function loadOsmView(region: ViewRegion, mapZoom: number, offline: boolean): Promise<OsmTrail[]> {
  const z = osmTileZoom(mapZoom);
  if (z == null) return [];
  const tiles = osmTilesForRegion(region, z);
  const parts = await Promise.all(tiles.map((t) => loadOsmTile(t, offline).catch(() => [] as OsmTrail[])));
  return parts.flat();
}

/** Where one square is kept on the phone. */
export function tileFile(layer: TileLayerId, z: number, x: number, y: number): File {
  return new File(new Directory(ROOT, layer, String(z), String(x)), String(y));
}

/** Roughly how much room saved map tiles take, in megabytes. */
export function savedTilesMb(): number {
  try {
    return ROOT.exists ? Math.round(((ROOT.size ?? 0) / 1_048_576) * 10) / 10 : 0;
  } catch {
    return 0;
  }
}

export function clearSavedTiles() {
  try {
    if (ROOT.exists) ROOT.delete();
  } catch {
    // Nothing to clear.
  }
}

/** Ask the agencies what line is under a tap. Returns null when nothing is close or the phone is offline. */
export async function identifyTrail(p: LatLng, sources: TrailSourceId[], radiusM: number): Promise<TrailInfo | null> {
  const queries = sources.flatMap((id) => TRAIL_SOURCES[id].identifyLayers.map((layerId) => ({ id, layerId })));
  const results = await Promise.all(
    queries.map(async ({ id, layerId }) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(identifyUrl(TRAIL_SOURCES[id], layerId, p, radiusM), { signal: controller.signal });
        clearTimeout(timer);
        const json = (await res.json()) as { features?: GeoJsonLine[] };
        return { source: id, layerId, features: json.features ?? [] };
      } catch {
        return { source: id, layerId, features: [] };
      }
    }),
  );
  return nearestTrail(p, results, radiusM);
}

export { TRAIL_SOURCE_IDS };
