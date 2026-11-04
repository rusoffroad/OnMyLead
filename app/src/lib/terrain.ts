import { MAPBOX_PUBLIC_TOKEN } from '@/constants/site';
import { useFlag } from './app-settings';

/**
 * The Mapbox public token (pk.) every Mapbox map uses, from the build's EXPO_PUBLIC_MAPBOX_TOKEN
 * (app/.env for phone builds, the MAPBOX_PUBLIC_TOKEN Actions variable for the website).
 */
export const MAPBOX_TOKEN: string = (process.env.EXPO_PUBLIC_MAPBOX_TOKEN || MAPBOX_PUBLIC_TOKEN || '').trim();

/** True when this build has a Mapbox token, so Mapbox can draw a map at all. */
export const terrainBuilt = MAPBOX_TOKEN.startsWith('pk.');
export const mapboxBuilt = terrainBuilt;

/** Whether Mapbox draws the maps: the build has a token and the owner hasn't switched it off. */
export function useMapboxAvailable(): boolean {
  const on = useFlag('mapbox_maps');
  return mapboxBuilt && on;
}

/** Whether 3D Terrain is offered: Mapbox is, and the owner hasn't switched 3D off on its own. */
export function useTerrainAvailable(): boolean {
  const mapbox = useMapboxAvailable();
  const on = useFlag('terrain_3d');
  return mapbox && on;
}
