import Mapbox from '@rnmapbox/maps';
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { isLatLng, type LatLng } from '@/core/geo';
import type { Inset } from '@/core/map-center';
import { JUNCTION_QUERY_FILTER, junctionLines } from '@/core/intersections';
import { RIDER_TRAIL_INK } from '@/core/nav-trails';
import { parkPieces, parkSummaryLine, PARK_NAMES_MIN_Z } from '@/core/park-trails';
import {
  AGENCY_TILE_SIZE, cameraPadding, fitCorners, flatLook, linesGeoJSON, lookPitch, mapboxAgencyTemplate, mapboxStyleFor, metersPerPointAt, NATIVE_TRACKS_MIN_ZOOM,
  nativeTracks, OSM_SOURCE_ID, pointsGeoJSON, regionFromCamera, SETTLE_MS,
  TERRAIN_EXAGGERATION, TERRAIN_IDS, TERRAIN_SOURCES, terrainExaggeration, terrainLayers, TOPO_LAYER_ID, TOPO_RASTER_SOURCE, TOPO_SOURCE_ID, trailZoomFromMapbox,
  type MapLook,
} from '@/core/terrain';
import { OSM_TILEJSON } from '@/core/osm-trails';
import { FEATURE_BY_ID, osmFeatureLayers, rnStyle } from '@/core/map-features';
import { TRAIL_INK } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MAPBOX_TOKEN, mapboxBuilt } from '@/lib/terrain';
import type { MapFill, MapIdle, MapLine, MapboxMapHandle, MapboxOwnFix } from './mapbox-map-types';
import { riderHeading } from '@/core/heading';
import { useHasCompass } from '@/lib/compass';
import { dotScale } from '@/core/dot-size';
import { useDotSizePref, useDotStylePref } from '@/hooks/use-dot-size';

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

/**
 * Your own dot in every Dot Style as images for Mapbox's native location puck (drawn by
 * scripts/puck/make-images.mjs from core/own-dot-art). 2.1 first drew it as a React marker that slid in JavaScript about 30 times
 * a second; on a phone it trailed the map while the map moved and made the map stutter.
 */
const PUCK_IMAGES = {
  'oml-you-dome-moving': require('../../assets/images/puck/you-dome-moving.png'),
  'oml-you-dome-stopped': require('../../assets/images/puck/you-dome-stopped.png'),
  'oml-you-ring-moving': require('../../assets/images/puck/you-ring-moving.png'),
  'oml-you-ring-stopped': require('../../assets/images/puck/you-ring-stopped.png'),
  'oml-you-arrow-moving': require('../../assets/images/puck/you-arrow-moving.png'),
  'oml-you-arrow-stopped': require('../../assets/images/puck/you-arrow-stopped.png'),
  'oml-you-orange-moving': require('../../assets/images/puck/you-orange-moving.png'),
  'oml-you-orange-stopped': require('../../assets/images/puck/you-orange-stopped.png'),
  'oml-you-classic-moving': require('../../assets/images/puck/you-classic-moving.png'),
  'oml-you-classic-stopped': require('../../assets/images/puck/you-classic-stopped.png'),
  'oml-you-dome-still': require('../../assets/images/puck/you-dome-still.png'),
  'oml-you-ring-still': require('../../assets/images/puck/you-ring-still.png'),
  'oml-you-arrow-still': require('../../assets/images/puck/you-arrow-still.png'),
  'oml-you-orange-still': require('../../assets/images/puck/you-orange-still.png'),
  'oml-you-classic-still': require('../../assets/images/puck/you-classic-still.png'),
  'oml-puck-clear': require('../../assets/images/puck/clear.png'),
};

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
  // Until when the camera is moving because the app moved it.
  const autoUntil = useRef(0);
  // When a finger last moved on the map: a drag then counts as the rider's even while Follow Me
  // is still panning (Follow Me keeps the window above open on every fix). A tap (no move)
  // doesn't count, so tapping a trail mid-pan leaves Follow Me on.
  const movedAt = useRef(0);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const autoMove = (ms: number) => {
    autoUntil.current = Math.max(autoUntil.current, Date.now() + ms + 200);
  };
  // Tells your own dot whether you're moving; the dot keeps that state itself, so a change
  // re-draws only the dot, not the whole map.
  const puckMoving = useRef<((moving: boolean) => void) | null>(null);
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
    autoMove(600);
    camera.current?.setCamera({ pitch: lookPitch(shown), animationDuration: 600, animationMode: 'easeTo' });
  }, [shown]);

  useImperativeHandle(ref, () => ({
    centerOn(p, inset, opts) {
      if (!isLatLng(p)) return;
      const far = zoom.current < FAR_OUT_ZOOM;
      autoMove(opts?.animated === false ? 0 : opts?.duration ?? 450);
      camera.current?.setCamera({
        centerCoordinate: [p.lng, p.lat],
        padding: cameraPadding(inset ?? { top: 0, right: 0, bottom: 0, left: 0 }, size.current),
        ...(far || opts?.zoom != null ? { zoomLevel: opts?.zoom ?? RIDE_ZOOM } : {}),
        animationDuration: opts?.animated === false ? 0 : opts?.duration ?? 450,
        animationMode: 'easeTo',
      });
    },
    fit(points, inset, animated = true) {
      const c = fitCorners(points.filter(isLatLng));
      if (!c) return;
      autoMove(animated ? 600 : 0);
      camera.current?.fitBounds(c[0], c[1], [inset.top, inset.right, inset.bottom, inset.left], animated ? 600 : 0);
    },
    zoomBy(levels) {
      autoMove(250);
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
    async project(p) {
      try {
        const pt = await view.current?.getPointInView([p.lng, p.lat]);
        return pt ? { x: pt[0], y: pt[1] } : null;
      } catch {
        return null;
      }
    },
    camera: () => ({ zoom: zoom.current, heading: heading.current, ...size.current }),
    zoomTo(z, duration = 700) {
      autoMove(duration);
      camera.current?.setCamera({ zoomLevel: z, animationDuration: duration, animationMode: 'easeTo' });
    },
    async roadsNear(p, radiusPt) {
      try {
        const pt = await view.current?.getPointInView([p.lng, p.lat]);
        if (!pt) return [];
        // Only lines with a road or trail class (or the app's own tracks): asking for everything drawn
        // sent every label, building and land shape to JavaScript each second and stalled the map.
        const fc = await view.current?.queryRenderedFeaturesInRect(
          [pt[1] - radiusPt, pt[0] - radiusPt, pt[1] + radiusPt, pt[0] + radiusPt], JUNCTION_QUERY_FILTER as never, null,
        );
        return junctionLines((fc?.features ?? []) as never);
      } catch {
        return [];
      }
    },
  }), []);

  // Trail names, closures and rider trails load as soon as the camera rests (SETTLE_MS), rather
  // than when Mapbox calls the map idle, which waits for every square on screen to arrive.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);
  const reported = useRef<string | null>(null);
  const regionKey = (c: LatLng, z: number) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${z.toFixed(2)},${size.current.width}x${size.current.height}`;
  const camChanged = useCallback((s: Mapbox.MapState) => {
    const p = s.properties;
    zoom.current = p.zoom;
    if (settle.current) clearTimeout(settle.current);
    const center = { lat: p.center[1], lng: p.center[0] };
    const z = p.zoom;
    settle.current = setTimeout(() => {
      settle.current = null;
      reported.current = regionKey(center, z);
      trail.onRegion(regionFromCamera(center, z, size.current), trailZoomFromMapbox(z));
    }, SETTLE_MS);
    const h = Math.round((p.heading ?? 0) / 5) * 5 % 360;
    if (h !== heading.current) {
      heading.current = h;
      onCamera?.({ heading: h });
    }
    // In steps of a tenth, so a tilt redraws the map a few times rather than on every frame.
    if (shown === 'terrain') setExaggeration(Math.round(terrainExaggeration(p.pitch ?? 0) * 10) / 10);
    // Only the rider's own drag, pinch or turn counts; the app's own camera moves (Follow Me, a fit)
    // can report a gesture on some phones, which paused Follow Me after its first move.
    if (s.gestures?.isGestureActive && (Date.now() - movedAt.current < 1000 || Date.now() > autoUntil.current)) onUserMove?.();
  }, [onCamera, onUserMove, shown, trail]);

  const idle = useCallback((s: Mapbox.MapState) => {
    const p = s.properties;
    const center = { lat: p.center[1], lng: p.center[0] };
    zoom.current = p.zoom;
    // The settle timer in camChanged usually asked for this region already; ask only when it
    // hasn't (a pending timer, or a rest the camera never announced, such as the first load).
    const key = regionKey(center, p.zoom);
    if (settle.current || reported.current !== key) {
      if (settle.current) clearTimeout(settle.current);
      settle.current = null;
      reported.current = key;
      trail.onRegion(regionFromCamera(center, p.zoom, size.current), trailZoomFromMapbox(p.zoom));
    }
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
      onTouchStart={(e) => {
        downAt.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onTouchCancel={() => {
        // The map's own pan took the touch over: that is a drag (a tap ends, it isn't cancelled).
        if (downAt.current) movedAt.current = Date.now();
        downAt.current = null;
      }}
      onTouchEnd={() => {
        downAt.current = null;
      }}
      onTouchMove={(e) => {
        // Past a finger's wobble (10 points), so a tap that shifts a little stays a tap.
        const d = downAt.current;
        if (!d || Math.hypot(e.nativeEvent.pageX - d.x, e.nativeEvent.pageY - d.y) >= 10) movedAt.current = Date.now();
      }}
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
            centerCoordinate: initial && isLatLng(initial.center) ? [initial.center.lng, initial.center.lat] : [-105.8, 39.5],
            zoomLevel: initial && isLatLng(initial.center) ? initial.zoom ?? RIDE_ZOOM : 4,
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
          const c = loc?.coords;
          // iPhone can send an update before it has a position (only a heading): skip it, since
          // the map library throws on a spot that isn't numbers.
          if (!c || !isLatLng({ lat: c.latitude, lng: c.longitude })) return;
          const f = { lat: c.latitude, lng: c.longitude, course: c.course ?? null, speed: c.speed ?? null };
          puckMoving.current?.(riderHeading({ speedMps: f.speed, headingDeg: f.course }, true) != null);
          ownFix.current?.(f);
        }} />
        {children}
        <NativePuck feedRef={puckMoving} />
      </Mapbox.MapView>
    </View>
  );
}

/** With no location update this long, the rider has stopped (ms). */
const PUCK_STILL_MS = 4000;

/**
 * Your own dot (the Chevron Puck, drawn as images): Mapbox moves and turns it itself, in step with
 * the map. Its arrow follows the GPS course while you move and the compass while you're stopped;
 * a stopped phone with no compass reading (some tablets) shows a round centre with no arrow.
 */
const NativePuck = memo(function NativePuck({ feedRef }: { feedRef: React.MutableRefObject<((moving: boolean) => void) | null> }) {
  const [moving, setMoving] = useState(false);
  // The images are drawn at Medium; Mapbox scales them for the rider's Dot Size.
  const [size] = useDotSizePref();
  const [style] = useDotStylePref();
  const hasCompass = useHasCompass();
  const kind = moving ? 'moving' : hasCompass ? 'stopped' : 'still';
  useEffect(() => {
    // Location updates stop once the phone stands still (they come only after a move), so with no
    // update for a few seconds the rider has stopped and the dot goes back to its stopped look.
    let still: ReturnType<typeof setTimeout> | undefined;
    feedRef.current = (m: boolean) => {
      setMoving(m);
      if (still) clearTimeout(still);
      still = m ? setTimeout(() => setMoving(false), PUCK_STILL_MS) : undefined;
    };
    return () => {
      if (still) clearTimeout(still);
      feedRef.current = null;
    };
  }, [feedRef]);
  return (
    <>
      <Mapbox.Images images={PUCK_IMAGES} />
      <Mapbox.LocationPuck
        puckBearingEnabled={kind !== 'still'}
        puckBearing={moving ? 'course' : 'heading'}
        topImage="oml-puck-clear"
        shadowImage="oml-puck-clear"
        bearingImage={`oml-you-${style}-${kind}`}
        pulsing={{ isEnabled: false }}
        scale={dotScale(size)}
      />
    </>
  );
});

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
const HIKE = FEATURE_BY_ID.hiking.ink;
const HIKE_DASH = (HIKE.dash ?? []).map((d) => Math.max(0.1, d / HIKE.width));
const OSM_LAYERS = osmFeatureLayers();

/**
 * Map Features, matching the flat maps: land tints and the agencies' own squares draped on the
 * ground (useTrailMap agencyLayers), OpenStreetMap roads, tracks and paths drawn by Mapbox from
 * the vector squares (core/map-features osmFeatureLayers), the app's own copies of the tracks
 * farther out, today's seasonal closures, trail names, and rider-mapped trails as mint dots.
 */
const TrailLayers = memo(function TrailLayers({ trail }: { trail: TrailMap }) {
  const { trails, offline, osmLines, closedLines, labels, riderTrails, features, agencyLayers, parkTrails, parkLabels, parks } = trail;
  const native = nativeTracks(trails, offline);
  const anyOsm = !offline && OSM_LAYERS.some((l) => features[l.feature]);
  // Where Mapbox draws the tracks itself, the app's own copies stop at that zoom.
  const ownMax = native ? NATIVE_TRACKS_MIN_ZOOM : 24;
  const tracks = useMemo(() => linesGeoJSON(
    osmLines.flatMap((t) => t.parts.map((points, i) => ({ key: `${t.key}-${i}`, points, props: { closed: t.closed, path: t.kind === 'path' } }))),
  ), [osmLines]);
  const closures = useMemo(() => linesGeoJSON(
    closedLines.flatMap((l) => l.parts.map((points, i) => ({ key: `c-${l.key}-${i}`, points, props: { closed: true } }))),
  ), [closedLines]);
  const shown = trails ? 'visible' : 'none';
  const names = useMemo(() => pointsGeoJSON(labels.map((l) => ({ key: l.key, at: l.at, props: { name: l.closed ? `${l.name} · Closed` : l.name, closed: l.closed } }))), [labels]);
  const riders = useMemo(() => linesGeoJSON(riderTrails.map((t) => ({ key: t.id, points: t.points }))), [riderTrails]);
  const parkLines = useMemo(() => linesGeoJSON(parkPieces(parkTrails).map((p) => ({ key: p.key, points: p.points, props: { color: p.color, closed: p.closed, road: p.road } }))), [parkTrails]);
  const parkNames = useMemo(() => pointsGeoJSON(parkLabels.map((l) => ({ key: `pl-${l.key}`, at: l.at, props: { name: l.closed ? `${l.name} · Closed` : l.name, closed: l.closed } }))), [parkLabels]);
  const parkTitles = useMemo(() => pointsGeoJSON(parks.map((p) => ({ key: `park-${p.parkOsmId}`, at: p.center, props: { name: p.parkName, sub: parkSummaryLine(p) } }))), [parks]);
  return (
    <>
      {!offline
        ? agencyLayers.map((a) => (
            <Mapbox.RasterSource key={a.key} id={`oml-agency-${a.key}`} tileUrlTemplates={[mapboxAgencyTemplate(a.template)]} tileSize={AGENCY_TILE_SIZE} minZoomLevel={a.minZ - 1}>
              <Mapbox.RasterLayer id={`oml-agency-${a.key}-layer`} sourceID={`oml-agency-${a.key}`} style={{ rasterOpacity: 1, rasterFadeDuration: 0 }} />
            </Mapbox.RasterSource>
          ))
        : null}
      {anyOsm ? (
        <Mapbox.VectorSource id={OSM_SOURCE_ID} url={OSM_TILEJSON}>
          {OSM_LAYERS.filter((l) => features[l.feature]).map((l) =>
            l.type === 'symbol' ? (
              <Mapbox.SymbolLayer key={l.id} id={l.id} sourceLayerID={l.sourceLayer} filter={l.filter as never} minZoomLevel={l.minzoom} style={rnStyle({ ...l.layout, ...l.paint }) as never} />
            ) : (
              <Mapbox.LineLayer key={l.id} id={l.id} sourceLayerID={l.sourceLayer} filter={l.filter as never} minZoomLevel={l.minzoom} style={rnStyle({ ...l.layout, ...l.paint }) as never} />
            ),
          )}
        </Mapbox.VectorSource>
      ) : null}
      <Mapbox.ShapeSource id="oml-tracks" shape={tracks}>
        <Mapbox.LineLayer
          id="oml-tracks-hike"
          filter={['==', ['get', 'path'], true]}
          maxZoomLevel={ownMax}
          style={{ lineColor: HIKE.color, lineWidth: HIKE.width, lineDasharray: HIKE_DASH, visibility: shown }}
        />
        <Mapbox.LineLayer id="oml-tracks-case" filter={['!=', ['get', 'path'], true]} maxZoomLevel={ownMax} style={{ lineColor: TRAIL_INK.casing, lineWidth: 6.5, lineJoin: 'round', visibility: shown }} />
        <Mapbox.LineLayer
          id="oml-tracks-open"
          filter={['all', ['!=', ['get', 'closed'], true], ['!=', ['get', 'path'], true]]}
          maxZoomLevel={ownMax}
          style={{ lineColor: TRAIL_INK.trail, lineWidth: 3.2, lineDasharray: OPEN_DASH, visibility: shown }}
        />
        <Mapbox.LineLayer
          id="oml-tracks-closed"
          filter={['all', ['==', ['get', 'closed'], true], ['!=', ['get', 'path'], true]]}
          maxZoomLevel={ownMax}
          style={{ lineColor: TRAIL_INK.closed, lineWidth: 3.2, lineDasharray: CLOSED_DASH, visibility: shown }}
        />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-closures" shape={closures}>
        <Mapbox.LineLayer id="oml-closures-case" style={{ lineColor: TRAIL_INK.casing, lineWidth: 6.5, lineJoin: 'round', visibility: shown }} />
        <Mapbox.LineLayer id="oml-closures-line" style={{ lineColor: TRAIL_INK.closed, lineWidth: 3.2, lineDasharray: CLOSED_DASH, visibility: shown }} />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-rider-trails" shape={riders}>
        <Mapbox.LineLayer id="oml-rider-trails-case" style={{ lineColor: TRAIL_INK.casing, lineWidth: 7, lineJoin: 'round' }} />
        <Mapbox.LineLayer id="oml-rider-trails-dots" style={{ lineColor: RIDER_TRAIL_INK, lineWidth: 4, lineCap: 'round', lineDasharray: [0.25, 2] }} />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-park-trails" shape={parkLines}>
        <Mapbox.LineLayer id="oml-park-trails-case" style={{ lineColor: TRAIL_INK.casing, lineWidth: ['case', ['get', 'road'], 5.2, 7], lineJoin: 'round' }} />
        {/* Two layers, not a dash expression: Android's Mapbox doesn't take a data-driven dash. */}
        <Mapbox.LineLayer
          id="oml-park-trails-line"
          filter={['!', ['to-boolean', ['get', 'closed']]]}
          style={{ lineColor: ['get', 'color'], lineWidth: ['case', ['get', 'road'], 2.4, 4], lineJoin: 'round', lineCap: 'round' }}
        />
        <Mapbox.LineLayer
          id="oml-park-trails-closed"
          filter={['to-boolean', ['get', 'closed']]}
          style={{ lineColor: ['get', 'color'], lineWidth: ['case', ['get', 'road'], 2.4, 4], lineJoin: 'round', lineCap: 'butt', lineDasharray: CLOSED_DASH }}
        />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-park-names" shape={parkNames}>
        <Mapbox.SymbolLayer
          id="oml-park-names-text"
          style={{
            textField: ['get', 'name'], textSize: 12, textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            textColor: ['case', ['get', 'closed'], '#FF8A80', '#FFFFFF'], textHaloColor: 'rgba(10,22,38,0.92)', textHaloWidth: 1.6, textMaxWidth: 14,
          }}
        />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-park-titles" shape={parkTitles}>
        <Mapbox.SymbolLayer
          id="oml-park-titles-text"
          minZoomLevel={PARK_NAMES_MIN_Z}
          style={{
            textField: ['format', ['get', 'name'], { 'font-scale': 1 }, '\n', {}, ['get', 'sub'], { 'font-scale': 0.8 }],
            textSize: 14, textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'], textJustify: 'center', textMaxWidth: 12,
            textColor: '#FFFFFF', textHaloColor: 'rgba(10,22,38,0.95)', textHaloWidth: 2, textAllowOverlap: false,
          }}
        />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="oml-trail-names" shape={names}>
        <Mapbox.SymbolLayer
          id="oml-trail-names-text"
          maxZoomLevel={ownMax}
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
  // A pin without a real spot draws nothing rather than crash the map library.
  if (!isLatLng(at)) return null;
  if (draggable) {
    return (
      <Mapbox.PointAnnotation
        id={id ?? `drag-${at.lat}-${at.lng}`}
        coordinate={[at.lng, at.lat]}
        anchor={anchor}
        draggable
        onDragEnd={(e) => {
          const c = e.geometry.coordinates;
          const p = { lat: c[1], lng: c[0] };
          if (isLatLng(p)) onDragEnd?.(p);
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
