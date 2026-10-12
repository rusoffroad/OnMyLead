import { Directory, File, Paths } from 'expo-file-system';

import type { LatLng } from '@/core/geo';
import {
  fillTemplate, identifyUrl, nearestTrail, offlineTilePlan, TRAIL_SOURCE_IDS, TRAIL_SOURCES, trailTileTemplate,
  USGS_TOPO, type GeoJsonLine, type TrailInfo, type TrailSourceId,
} from '@/core/trails';

/**
 * Trail tiles live in the documents folder (iOS never clears it), one folder per layer, laid out
 * as {z}/{x}/{y}: the layout react-native-maps reads through tileCachePath. Tiles a rider has
 * looked at are kept automatically; saveRideTiles fills in a ride's whole area ahead of time.
 */
const ROOT = new Directory(Paths.document, 'map-tiles');

export type TileLayerId = TrailSourceId | 'topo';

export function tileCachePath(layer: TileLayerId): string {
  return new Directory(ROOT, layer).uri.replace(/\/+$/, '');
}

/** Saved tiles refresh in the background after 30 days; a stale tile still shows while it does. */
export const TILE_MAX_AGE_S = 30 * 24 * 3600;

function templateFor(layer: TileLayerId): string {
  return layer === 'topo' ? USGS_TOPO : trailTileTemplate(TRAIL_SOURCES[layer]);
}

export type SaveProgress = { done: number; total: number; failed: number };

/**
 * Download every tile a ride needs for the given layers. Tiles already on the phone are skipped,
 * so running it again only fetches what is missing. Four downloads at a time keeps the agency
 * servers happy and still finishes a typical ride in a minute or two on LTE.
 */
export async function saveRideTiles(
  route: LatLng[],
  layers: TileLayerId[],
  onProgress?: (p: SaveProgress) => void,
  signal?: { cancelled: boolean },
): Promise<SaveProgress> {
  const plan = offlineTilePlan(route);
  const jobs = layers.flatMap((layer) => plan.map((t) => ({ layer, t })));
  const progress: SaveProgress = { done: 0, total: jobs.length, failed: 0 };
  onProgress?.({ ...progress });

  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !signal?.cancelled) {
      const { layer, t } = jobs[next++];
      try {
        const dir = new Directory(ROOT, layer, String(t.z), String(t.x));
        const file = new File(dir, String(t.y));
        if (!file.exists) {
          if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
          const res = await fetch(fillTemplate(templateFor(layer), t));
          const type = res.headers.get('content-type') ?? '';
          // ArcGIS answers errors with JSON and a 200, so only keep real images.
          if (!res.ok || !type.startsWith('image/')) throw new Error(`tile ${res.status} ${type}`);
          file.write(new Uint8Array(await res.arrayBuffer()));
        }
      } catch {
        progress.failed++;
      }
      progress.done++;
      onProgress?.({ ...progress });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return progress;
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
