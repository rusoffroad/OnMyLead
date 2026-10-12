import type { LatLng } from '@/core/geo';
import type { TrailInfo, TrailSourceId } from '@/core/trails';

/** The web build has no native map to draw tiles on, so saving them is a no-op there. */
export type TileLayerId = TrailSourceId | 'topo';
export type SaveProgress = { done: number; total: number; failed: number };

export const TILE_MAX_AGE_S = 30 * 24 * 3600;
export const tileCachePath = (_layer: TileLayerId) => '';
export async function saveRideTiles(_route: LatLng[], _layers: TileLayerId[]): Promise<SaveProgress> {
  return { done: 0, total: 0, failed: 0 };
}
export const savedTilesMb = () => 0;
export function clearSavedTiles() {}
export async function identifyTrail(_p: LatLng, _sources: TrailSourceId[], _radiusM: number): Promise<TrailInfo | null> {
  return null;
}
