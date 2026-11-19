import Mapbox from '@rnmapbox/maps';
import { memo, type ReactElement } from 'react';

import {
  CAMP_FILTER, CAMP_INK, CAMPS_MIN_Z, FALLING_SNOW_STYLE, OSM_POI_LAYER, OSM_ROADS_LAYER, rnRasterPaint, SLED_INK, STATIONS_MIN_Z, TWISTY_COLOR,
  TWISTY_FILTER, TWISTY_MIN_Z,
} from '@/core/activity-layers';
import { OSM_TILEJSON } from '@/core/osm-trails';
import type { ActivityMap } from '@/hooks/use-activity-map';

/**
 * The rider's activity's look on the apps' Mapbox maps (core/activity-layers.ts): Snow on the
 * Ground and avalanche zones under the trails; sled trails, byways, Twisty Roads, campgrounds and
 * snow stations over them; Falling Snow over everything. Every layer sits below the app's own
 * tracks (oml-tracks-hike), so the ride's route and the riders always stay on top.
 */

/** Everything activity layers draw goes in below this (TrailLayers always has it). */
const BELOW = 'oml-tracks-hike';
const LABEL_FONT = ['DIN Pro Bold', 'Arial Unicode MS Bold'];
/** OpenFreeMap roads and places, for Twisty Roads and Campgrounds (queried by mapbox-map.tsx). */
export const ACTIVITY_OSM_SOURCE = 'oml-act-osm';
export const TWISTY_QUERY_LAYER = 'oml-act-roads';

/** `below`: the lowest agency trail layer when there is one, so the frost never dims a trail. */
export const ActivityUnder = memo(function ActivityUnder({ act, below = BELOW }: { act: ActivityMap; below?: string }) {
  const under = act.rasters.filter((r) => r.under);
  return (
    <>
      {under.map((r) => (
        <Mapbox.RasterSource key={r.key} id={`oml-act-${r.key}`} tileUrlTemplates={[r.template]} tileSize={r.tileSize} minZoomLevel={r.minZ} maxZoomLevel={r.maxZ}>
          <Mapbox.RasterLayer id={`oml-act-${r.key}-layer`} sourceID={`oml-act-${r.key}`} belowLayerID={below} style={rnRasterPaint(r.paint) as never} />
        </Mapbox.RasterSource>
      ))}
      {act.avalanche ? (
        <Mapbox.ShapeSource id="oml-act-avalanche" shape={act.avalanche}>
          <Mapbox.FillLayer id="oml-act-avalanche-fill" belowLayerID={below} filter={['get', 'rated']} style={{ fillColor: ['get', 'color'], fillOpacity: 0.26 }} />
          <Mapbox.LineLayer id="oml-act-avalanche-line" belowLayerID={below} style={{ lineColor: ['case', ['get', 'rated'], ['get', 'color'], 'rgba(255,255,255,0.45)'], lineWidth: 1.6, lineDasharray: [3, 2] }} />
          <Mapbox.SymbolLayer
            id="oml-act-avalanche-name"
            belowLayerID={below}
            minZoomLevel={6}
            style={{
              textField: ['get', 'label'], textSize: 12, textColor: '#FFFFFF', textHaloColor: 'rgba(10,22,38,0.9)', textHaloWidth: 1.6,
              textFont: LABEL_FONT, symbolPlacement: 'point',
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}
    </>
  );
});

export const ActivityOver = memo(function ActivityOver({ act, twisty }: { act: ActivityMap; twisty: GeoJSON.FeatureCollection | null }) {
  const over = act.rasters.filter((r) => !r.under);
  return (
    <>
      {over.map((r) => (
        <Mapbox.RasterSource key={r.key} id={`oml-act-${r.key}`} tileUrlTemplates={[r.template]} tileSize={r.tileSize} minZoomLevel={r.minZ - 1}>
          <Mapbox.RasterLayer id={`oml-act-${r.key}-layer`} sourceID={`oml-act-${r.key}`} minZoomLevel={r.minZ} belowLayerID={BELOW} style={rnRasterPaint(r.paint) as never} />
        </Mapbox.RasterSource>
      ))}
      {act.twisty || act.camps ? (
        <Mapbox.VectorSource id={ACTIVITY_OSM_SOURCE} url={OSM_TILEJSON}>
          {[
            act.twisty ? (
              // Invisible: it only makes Mapbox load the roads, which mapbox-map.tsx then scores.
              <Mapbox.LineLayer key="q" id={TWISTY_QUERY_LAYER} sourceLayerID={OSM_ROADS_LAYER} filter={TWISTY_FILTER as never} minZoomLevel={TWISTY_MIN_Z} belowLayerID={BELOW} style={{ lineOpacity: 0 }} />
            ) : null,
            act.camps ? (
              <Mapbox.CircleLayer
                key="c"
                id="oml-act-camps"
                sourceLayerID={OSM_POI_LAYER}
                filter={CAMP_FILTER as never}
                minZoomLevel={CAMPS_MIN_Z}
                belowLayerID={BELOW}
                style={{ circleRadius: ['interpolate', ['linear'], ['zoom'], 9, 3.5, 14, 7], circleColor: CAMP_INK, circleStrokeColor: '#3B2A05', circleStrokeWidth: 1.5 }}
              />
            ) : null,
            act.camps ? (
              <Mapbox.SymbolLayer
                key="n"
                id="oml-act-camps-name"
                sourceLayerID={OSM_POI_LAYER}
                filter={CAMP_FILTER as never}
                minZoomLevel={12}
                belowLayerID={BELOW}
                style={{
                  textField: ['get', 'name'], textSize: 11, textOffset: [0, 1.2], textAnchor: 'top', textColor: CAMP_INK,
                  textHaloColor: 'rgba(10,22,38,0.9)', textHaloWidth: 1.4, textFont: LABEL_FONT,
                }}
              />
            ) : null,
          ].filter((e): e is ReactElement => !!e)}
        </Mapbox.VectorSource>
      ) : null}
      {act.twisty && twisty ? (
        <Mapbox.ShapeSource id="oml-act-twisty" shape={twisty}>
          <Mapbox.LineLayer id="oml-act-twisty-case" belowLayerID={BELOW} minZoomLevel={TWISTY_MIN_Z} style={{ lineColor: 'rgba(10,22,38,0.8)', lineWidth: 7, lineJoin: 'round', lineCap: 'round' }} />
          <Mapbox.LineLayer id="oml-act-twisty-line" belowLayerID={BELOW} minZoomLevel={TWISTY_MIN_Z} style={{ lineColor: TWISTY_COLOR as never, lineWidth: 4, lineJoin: 'round', lineCap: 'round' }} />
        </Mapbox.ShapeSource>
      ) : null}
      {act.stations ? (
        <Mapbox.ShapeSource id="oml-act-stations" shape={act.stations}>
          <Mapbox.CircleLayer
            id="oml-act-stations-dot"
            belowLayerID={BELOW}
            minZoomLevel={STATIONS_MIN_Z}
            style={{ circleRadius: 5, circleColor: ['case', ['get', 'bare'], 'rgba(255,255,255,0.35)', '#FFFFFF'], circleStrokeColor: SLED_INK, circleStrokeWidth: 2 }}
          />
          <Mapbox.SymbolLayer
            id="oml-act-stations-depth"
            belowLayerID={BELOW}
            minZoomLevel={7}
            filter={['!', ['get', 'bare']]}
            style={{
              textField: ['get', 'label'], textSize: 12, textOffset: [0, -1.3], textColor: '#FFFFFF', textHaloColor: 'rgba(10,22,38,0.9)', textHaloWidth: 1.6,
              textFont: LABEL_FONT, textAllowOverlap: false,
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}
      {act.snowing ? <Mapbox.Snow style={FALLING_SNOW_STYLE as never} /> : null}
    </>
  );
});
