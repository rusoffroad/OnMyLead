import type { Map as MapboxMap_, Marker as MapboxMarker_ } from 'mapbox-gl';
import { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { junctionLines } from '@/core/intersections';
import { RIDER_TRAIL_INK } from '@/core/nav-trails';
import { parkPieces, parkSummaryLine, PARK_NAMES_MIN_Z } from '@/core/park-trails';
import {
  AGENCY_TILE_SIZE, cameraPadding, EMPTY_LINES, fitCorners, flatLook, linesGeoJSON, lookPitch, mapboxAgencyTemplate, mapboxStyleFor, metersPerPointAt,
  NATIVE_TRACKS_MIN_ZOOM, nativeTracks, OSM_SOURCE_ID, pointsGeoJSON,
  regionFromCamera, TERRAIN_IDS, TERRAIN_MAX_PITCH, TERRAIN_SOURCES, terrainExaggeration, terrainLayers, TOPO_LAYER_ID, TOPO_RASTER_SOURCE,
  TOPO_SOURCE_ID, trailZoomFromMapbox, type MapLook,
} from '@/core/terrain';
import { OSM_TILEJSON } from '@/core/osm-trails';
import { FEATURE_BY_ID, osmFeatureLayers, type AgencyLayer } from '@/core/map-features';
import { TRAIL_INK } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MAPBOX_TOKEN } from '@/lib/terrain';
import type { MapFill, MapIdle, MapLine, MapboxMapHandle, MapboxOwnFix } from './mapbox-map-types';
import { OwnPuck, useOwnPuckStore } from './own-puck';

export type { MapFill, MapIdle, MapLine, MapboxMapHandle, MapboxOwnFix } from './mapbox-map-types';

const RIDE_ZOOM = 13.5;
const FAR_OUT_ZOOM = 8;
const MapCtx = createContext<MapboxMap_ | null>(null);

type GL = typeof import('mapbox-gl');
let glLoad: Promise<GL> | null = null;
/** mapbox-gl is big, so the website loads it only when a map opens. */
function loadGl(): Promise<GL> {
  glLoad ??= import('@/lib/mapbox-web').then((m) => m.default);
  return glLoad;
}

const OPEN_DASH = [9 / 3.2, 5 / 3.2];
const CLOSED_DASH = [5 / 3.2, 5 / 3.2];
const HIKE = FEATURE_BY_ID.hiking.ink;
const HIKE_DASH = (HIKE.dash ?? []).map((d) => Math.max(0.1, d / HIKE.width));
const OSM_LAYERS = osmFeatureLayers();
/** An empty layer marking where the agency squares go: below OpenStreetMap lines (added after it). */
const AGENCY_ANCHOR = 'oml-agency-anchor';

/** Everything the app adds to a Mapbox style for a look, in drawing order (added again after each style change). */
function addLayers(m: MapboxMap_, look: MapLook) {
  if (look === 'terrain') {
    for (const [id, src] of Object.entries(TERRAIN_SOURCES)) m.addSource(id, src as never);
    m.setTerrain({ source: TERRAIN_IDS.dem, exaggeration: terrainExaggeration(m.getPitch()) });
    m.setFog({ color: '#9DB8D6', 'high-color': '#24466F', 'horizon-blend': 0.08, 'space-color': Colors.background, 'star-intensity': 0 } as never);
    for (const l of terrainLayers()) m.addLayer(l as never);
  }
  if (look === 'topo') {
    m.addSource(TOPO_SOURCE_ID, TOPO_RASTER_SOURCE as never);
    m.addLayer({ id: TOPO_LAYER_ID, type: 'raster', source: TOPO_SOURCE_ID });
  }
  // The agencies' trail and land squares go in under this marker as the Map Features change (see syncAgency).
  m.addSource(AGENCY_ANCHOR, { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: AGENCY_ANCHOR, type: 'line', source: AGENCY_ANCHOR, paint: { 'line-opacity': 0 } });
  // OpenStreetMap roads, tracks and paths drawn by Mapbox from the vector squares (core/map-features).
  m.addSource(OSM_SOURCE_ID, { type: 'vector', url: OSM_TILEJSON });
  for (const l of OSM_LAYERS) {
    m.addLayer({
      id: l.id, type: l.type, source: OSM_SOURCE_ID, 'source-layer': l.sourceLayer, minzoom: l.minzoom, filter: l.filter as never,
      layout: { ...l.layout, visibility: 'none' } as never, paint: l.paint as never,
    });
  }
  m.addSource('oml-tracks', { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: 'oml-tracks-hike', type: 'line', source: 'oml-tracks', filter: ['==', ['get', 'path'], true], paint: { 'line-color': HIKE.color, 'line-width': HIKE.width, 'line-dasharray': HIKE_DASH } });
  m.addLayer({ id: 'oml-tracks-case', type: 'line', source: 'oml-tracks', filter: ['!=', ['get', 'path'], true], layout: { 'line-join': 'round' }, paint: { 'line-color': TRAIL_INK.casing, 'line-width': 6.5 } });
  m.addLayer({ id: 'oml-tracks-open', type: 'line', source: 'oml-tracks', filter: ['all', ['!=', ['get', 'closed'], true], ['!=', ['get', 'path'], true]], paint: { 'line-color': TRAIL_INK.trail, 'line-width': 3.2, 'line-dasharray': OPEN_DASH } });
  m.addLayer({ id: 'oml-tracks-closed', type: 'line', source: 'oml-tracks', filter: ['all', ['==', ['get', 'closed'], true], ['!=', ['get', 'path'], true]], paint: { 'line-color': TRAIL_INK.closed, 'line-width': 3.2, 'line-dasharray': CLOSED_DASH } });
  m.addSource('oml-closures', { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: 'oml-closures-case', type: 'line', source: 'oml-closures', layout: { 'line-join': 'round' }, paint: { 'line-color': TRAIL_INK.casing, 'line-width': 6.5 } });
  m.addLayer({ id: 'oml-closures-line', type: 'line', source: 'oml-closures', paint: { 'line-color': TRAIL_INK.closed, 'line-width': 3.2, 'line-dasharray': CLOSED_DASH } });
  m.addSource('oml-rider-trails', { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: 'oml-rider-trails-case', type: 'line', source: 'oml-rider-trails', layout: { 'line-join': 'round' }, paint: { 'line-color': TRAIL_INK.casing, 'line-width': 7 } });
  m.addLayer({ id: 'oml-rider-trails-dots', type: 'line', source: 'oml-rider-trails', layout: { 'line-cap': 'round' }, paint: { 'line-color': RIDER_TRAIL_INK, 'line-width': 4, 'line-dasharray': [0.25, 2] } });
  m.addSource('oml-park-trails', { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: 'oml-park-trails-case', type: 'line', source: 'oml-park-trails', layout: { 'line-join': 'round' }, paint: { 'line-color': TRAIL_INK.casing, 'line-width': ['case', ['get', 'road'], 5.2, 7] } });
  m.addLayer({
    id: 'oml-park-trails-line', type: 'line', source: 'oml-park-trails', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'road'], 2.4, 4], 'line-dasharray': ['case', ['get', 'closed'], ['literal', CLOSED_DASH], ['literal', [1, 0]]] },
  });
  m.addSource('oml-park-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({
    id: 'oml-park-names', type: 'symbol', source: 'oml-park-names',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-max-width': 14 },
    paint: { 'text-color': ['case', ['get', 'closed'], '#FF8A80', '#FFFFFF'], 'text-halo-color': 'rgba(10,22,38,0.92)', 'text-halo-width': 1.6 },
  });
  m.addSource('oml-park-titles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({
    id: 'oml-park-titles', type: 'symbol', source: 'oml-park-titles', minzoom: PARK_NAMES_MIN_Z,
    layout: { 'text-field': ['format', ['get', 'name'], { 'font-scale': 1 }, '\n', {}, ['get', 'sub'], { 'font-scale': 0.8 }], 'text-size': 14, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-justify': 'center', 'text-max-width': 12 },
    paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(10,22,38,0.95)', 'text-halo-width': 2 },
  });
  m.addSource('oml-trail-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({
    id: 'oml-trail-names', type: 'symbol', source: 'oml-trail-names',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-max-width': 14 },
    paint: { 'text-color': ['case', ['get', 'closed'], '#FF8A80', '#FFFFFF'], 'text-halo-color': 'rgba(10,22,38,0.92)', 'text-halo-width': 1.6 },
  });
}

/** The app's own track lines and names: drawn only out to where Mapbox draws the tracks itself. */
const OWN_TRACK_IDS = ['oml-tracks-hike', 'oml-tracks-case', 'oml-tracks-open', 'oml-tracks-closed', 'oml-trail-names'];
const TRAIL_LAYER_IDS = [...OWN_TRACK_IDS, 'oml-closures-case', 'oml-closures-line'];

/**
 * Puts the agency trail and land squares for the Map Features that are on onto the map, under
 * the app's own lines, and takes off the ones no longer wanted. Each layer's id carries its key,
 * so changing the choices makes a fresh layer rather than reusing squares drawn for other ones.
 */
function syncAgency(m: MapboxMap_, want: AgencyLayer[], offline: boolean) {
  const keep = new Set(offline ? [] : want.map((a) => `oml-agency-${a.key}`));
  const style = m.getStyle();
  for (const l of style?.layers ?? []) {
    if (l.id.startsWith('oml-agency-') && !keep.has(l.id)) {
      m.removeLayer(l.id);
      if (m.getSource(l.id)) m.removeSource(l.id);
    }
  }
  if (offline) return;
  for (const a of want) {
    const id = `oml-agency-${a.key}`;
    if (m.getLayer(id)) continue;
    m.addSource(id, { type: 'raster', tiles: [mapboxAgencyTemplate(a.template)], tileSize: AGENCY_TILE_SIZE, minzoom: a.minZ - 1 });
    // Land first, under the trails; everything under the OpenStreetMap lines and the app's own.
    const before = a.land ? want.find((b) => !b.land && m.getLayer(`oml-agency-${b.key}`)) : undefined;
    m.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0 } }, before ? `oml-agency-${before.key}` : AGENCY_ANCHOR);
  }
}

/**
 * The Mapbox map on the website (mapbox-gl), the same picture and the same props as the apps'
 * (mapbox-map.tsx). Drag pans, scroll zooms; in 3D Terrain, right-drag or Ctrl-drag (two fingers on a
 * touch screen) turns and tilts, and the further it tilts the more the terrain is raised.
 */
export function MapboxMap({
  trail, look, tilt, rotate = true, compass = true, scaleBar = false, interactive = true, initial, lines, fills, onPress, onLongPress, onUserMove, onReady, onCamera,
  onOwnFix, onIdle, children, ref,
}: {
  trail: TrailMap;
  look?: MapLook;
  tilt?: boolean;
  rotate?: boolean;
  compass?: boolean;
  scaleBar?: boolean;
  /** Off: a still map that ignores the mouse (no pan, zoom, tilt or clicks). */
  interactive?: boolean;
  initial?: { center: LatLng; zoom?: number } | null;
  lines?: MapLine[];
  fills?: MapFill[];
  onPress?: (p: LatLng) => void;
  onLongPress?: (p: LatLng) => void;
  onUserMove?: () => void;
  onReady?: () => void;
  onCamera?: (c: { heading: number }) => void;
  onOwnFix?: (f: MapboxOwnFix) => void;
  onIdle?: (c: MapIdle) => void;
  children?: ReactNode;
  ref?: Ref<MapboxMapHandle>;
}) {
  // A map told to stay flat shows 3D Terrain as plain satellite.
  const shown: MapLook = look ?? (tilt === false ? flatLook(trail.look) : trail.look);
  const tilts = tilt ?? shown === 'terrain';
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapboxMap_ | null>(null);
  // Counts style loads: the app's layers and lines are added again after each one.
  const [styled, setStyled] = useState(0);
  const lookRef = useRef(shown);
  const own = useOwnPuckStore();
  const cb = useRef({ onPress, onLongPress, onUserMove, onReady, onCamera, onOwnFix, onIdle, trail });
  useEffect(() => {
    cb.current = { onPress, onLongPress, onUserMove, onReady, onCamera, onOwnFix, onIdle, trail };
  });

  useEffect(() => {
    let gone = false;
    let made: MapboxMap_ | null = null;
    loadGl().then((gl) => {
      if (gone || !el.current) return;
      gl.accessToken = MAPBOX_TOKEN;
      const m = new gl.Map({
        container: el.current,
        style: mapboxStyleFor(lookRef.current),
        center: initial ? [initial.center.lng, initial.center.lat] : [-105.8, 39.5],
        zoom: initial?.zoom ?? (initial ? RIDE_ZOOM : 4),
        pitch: lookPitch(lookRef.current),
        maxPitch: TERRAIN_MAX_PITCH,
        attributionControl: true,
        interactive,
      });
      made = m;
      // Bottom left: the top right holds the app's own layers button.
      if (compass) m.addControl(new gl.NavigationControl({ visualizePitch: true }), 'bottom-left');
      if (scaleBar) m.addControl(new gl.ScaleControl({ unit: 'imperial' }), 'bottom-right');
      let first = true;
      m.on('style.load', () => {
        addLayers(m, lookRef.current);
        setStyled((n) => n + 1);
        if (first) {
          first = false;
          cb.current.onReady?.();
        }
      });
      type Ev = { lngLat: { lat: number; lng: number } };
      const at = (e: Ev) => ({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      m.on('click', (e: Ev) => (cb.current.onPress ? cb.current.onPress(at(e)) : cb.current.trail.identifyAt(e.lngLat.lat, e.lngLat.lng)));
      m.on('contextmenu', (e: Ev) => (cb.current.onLongPress ? cb.current.onLongPress(at(e)) : cb.current.trail.identifyAt(e.lngLat.lat, e.lngLat.lng)));
      const userMove = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) cb.current.onUserMove?.();
      };
      m.on('dragstart', userMove);
      m.on('zoomstart', userMove);
      m.on('rotatestart', userMove);
      m.on('pitchstart', userMove);
      // Tilting further raises the terrain (only while 3D Terrain is on the map).
      let exaggeration = 0;
      m.on('pitch', () => {
        if (!m.getTerrain()) return;
        const ex = terrainExaggeration(m.getPitch());
        if (ex === exaggeration) return;
        exaggeration = ex;
        m.setTerrain({ source: TERRAIN_IDS.dem, exaggeration: ex });
      });
      let heading = 0;
      m.on('rotate', () => {
        const h = Math.round(((m.getBearing() + 360) % 360) / 5) * 5 % 360;
        if (h !== heading) {
          heading = h;
          own.setHeading(h);
          cb.current.onCamera?.({ heading: h });
        }
      });
      const report = () => {
        const c = m.getCenter();
        const { clientWidth: width, clientHeight: height } = m.getContainer();
        const b = m.getBounds();
        cb.current.trail.onRegion(regionFromCamera({ lat: c.lat, lng: c.lng }, m.getZoom(), { width, height }), trailZoomFromMapbox(m.getZoom()));
        cb.current.onIdle?.({
          center: { lat: c.lat, lng: c.lng },
          zoom: m.getZoom(),
          bounds: { minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() },
          metersPerPoint: metersPerPointAt(c.lat, m.getZoom()),
        });
      };
      m.on('moveend', report);
      m.once('load', report);
      // The browser's own location, for Follow Me (the website has no other way to know it).
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const watch = navigator.geolocation.watchPosition(
          (p) => {
            const f = { lat: p.coords.latitude, lng: p.coords.longitude, course: p.coords.heading, speed: p.coords.speed };
            own.setFix(f);
            cb.current.onOwnFix?.(f);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000 },
        );
        m.once('remove', () => navigator.geolocation.clearWatch(watch));
      }
      setMap(m);
    }).catch(() => {});
    return () => {
      gone = true;
      made?.remove();
    };
    // The map is made once; later changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new look: a new Mapbox style (its 'style.load' adds the app's layers back), tilted or flat.
  useEffect(() => {
    if (!map) return;
    if (lookRef.current !== shown) {
      lookRef.current = shown;
      map.setStyle(mapboxStyleFor(shown));
      map.easeTo({ pitch: lookPitch(shown), duration: 600 });
    }
    if (tilts && interactive) {
      map.setMaxPitch(TERRAIN_MAX_PITCH);
      map.touchPitch.enable();
    } else {
      map.easeTo({ pitch: 0, duration: 300 });
      map.touchPitch.disable();
      map.setMaxPitch(0);
    }
    if (rotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
  }, [map, shown, tilts, rotate, interactive]);

  useImperativeHandle(ref, () => ({
    centerOn(p, inset, opts) {
      if (!map) return;
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      const pad = cameraPadding(inset ?? { top: 0, right: 0, bottom: 0, left: 0 }, { width, height });
      map.easeTo({
        center: [p.lng, p.lat],
        padding: { top: pad.paddingTop, right: pad.paddingRight, bottom: pad.paddingBottom, left: pad.paddingLeft },
        ...(map.getZoom() < FAR_OUT_ZOOM || opts?.zoom != null ? { zoom: opts?.zoom ?? RIDE_ZOOM } : {}),
        duration: opts?.animated === false ? 0 : opts?.duration ?? 450,
      });
    },
    fit(points, inset, animated = true) {
      const c = fitCorners(points);
      if (!c || !map) return;
      map.fitBounds([c[1], c[0]], { padding: inset, duration: animated ? 600 : 0, pitch: map.getPitch() });
    },
    zoomBy(levels) {
      map?.zoomTo(Math.max(1, Math.min(22, map.getZoom() + levels)), { duration: 250 });
    },
    async pointAt(x, y) {
      if (!map) return null;
      const p = map.unproject([x, y]);
      return { lat: p.lat, lng: p.lng };
    },
    isFarOut: () => (map ? map.getZoom() < FAR_OUT_ZOOM : true),
    async project(p) {
      if (!map) return null;
      const pt = map.project([p.lng, p.lat]);
      return { x: pt.x, y: pt.y };
    },
    camera: () => {
      if (!map) return { zoom: 4, heading: 0, width: 390, height: 800 };
      const c = map.getContainer();
      return { zoom: map.getZoom(), heading: map.getBearing(), width: c.clientWidth, height: c.clientHeight };
    },
    zoomTo(z, duration = 700) {
      map?.easeTo({ zoom: z, duration });
    },
    async roadsNear(p, radiusPt) {
      if (!map) return [];
      const pt = map.project([p.lng, p.lat]);
      try {
        const fs = map.queryRenderedFeatures([[pt.x - radiusPt, pt.y - radiusPt], [pt.x + radiusPt, pt.y + radiusPt]]);
        return junctionLines(fs as never);
      } catch {
        return [];
      }
    },
  }), [map]);

  // Trail layers follow the rider's choices, like the flat maps.
  const { trails, offline, osmLines, closedLines, labels, riderTrails, features, agencyLayers, parkTrails, parkLabels, parks } = trail;
  useEffect(() => {
    if (!map || !styled) return;
    syncAgency(map, agencyLayers, offline);
    for (const id of TRAIL_LAYER_IDS) {
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, 'visibility', trails ? 'visible' : 'none');
    }
    for (const l of OSM_LAYERS) if (map.getLayer(l.id)) map.setLayoutProperty(l.id, 'visibility', !offline && features[l.feature] ? 'visible' : 'none');
    const native = nativeTracks(trails, offline);
    for (const id of OWN_TRACK_IDS) if (map.getLayer(id)) map.setLayerZoomRange(id, 0, native ? NATIVE_TRACKS_MIN_ZOOM : 24);
    const src = (id: string) => map.getSource(id) as { setData?: (d: unknown) => void } | undefined;
    src('oml-tracks')?.setData?.(linesGeoJSON(osmLines.flatMap((t) => t.parts.map((points, i) => ({ key: `${t.key}-${i}`, points, props: { closed: t.closed } })))));
    src('oml-closures')?.setData?.(linesGeoJSON(closedLines.flatMap((l) => l.parts.map((points, i) => ({ key: `c-${l.key}-${i}`, points, props: { closed: true } })))));
    src('oml-trail-names')?.setData?.(pointsGeoJSON(labels.map((l) => ({ key: l.key, at: l.at, props: { name: l.closed ? `${l.name} · Closed` : l.name, closed: l.closed } }))));
    src('oml-rider-trails')?.setData?.(linesGeoJSON(riderTrails.map((t) => ({ key: t.id, points: t.points }))));
    src('oml-park-trails')?.setData?.(linesGeoJSON(parkPieces(parkTrails).map((p) => ({ key: p.key, points: p.points, props: { color: p.color, closed: p.closed, road: p.road } }))));
    src('oml-park-names')?.setData?.(pointsGeoJSON(parkLabels.map((l) => ({ key: `pl-${l.key}`, at: l.at, props: { name: l.closed ? `${l.name} · Closed` : l.name, closed: l.closed } }))));
    src('oml-park-titles')?.setData?.(pointsGeoJSON(parks.map((p) => ({ key: `park-${p.parkOsmId}`, at: p.center, props: { name: p.parkName, sub: parkSummaryLine(p) } }))));
  }, [map, styled, trails, offline, osmLines, closedLines, labels, riderTrails, features, agencyLayers, parkTrails, parkLabels, parks]);

  // The screen's own fills and lines, redrawn when they change (and after a style change wiped them).
  const drawn = useRef<string[]>([]);
  useEffect(() => {
    if (!map || !styled) return;
    for (const id of drawn.current) {
      for (const suffix of ['-case', '-ink', '-fill', '-line']) if (map.getLayer(`${id}${suffix}`)) map.removeLayer(`${id}${suffix}`);
      if (map.getSource(id)) map.removeSource(id);
    }
    drawn.current = [];
    for (const f of fills ?? []) {
      const id = `oml-fill-${f.id}`;
      map.addSource(id, { type: 'geojson', data: f.polygon });
      map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': f.color, 'fill-opacity': f.opacity } });
      map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': f.stroke, 'line-width': f.strokeWidth } });
      drawn.current.push(id);
    }
    for (const l of lines ?? []) {
      const id = `oml-line-${l.id}`;
      const pieces = Array.isArray(l.points[0]) ? (l.points as LatLng[][]) : [l.points as LatLng[]];
      map.addSource(id, { type: 'geojson', data: linesGeoJSON(pieces.map((points, i) => ({ key: `${l.id}-${i}`, points }))) });
      if (l.casing) {
        map.addLayer({ id: `${id}-case`, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': l.casing, 'line-width': l.casingWidth ?? l.width + 4 } });
      }
      map.addLayer({
        id: `${id}-ink`, type: 'line', source: id,
        layout: { 'line-cap': l.dash ? 'butt' : 'round', 'line-join': 'round' },
        paint: { 'line-color': l.color, 'line-width': l.width, ...(l.dash ? { 'line-dasharray': l.dash.map((d) => d / l.width) } : {}) },
      });
      drawn.current.push(id);
    }
  }, [map, styled, lines, fills]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Mapbox's zoom, compass and tilt buttons sit above Full Map's bar in the bottom-left corner. */}
      <style>{'.oml-mapbox .mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-group{margin-bottom:96px}'}</style>
      <div ref={el} className="oml-mapbox" style={{ position: 'absolute', inset: 0, zIndex: 0, background: Colors.background }} />
      <MapCtx.Provider value={map}>
        {children}
        {/* Your own dot, with its arrow built in (own-puck). */}
        <OwnPuck store={own} Marker={MapboxMarker} />
      </MapCtx.Provider>
    </View>
  );
}

/**
 * A pin on the website's map: any view, drawn by React into a Mapbox marker. Clicks on it stay on
 * it (the map doesn't also hear them); a draggable pin reports where it was dropped.
 */
export function MapboxMarker({
  at, anchor = { x: 0.5, y: 0.5 }, draggable, onDragEnd, children,
}: { id?: string; at: LatLng; anchor?: { x: number; y: number }; draggable?: boolean; onDragEnd?: (p: LatLng) => void; children: ReactNode }) {
  const map = useContext(MapCtx);
  const holder = useMemo(() => (typeof document === 'undefined' ? null : document.createElement('div')), []);
  const marker = useRef<MapboxMarker_ | null>(null);
  const drop = useRef(onDragEnd);
  useEffect(() => {
    drop.current = onDragEnd;
  }, [onDragEnd]);
  useEffect(() => {
    if (!map || !holder) return;
    let gone = false;
    loadGl().then((gl) => {
      if (gone) return;
      holder.style.transform = '';
      const mk = new gl.Marker({ element: holder, anchor: 'top-left', offset: [0, 0], draggable: !!draggable }).setLngLat([at.lng, at.lat]).addTo(map);
      mk.on('dragend', () => {
        const p = mk.getLngLat();
        drop.current?.({ lat: p.lat, lng: p.lng });
      });
      marker.current = mk;
    });
    return () => {
      gone = true;
      marker.current?.remove();
      marker.current = null;
    };
    // Made once per map; the position is moved below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, holder, draggable]);
  useEffect(() => {
    marker.current?.setLngLat([at.lng, at.lat]);
  }, [at.lat, at.lng]);
  if (!holder) return null;
  return createPortal(
    <div
      style={{ transform: `translate(${-anchor.x * 100}%, ${-anchor.y * 100}%)`, cursor: draggable ? 'grab' : undefined }}
      onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    holder,
  );
}

export const TerrainMap = MapboxMap;
export const TerrainMarker = MapboxMarker;
