import type { BaseMap } from '@/core/trails';

/** The web build has no native map, so there are no tiles to draw. */
export function TrailTiles(_props: { base: BaseMap; trails: boolean }) {
  return null;
}
