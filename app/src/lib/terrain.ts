import { MAPBOX_PUBLIC_TOKEN } from '@/constants/site';
import { useFlag } from './app-settings';

/**
 * The Mapbox public token (pk.) the 3D Terrain map uses. It is a public, client-side key by
 * Mapbox's design (every app and web page that shows a Mapbox map carries it), so it can live in
 * the code: constants/site.ts, or EXPO_PUBLIC_MAPBOX_TOKEN for a build that overrides it.
 */
export const MAPBOX_TOKEN: string = (process.env.EXPO_PUBLIC_MAPBOX_TOKEN || MAPBOX_PUBLIC_TOKEN || '').trim();

/** True when this build has a Mapbox token, so the 3D map can draw at all. */
export const terrainBuilt = MAPBOX_TOKEN.startsWith('pk.');

/** Whether 3D Terrain is offered: the build has a token and the owner hasn't switched it off. */
export function useTerrainAvailable(): boolean {
  const on = useFlag('terrain_3d');
  return terrainBuilt && on;
}
