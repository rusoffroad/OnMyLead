import type { BaseMap } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';

/** The web build has no native map; Leaflet draws the same layers (lib/web-map.ts trailLayers). */
export function TrailTiles(_props: { trail: TrailMap; base?: BaseMap }) {
  return null;
}
