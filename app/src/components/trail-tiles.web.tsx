import type { OsmTrail } from '@/core/osm-trails';
import type { BaseMap } from '@/core/trails';

/** The web build has no native map, so there are no tiles to draw. */
export function TrailTiles(_props: { base: BaseMap; trails: boolean; offline?: boolean; osm?: OsmTrail[] }) {
  return null;
}
