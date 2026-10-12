import { Fragment, memo } from 'react';
import { Polyline, UrlTile, WMSTile } from 'react-native-maps';

import { IMAGERY_MAX_NATIVE_Z, USGS_IMAGERY } from '@/core/offline-maps';
import type { OsmTrail } from '@/core/osm-trails';
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
export function TrailTiles({
  base, trails, offline = false, osm = [],
}: { base: BaseMap; trails: boolean; offline?: boolean; osm?: OsmTrail[] }) {
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
      {trails && osm.length ? <OsmLines lines={osm} /> : null}
    </>
  );
}

const SAND = '#ECCD91';
const CASING = 'rgba(10,22,38,0.67)';
const coords = (part: OsmTrail['parts'][number]) => part.map((p) => ({ latitude: p.lat, longitude: p.lng }));

/**
 * OpenStreetMap dirt tracks (core/osm-trails) drawn in the same sand dash as the agency trails,
 * so a rider sees one kind of line for "dirt you can follow" whatever the source.
 */
const OsmLines = memo(function OsmLines({ lines }: { lines: OsmTrail[] }) {
  return (
    <>
      {lines.map((t) =>
        t.parts.map((part, i) => (
          <Fragment key={`${t.key}-${i}`}>
            <Polyline coordinates={coords(part)} strokeColor={CASING} strokeWidth={4.5} zIndex={0} tappable={false} />
            <Polyline coordinates={coords(part)} strokeColor={SAND} strokeWidth={2.2} lineDashPattern={[7, 5]} zIndex={0} tappable={false} />
          </Fragment>
        )),
      )}
    </>
  );
});
