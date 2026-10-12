import { UrlTile, WMSTile } from 'react-native-maps';

import { TOPO_MAX_NATIVE_Z, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate, USGS_TOPO, type BaseMap } from '@/core/trails';
import { TILE_MAX_AGE_S, tileCachePath } from '@/lib/trail-tiles';

const TEMPLATES = Object.fromEntries(TRAIL_SOURCE_IDS.map((id) => [id, trailTileTemplate(TRAIL_SOURCES[id])]));

/**
 * The topo base map and the public trails overlay, drawn as tiles inside a MapView. Put it first
 * among the map's children so routes and rider pins draw on top. Every tile seen is kept on the
 * phone, so a trail you looked at with signal is still there without it.
 */
export function TrailTiles({ base, trails }: { base: BaseMap; trails: boolean }) {
  return (
    <>
      {base === 'topo' ? (
        <UrlTile
          urlTemplate={USGS_TOPO}
          shouldReplaceMapContent
          maximumNativeZ={TOPO_MAX_NATIVE_Z}
          tileCachePath={tileCachePath('topo')}
          tileCacheMaxAge={TILE_MAX_AGE_S}
          zIndex={-2}
        />
      ) : null}
      {trails
        ? TRAIL_SOURCE_IDS.map((id) => (
            <WMSTile
              key={id}
              urlTemplate={TEMPLATES[id]}
              minimumZ={TRAILS_MIN_Z}
              tileCachePath={tileCachePath(id)}
              tileCacheMaxAge={TILE_MAX_AGE_S}
              zIndex={-1}
            />
          ))
        : null}
    </>
  );
}
