import Mapbox from '@rnmapbox/maps';
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Inset } from '@/core/map-center';
import { RIDER_TRAIL_INK } from '@/core/nav-trails';
import {
  cameraPadding, fitCorners, flatLook, linesGeoJSON, lookPitch, mapboxStyleFor, metersPerPointAt, mapboxTileTemplate, pointsGeoJSON, regionFromCamera,
  TERRAIN_EXAGGERATION, TERRAIN_IDS, TERRAIN_SOURCES, terrainExaggeration, terrainLayers, TOPO_LAYER_ID, TOPO_RASTER_SOURCE, TOPO_SOURCE_ID, trailZoomFromMapbox,
  type MapLook,
} from '@/core/terrain';
import { TRAIL_INK, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MAPBOX_TOKEN, mapboxBuilt } from '@/lib/terrain';
import type { MapFill, MapIdle, MapLine, MapboxMapHandle, MapboxOwnFix } from './mapbox-map-types';

export type { MapFill, MapIdle, MapLine, MapboxMapHandle, MapboxOwnFix } from './mapbox-map-types';

if (mapboxBuilt) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  // No third-party trackers: Mapbox's usage telemetry stays off.
  Mapbox.setTelemetryEnabled(false);
}

/** Riding distance in Mapbox's zoom, used when a far-out map is asked to center on a rider. */
const RIDE_ZOOM = 13.5;
/** Mapbox's zoom below which the map counts as zoomed far out (a state or more across). */
const FAR_OUT_ZOOM = 8;

const AGENCY = TRAIL_SOURCE_IDS.map((id) => ({ id, tiles: [mapboxTileTemplate(trailTileTemplate(TRAIL_SOURCES[id]))] }));
const TERRAIN_STYLE_JSON = { version: 8, sources: TERRAIN_SOURCES, layers: terrainLayers() };

/**
 * The Mapbox map for iPhone, iPad and Android (core/terrain): the rider's look (standard,
 * satellite, topo or 3D Terrain), the same trail layers as the flat maps, the screen's own lines
 * (`lines`, drawn in order), fills and markers (`children`, MapboxMarker). One finger pans, two
 * fingers pinch and turn, and in 3D Terrain tilt the map: the further it tilts, the more the
 * terrain is raised (core/terrain terrainExaggeration). `interactive={false}` makes a still
 * picture, for a preview inside a page.
 */
export function MapboxMap({
  trail, look, tilt, rotate = true, compass = true, scaleBar = false, interactive = true, initial, lines, fills, onPress, onLongPress, onUserMove, onReady, onCamera, onOwnFix, onIdle,
  children, ref,
}: {
  trail: TrailMap;
  /** The look to draw; missing: the rider's own choice. */
  look?: MapLook;
  /** Whether two fingers can tilt the map (3D Terrain by default). */
  tilt?: boolean;
  rotate?: boolean;
  compass?: boolean;
  scaleBar?: boolean;
  /** Off: a still map that ignores touches (no pan, zoom, tilt or taps). */
  interactive?: boolean;
  /** Where to open (a Mapbox zoom). Missing: over the lower 48 until the screen frames something. */
  initial?: { center: LatLng; zoom?: number } | null;
  lines?: MapLine[];
  fills?: MapFill[];
  /** A tap; without one, a tap looks up the trail under the finger. */
  onPress?: (p: LatLng) => void;
  onLongPress?: (p: LatLng) => void;
  /** The rider dragged, pinched, turned or tilted the map. */
  onUserMove?: () => void;
  onReady?: () => void;
  /** The camera's turn from north, for heading arrows on pins. */
  onCamera?: (c: { heading: number }) => void;
  /** Each fix of the phone's own location (Follow Me). */
  onOwnFix?: (f: MapboxOwnFix) => void;
  onIdle?: (c: MapIdle) => void;
  children?: ReactNode;
  ref?: Ref<MapboxMapHandle>;
}) {
  // A map told to stay flat shows 3D Terrain as plain satellite.
  const shown: MapLook = look ?? (tilt === false ? flatLook(trail.look) : trail.look);
  const tilts = tilt ?? shown === 'terrain';
  const view = useRef<Mapbox.MapView>(null);
  const camera = useRef<Mapbox.Camera>(null);
  const size = useRef({ width: 390, height: 800 });
  const zoom = useRef(initial?.zoom ?? 4);
  const heading = useRef(0);
  // How much the terrain is raised, following the tilt (only while 3D Terrain is shown).
  const [exaggeration, setExaggeration] = useState(TERRAIN_EXAGGERATION);
  const ownFix = useRef(onOwnFix);
  useEffect(() => {
    ownFix.current = onOwnFix;
  }, [onOwnFix]);

  // Switching to or from 3D Terrain tilts the map up or lays it flat again.
  const firstLook = useRef(shown);
  useEffect(() => {
    if (firstLook.current === shown) return;
    firstLook.current = shown;
    camera.current?.setCamera({ pitch: lookPitch(shown), animationDuration: 600, animationMode: 'easeTo' });
  }, [shown]);

  useImperativeHandle(ref, () => ({
    centerOn(p, inset, opts) {
      const far = zoom.current < FAR_OUT_ZOOM;
      camera.current?.setCamera({
        centerCoordinate: [p.lng, p.lat],
        padding: cameraPadding(inset ?? { top: 0, right: 0, bottom: 0, left: 0 }, size.current),
        ...(far || opts?.zoom != null ? { zoomLevel: opts?.zoom ?? RIDE_ZOOM } : {}),
        animationDuration: opts?.animated === false ? 0 : opts?.duration ?? 450,
        animationMode: 'easeTo',
      });
    },
    fit(points, inset, animated = true) {
      const c = fitCorners(points);
      if (!c) return;
      camera.current?.fitBounds(c[0], c[1], [inset.top, inset.right, inset.bottom, inset.left], animated ? 600 : 0);
    },
    zoomBy(levels) {
      camera.current?.zoomTo(Math.max(1, Math.min(22, zoom.current + levels)), 250);
    },
    async pointAt(x, y) {
      try {
        const p = await view.current?.getCoordinateFromView([x, y]);
        return p ? { lat: p[1], lng: p[0] } : null;
      } catch {
        return null;
      }
    },
    isFarOut: () => zoom.current < FAR_OUT_ZOOM,
  }), []);

  const camChanged = useCallback((s: Mapbox.MapState) => {
    const p = s.properties;
    zoom.current = p.zoom;
    const h = Math.round((p.heading ?? 0) / 5) * 5 % 360;
    if (h !== heading.current) {
      heading.current = h;
      onCamera?.({ heading: h });
    }
    if (shown === 'terrain') setExaggeration(terrainExaggeration(p.pitch ?? 0));
    if (s.gestures?.isGestureActive) onUserMove?.();
  }, [onCamera, onUserMove, shown]);

  const idle = useCallback((s: Mapbox.MapState) => {
    const p = s.properties;
    const center = { lat: p.center[1], lng: p.center[0] };
    zoom.current = p.zoom;
    trail.onRegion(regionFromCamera(center, p.zoom, size.current), trailZoomFromMapbox(p.zoom));
    onIdle?.({
      center,
      zoom: p.zoom,
      bounds: { minLat: p.bounds.sw[1], maxLat: p.bounds.ne[1], minLng: p.bounds.sw[0], maxLng: p.bounds.ne[0] },
      metersPerPoint: metersPerPointAt(center.lat, p.zoom),
    });
  }, [trail, onIdle]);

  const at = (f: GeoJSON.Feature<GeoJSON.Point>): LatLng => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        trail.mapProps.onLayout(e);
      }}>
      <Mapbox.MapView
        ref={view}
        style={StyleSheet.absoluteFill}
        styleURL={mapboxStyleFor(shown)}
        projection="mercator"
        compassEnabled={compass}
        compassPosition={{ top: 8, right: 8 }}
        scaleBarEnabled={scaleBar}
        scaleBarPosition={{ bottom: 28, left: 8 }}
        logoPosition={{ bottom: 6, left: 8 }}
        attributionPosition={{ bottom: 4, right: 8 }}
        pitchEnabled={interactive && tilts}
        rotateEnabled={interactive && rotate}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        onDidFinishLoadingMap={onReady}
        onCameraChanged={camChanged}
        onMapIdle={idle}
        onPress={interactive ? (f) => (onPress ? onPress(at(f)) : trail.identifyAt(at(f).lat, at(f).lng)) : undefined}
        onLongPress={!interactive ? undefined : onLongPress ? (f) => onLongPress(at(f)) : (f) => trail.identifyAt(at(f).lat, at(f).lng)}>
        <Mapbox.Camera
          ref={camera}
          defaultSettings={{
            centerCoordinate: initial ? [initial.center.lng, initial.center.lat] : [-105.8, 39.5],
            zoomLevel: initial?.zoom ?? (initial ? RIDE_ZOOM : 4),
            pitch: lookPitch(shown),
          }}
        />
        {shown === 'terrain' ? (
          <>
            <Mapbox.RasterDemSource id={TERRAIN_IDS.dem} url={TERRAIN_SOURCES[TERRAIN_IDS.dem].url} tileSize={512} maxZoomLevel={14}>
              <Mapbox.Terrain style={{ exaggeration }} />
            </Mapbox.RasterDemSource>
            <Mapbox.Atmosphere style={{ color: '#9DB8D6', highColor: '#24466F', horizonBlend: 0.08, spaceColor: Colors.background, starIntensity: 0 }} />
            <Mapbox.Style json={TERRAIN_STYLE_JSON as never} />
          </>
        ) : null}
        {shown === 'topo' ? (
          <Mapbox.RasterSource id={TOPO_SOURCE_ID} tileUrlTemplates={TOPO_RASTER_SOURCE.tiles as unknown as string[]} tileSize={256} maxZoomLevel={TOPO_RASTER_SOURCE.maxzoom}>
            <Mapbox.RasterLayer id={TOPO_LAYER_ID} sourceID={TOPO_SOURCE_ID} style={{ rasterOpacity: 1 }} />
          </Mapbox.RasterSource>
        ) : null}
        <TrailLayers trail={trail} />
        {(fills ?? []).map((f) => (
          <Fill key={f.id} fill={f} />
        ))}
        {(lines ?? []).map((l) => (
          <Line key={l.id} line={l} />
        ))}
        <Mapbox.UserLocation visible={false} minDisplacement={1} onUpdate={(loc) => {
          const c = loc.coords;
          ownFix.current?.({ lat: c.latitude, lng: c.longitude, course: c.course ?? null, speed: c.speed ?? null });
        }} />
        <Mapbox.LocationPuck puckBearingEnabled puckBearing="course" pulsing={{ isEnabled: false }} />
        {children}
      </Mapbox.MapView>
    </View>
  );
}

/** A screen's line: navy casing, then the colored line, optionally dashed (in points). */
const Line = memo(function Line({ line }: { line: MapLine }) {
  const shape = useMemo(() => linesGeoJSON(
    (Array.isArray(line.points[0]) ? (line.points as LatLng[][]) : [line.points as LatLng[]]).map((pts, i) => ({ key: `${line.id}-${i}`, points: pts })),
  ), [line.id, line.points]);
  const dash = line.dash ? line.dash.map((d) => d / line.width) : undefined;
  return (
    <Mapbox.ShapeSource id={`oml-line-${line.id}`} shape={shape}>
      <Mapbox.LineLayer
        id={`oml-line-${line.id}-case`}
        style={{
          lineColor: line.casing ?? line.color, lineOpacity: line.casing ? 1 : 0, lineWidth: line.casingWidth ?? line.width + 4, lineCap: 'round', lineJoin: 'round',
        }}
      />
      <Mapbox.LineLayer
        id={`oml-line-${line.id}-ink`}
        style={{ lineColor: line.color, lineWidth: line.width, lineCap: dash ? 'butt' : 'round', lineJoin: 'round', ...(dash ? { lineDasharray: dash } : {}) }}
      />
    </Mapbox.ShapeSource>
  );
});

/** A filled shape with an outline (Find a Ride's search ring). */
const Fill = memo(function Fill({ fill }: { fill: MapFill }) {
  return (
    <Mapbox.ShapeSource id={`oml-fill-${fill.id}`} shape={fill.polygon}>
      <Mapbox.FillLayer id={`oml-fill-${fill.id}-fill`} style={{ fillColor: fill.color, fillOpacity: fill.opacity }} />
      <Mapbox.LineLayer id={`oml-fill-${fill.id}-line`} style={{ lineColor: fill.stroke, lineWidth: fill.strokeWidth }} />
    </Mapbox.ShapeSource>
  );
});

const OPEN_DASH = [9 / 3.2, 5 / 3.2];
const CLOSED_DASH = [5 / 3.2, 5 / 3.2];

/**
 * Public trails, matching the flat maps: the agencies' own squares draped on the ground,
 * OpenStreetMap tracks and today's seasonal closures as amber or red dashes on navy, trail
 * names, and rider-mapped trails as mint dots.
 */
const TrailLayers = memo(function TrailLayers({ trail }: { trail: TrailMap }) {
  const { trails, offline, osmLines, closedLines, labels, riderTrails } = trail;
  const tracks = useMemo(() => linesGeoJSON([
    ...osmLines.flatMap((t) => t.parts.map((points, i) => ({ key: `${t.key}-${i}`, points, props: { closed: t.closed } }))),
    ...closedLines.flatMap((l) => l.parts.map((points, i) => ({ key: `c-${l.key}-${i}`, points, props: { closed: true } }))),
  ]), [osmLines, closedLines]);
  const names = useMemo(() => pointsGeoJSON(labels.map((l) => ({ key: l.key, at: l.at, props: { name: l.closed ? `${l.name} · Closed` : l.name, closed: l.closed } }))), [labels]);
  const riders = useMemo(() => linesGeoJSON(riderTrails.map((t) => ({ key: t.id, points: t.points }))), [riderTrails]);
  return (
    <>
      {trails && !offline
        ? AGENCY.map((a) => (
            <Mapbox.RasterSource key={a.id} id={`oml-agency-${a.id}`} tileUrlTemplates={a.tiles} tileSize={256} minZoomLevel={TRAILS_MIN_Z}>
              <Mapbox.RasterLayer id={`oml-agency-${a.id}-layer`} sourceID={`oml-agency-${a.id}`} style={{ rasterOpacity: 1 }} />
            </Mapbox.RasterSource>
          ))
        : null}
      <Mapbox.ShapeSource id="oml-tracks" shape={tracks}>
        <Mapbox.LineLayer id="oml-tracks-case" style={{ lineColor: TRAIL_INK.casing, lineWidth: 6.5, lineJoin: 'round', visibility: trails ? 'visible' : 'none' }} />
        <Mapbox.LineLayer
          id="oml-tracks-open"
          filter={['!=', ['get', 'closed'], true]}
          style={{ lineColor: TRAIL_INK.trail, lineWidth: 3.2, lineDasharray: OPEN_DASH, visibility: trails ? 'visible' : 'none' }}
        />
        <Mapbox.LineLayer
          id="oml-tracks-closed"
          filter={['==', ['get', 'closed'], true]}
          style={{ lineColor: TRAIL_INK.closed, lineWidth: 3.2, lineDasharray: CLOSED_DASH, visibility: trails ? 'visible' : 'none' }}
        />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-rider-trails" shape={riders}>
        <Mapbox.LineLayer id="oml-rider-trails-case" style={{ lineColor: TRAIL_INK.casing, lineWidth: 7, lineJoin: 'round' }} />
        <Mapbox.LineLayer id="oml-rider-trails-dots" style={{ lineColor: RIDER_TRAIL_INK, lineWidth: 4, lineCap: 'round', lineDasharray: [0.25, 2] }} />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-trail-names" shape={names}>
        <Mapbox.SymbolLayer
          id="oml-trail-names-text"
          style={{
            textField: ['get', 'name'],
            textSize: 12,
            textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            textColor: ['case', ['get', 'closed'], '#FF8A80', '#FFFFFF'],
            textHaloColor: 'rgba(10,22,38,0.92)',
            textHaloWidth: 1.6,
            textMaxWidth: 14,
            visibility: trails ? 'visible' : 'none',
          }}
        />
      </Mapbox.ShapeSource>
    </>
  );
});

/**
 * A pin on the map: any view, anchored at `anchor` (0 to 1 across and down the view). A draggable
 * pin (the route builder's numbered points) reports where it was dropped.
 */
export function MapboxMarker({
  id, at, anchor = { x: 0.5, y: 0.5 }, draggable, onDragEnd, children,
}: { id?: string; at: LatLng; anchor?: { x: number; y: number }; draggable?: boolean; onDragEnd?: (p: LatLng) => void; children: ReactNode }) {
  if (draggable) {
    return (
      <Mapbox.PointAnnotation
        id={id ?? `drag-${at.lat}-${at.lng}`}
        coordinate={[at.lng, at.lat]}
        anchor={anchor}
        draggable
        onDragEnd={(e) => {
          const c = e.geometry.coordinates;
          onDragEnd?.({ lat: c[1], lng: c[0] });
        }}>
        <View>{children}</View>
      </Mapbox.PointAnnotation>
    );
  }
  return (
    <Mapbox.MarkerView coordinate={[at.lng, at.lat]} anchor={anchor} allowOverlap allowOverlapWithPuck>
      <View>{children}</View>
    </Mapbox.MarkerView>
  );
}

// Older names, from when only 3D Terrain was drawn by Mapbox.
export const TerrainMap = MapboxMap;
export const TerrainMarker = MapboxMarker;

export type { Inset };
