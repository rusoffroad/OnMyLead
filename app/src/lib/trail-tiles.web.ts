import type { LatLng } from '@/core/geo';
import type { OsmTrail, ViewRegion } from '@/core/osm-trails';
import type { TrailInfo, TrailSourceId } from '@/core/trails';

/** The web build has no native map to draw tiles on, so saving them is a no-op there. */
export type TileLayerId = 'imagery' | 'topo' | 'osm' | TrailSourceId;

export const TILE_MAX_AGE_S = 30 * 24 * 3600;
export const tileCachePath = (_layer: TileLayerId) => '';
export const savedTilesMb = () => 0;
export function clearSavedTiles() {}
export async function identifyTrail(_p: LatLng, _sources: TrailSourceId[], _radiusM: number): Promise<TrailInfo | null> {
  return null;
}
export async function loadOsmView(_r: ViewRegion, _zoom: number, _offline: boolean): Promise<OsmTrail[]> {
  return [];
}
