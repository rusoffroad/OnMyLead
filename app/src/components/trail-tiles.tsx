import { UrlTile, WMSTile } from 'react-native-maps';

import { IMAGERY_MAX_NATIVE_Z, USGS_IMAGERY } from '@/core/offline-maps';
import { TOPO_MAX_NATIVE_Z, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate, USGS_TOPO, type BaseMap } from '@/core/trails';
import { TILE_MAX_AGE_S, tileCachePath } from '@/lib/trail-tiles';

const TEMPLATES = Object.fromEntries(TRAIL_SOURCE_IDS.map((id) => [id, trailTileTemplate(TRAIL_SOURCES[id])]));

/**
 * The topo base map and the public trails overlay, drawn as tiles inside a MapView. Put it first
 * among the map's children so routes and rider pins draw on top. Every tile seen is kept on the
 * phone, so a trail you looked at with signal is still there without it.
 *
 * With no signal (`offline`), every layer reads only what is saved on the phone, stretching a
 * saved wider square where a closer one is missing, and the satellite map is drawn from the
 * downloaded USGS aerial photos, since Apple's satellite imagery can't be saved ahead of time.
 */
export function TrailTiles({ base, trails, offline = false }: { base: BaseMap; trails: boolean; offline?: boolean }) {
  return (
    <>
      {base === 'satellite' && offline ? (
        <UrlTile
          urlTemplate={USGS_IMAGERY}
          offlineMode
          maximumNativeZ={IMAGERY_MAX_NATIVE_Z}
          tileCachePath={tileCachePath('imagery')}
          zIndex={-3}
        />
      ) : null}
      {base === 'topo' ? (
        <UrlTile
          urlTemplate={USGS_TOPO}
          shouldReplaceMapContent
          maximumNativeZ={TOPO_MAX_NATIVE_Z}
          tileCachePath={tileCachePath('topo')}
          tileCacheMaxAge={TILE_MAX_AGE_S}
          offlineMode={offline}
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
              offlineMode={offline}
              zIndex={-1}
            />
          ))
        : null}
    </>
  );
}
