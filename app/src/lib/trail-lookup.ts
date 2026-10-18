import type { LatLng } from '@/core/geo';
import { osmTilesForRegion, type ViewRegion } from '@/core/osm-trails';
import {
  closedSeasonalLines, identifyUrl, nearestTrail, SEASONAL_MAX_TILES, SEASONAL_MIN_Z, SEASONAL_TILE_Z, seasonalQueryUrl,
  TRAIL_SOURCES, type ClosedLine, type GeoJsonLine, type TrailInfo, type TrailSourceId,
} from '@/core/trails';

/**
 * The trail layer's questions to the agencies' map servers, shared by the apps and the website
 * (deploy/security-headers.conf allows apps.fs.usda.gov and gis.blm.gov). Only the map square or
 * the tapped spot is sent, never anything about the rider.
 */

async function getJson<T>(url: string, ms = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the agencies what line is under a tap. Returns null when nothing is close or there's no signal. */
export async function identifyTrail(p: LatLng, sources: TrailSourceId[], radiusM: number): Promise<TrailInfo | null> {
  const queries = sources.flatMap((id) => TRAIL_SOURCES[id].identifyLayers.map((layerId) => ({ id, layerId })));
  const results = await Promise.all(
    queries.map(async ({ id, layerId }) => {
      const json = await getJson<{ features?: GeoJsonLine[] }>(identifyUrl(TRAIL_SOURCES[id], layerId, p, radiusM));
      return { source: id, layerId, features: json?.features ?? [] };
    }),
  );
  return nearestTrail(p, results, radiusM);
}

/** Answers per square and day, newest last, so panning back doesn't ask again. */
const seasonal = new Map<string, Promise<ClosedLine[]>>();
const SEASONAL_MEMORY_MAX = 48;

const today = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * Forest Service routes in view that are closed for the season today (core/trails). Empty when the
 * map is zoomed out past SEASONAL_MIN_Z. Offline it returns only what was already asked today.
 */
export async function loadSeasonalClosures(r: ViewRegion, zoom: number, offline: boolean, on = new Date()): Promise<ClosedLine[]> {
  if (zoom < SEASONAL_MIN_Z) return [];
  const day = today(on);
  const tiles = osmTilesForRegion(r, SEASONAL_TILE_Z, SEASONAL_MAX_TILES);
  const parts = await Promise.all(
    tiles.map((t) => {
      const key = `${day}/${t.x}/${t.y}`;
      let hit = seasonal.get(key);
      if (!hit) {
        if (offline) return Promise.resolve([] as ClosedLine[]);
        hit = Promise.all(
          [1, 2].map(async (layerId) => {
            const json = await getJson<{ features?: GeoJsonLine[] }>(seasonalQueryUrl(layerId, t), 12_000);
            if (!json) throw new Error('no answer');
            return closedSeasonalLines(json.features ?? [], layerId, on);
          }),
        ).then((both) => both.flat());
        // A failed answer is asked again next time, not remembered as "nothing closed".
        hit.catch(() => seasonal.delete(key));
        seasonal.set(key, hit);
        while (seasonal.size > SEASONAL_MEMORY_MAX) seasonal.delete(seasonal.keys().next().value!);
      }
      return hit.catch(() => [] as ClosedLine[]);
    }),
  );
  // A route crossing two squares comes back from both.
  const seen = new Set<string>();
  return parts.flat().filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true)));
}
