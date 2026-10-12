import { Directory, File, Paths } from 'expo-file-system';

import type { LatLng } from '@/core/geo';
import { USGS_IMAGERY, type OfflineLayer } from '@/core/offline-maps';
import {
  identifyUrl, nearestTrail, TRAIL_SOURCE_IDS, TRAIL_SOURCES, trailTileTemplate, USGS_TOPO, type GeoJsonLine,
  type TrailInfo, type TrailSourceId,
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

/** The URL each layer's squares come from ({z}/{x}/{y}, or a box for the trail layers). */
export function templateFor(layer: TileLayerId): string {
  if (layer === 'imagery') return USGS_IMAGERY;
  return layer === 'topo' ? USGS_TOPO : trailTileTemplate(TRAIL_SOURCES[layer]);
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
