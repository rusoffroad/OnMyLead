import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { RIDER_TRAIL_INK } from '@/core/nav-trails';
import {
  cameraPadding, EMPTY_LINES, fitCorners, linesGeoJSON, metersPerPointAt, mapboxTileTemplate, pointsGeoJSON, regionFromCamera, TERRAIN_EXAGGERATION,
  TERRAIN_IDS, TERRAIN_MAX_PITCH, TERRAIN_PITCH, TERRAIN_SOURCES, TERRAIN_STYLE_URL, terrainLayers, trailZoomFromMapbox,
} from '@/core/terrain';
import { TRAIL_INK, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MAPBOX_TOKEN } from '@/lib/terrain';
import type { TerrainLine, TerrainMapHandle, TerrainOwnFix } from './terrain-map-types';

export type { TerrainLine, TerrainMapHandle, TerrainOwnFix } from './terrain-map-types';

const RIDE_ZOOM = 13.5;
const FAR_OUT_ZOOM = 8;
const MapCtx = createContext<MapboxMap | null>(null);

type GL = typeof import('mapbox-gl');
let glLoad: Promise<GL> | null = null;
/** mapbox-gl is big, so the website loads it only when someone opens 3D Terrain. */
function loadGl(): Promise<GL> {
  glLoad ??= import('@/lib/mapbox-web').then((m) => m.default);
  return glLoad;
}

const OPEN_DASH = [9 / 3.2, 5 / 3.2];
const CLOSED_DASH = [5 / 3.2, 5 / 3.2];

/** Everything the app adds to Mapbox's satellite style, in drawing order. */
function addLayers(m: MapboxMap) {
  for (const [id, src] of Object.entries(TERRAIN_SOURCES)) m.addSource(id, src as never);
  m.setTerrain({ source: TERRAIN_IDS.dem, exaggeration: TERRAIN_EXAGGERATION });
  m.setFog({ color: '#9DB8D6', 'high-color': '#24466F', 'horizon-blend': 0.08, 'space-color': Colors.background, 'star-intensity': 0 } as never);
  for (const l of terrainLayers()) m.addLayer(l as never);
  for (const id of TRAIL_SOURCE_IDS) {
    m.addSource(`oml-agency-${id}`, { type: 'raster', tiles: [mapboxTileTemplate(trailTileTemplate(TRAIL_SOURCES[id]))], tileSize: 256, minzoom: TRAILS_MIN_Z - 1 });
    m.addLayer({ id: `oml-agency-${id}`, type: 'raster', source: `oml-agency-${id}` });
  }
  m.addSource('oml-tracks', { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: 'oml-tracks-case', type: 'line', source: 'oml-tracks', layout: { 'line-join': 'round' }, paint: { 'line-color': TRAIL_INK.casing, 'line-width': 6.5 } });
  m.addLayer({ id: 'oml-tracks-open', type: 'line', source: 'oml-tracks', filter: ['!=', ['get', 'closed'], true], paint: { 'line-color': TRAIL_INK.trail, 'line-width': 3.2, 'line-dasharray': OPEN_DASH } });
  m.addLayer({ id: 'oml-tracks-closed', type: 'line', source: 'oml-tracks', filter: ['==', ['get', 'closed'], true], paint: { 'line-color': TRAIL_INK.closed, 'line-width': 3.2, 'line-dasharray': CLOSED_DASH } });
  m.addSource('oml-rider-trails', { type: 'geojson', data: EMPTY_LINES });
  m.addLayer({ id: 'oml-rider-trails-case', type: 'line', source: 'oml-rider-trails', layout: { 'line-join': 'round' }, paint: { 'line-color': TRAIL_INK.casing, 'line-width': 7 } });
  m.addLayer({ id: 'oml-rider-trails-dots', type: 'line', source: 'oml-rider-trails', layout: { 'line-cap': 'round' }, paint: { 'line-color': RIDER_TRAIL_INK, 'line-width': 4, 'line-dasharray': [0.25, 2] } });
  m.addSource('oml-trail-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({
    id: 'oml-trail-names', type: 'symbol', source: 'oml-trail-names',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-max-width': 14 },
    paint: { 'text-color': ['case', ['get', 'closed'], '#FF8A80', '#FFFFFF'], 'text-halo-color': 'rgba(10,22,38,0.92)', 'text-halo-width': 1.6 },
  });
}

const TRAIL_LAYER_IDS = ['oml-tracks-case', 'oml-tracks-open', 'oml-tracks-closed', 'oml-trail-names', ...TRAIL_SOURCE_IDS.map((id) => `oml-agency-${id}`)];

/**
 * The 3D Terrain map on the website (mapbox-gl), the same picture and the same props as the
 * apps' (terrain-map.tsx). Drag pans, right-drag or Ctrl-drag turns and tilts, scroll zooms.
 */
export function TerrainMap({
  trail, initial, lines, onPress, onLongPress, onUserMove, onReady, onCamera, onOwnFix, onIdle, children, ref,
}: {
  trail: TrailMap;
  initial?: { center: LatLng; zoom?: number } | null;
  lines?: TerrainLine[];
  onPress?: (p: LatLng) => void;
  onLongPress?: (p: LatLng) => void;
  onUserMove?: () => void;
  onReady?: () => void;
  onCamera?: (c: { heading: number }) => void;
  onOwnFix?: (f: TerrainOwnFix) => void;
  onIdle?: (c: { center: LatLng; metersPerPoint: number }) => void;
  children?: ReactNode;
  ref?: Ref<TerrainMapHandle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapboxMap | null>(null);
  const [styled, setStyled] = useState(false);
  const cb = useRef({ onPress, onLongPress, onUserMove, onReady, onCamera, onOwnFix, onIdle, trail });
  useEffect(() => {
    cb.current = { onPress, onLongPress, onUserMove, onReady, onCamera, onOwnFix, onIdle, trail };
  });

  useEffect(() => {
    let gone = false;
    let made: MapboxMap | null = null;
    loadGl().then((gl) => {
      if (gone || !el.current) return;
      gl.accessToken = MAPBOX_TOKEN;
      const m = new gl.Map({
        container: el.current,
        style: TERRAIN_STYLE_URL,
        center: initial ? [initial.center.lng, initial.center.lat] : [-105.8, 39.5],
        zoom: initial?.zoom ?? (initial ? RIDE_ZOOM : 4),
        pitch: TERRAIN_PITCH,
        maxPitch: TERRAIN_MAX_PITCH,
        attributionControl: true,
      });
      made = m;
      m.addControl(new gl.NavigationControl({ visualizePitch: true }), 'top-right');
      m.on('style.load', () => {
        addLayers(m);
        setStyled(true);
        cb.current.onReady?.();
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
      let heading = 0;
      m.on('rotate', () => {
        const h = Math.round(((m.getBearing() + 360) % 360) / 5) * 5 % 360;
        if (h !== heading) {
          heading = h;
          cb.current.onCamera?.({ heading: h });
        }
      });
      const report = () => {
        const c = m.getCenter();
        const { clientWidth: width, clientHeight: height } = m.getContainer();
        cb.current.trail.onRegion(regionFromCamera({ lat: c.lat, lng: c.lng }, m.getZoom(), { width, height }), trailZoomFromMapbox(m.getZoom()));
        cb.current.onIdle?.({ center: { lat: c.lat, lng: c.lng }, metersPerPoint: metersPerPointAt(c.lat, m.getZoom()) });
      };
      m.on('moveend', report);
      m.once('load', report);
      // The browser's own location, for Follow Me (the website has no other way to know it).
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const watch = navigator.geolocation.watchPosition(
          (p) => cb.current.onOwnFix?.({ lat: p.coords.latitude, lng: p.coords.longitude, course: p.coords.heading, speed: p.coords.speed }),
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
    isFarOut: () => (map ? map.getZoom() < FAR_OUT_ZOOM : true),
  }), [map]);

  // Trail layers follow the rider's choices, like the flat maps.
  const { trails, offline, osmLines, closedLines, labels, riderTrails } = trail;
  useEffect(() => {
    if (!map || !styled) return;
    for (const id of TRAIL_LAYER_IDS) {
      const agency = id.startsWith('oml-agency-');
      map.setLayoutProperty(id, 'visibility', trails && !(agency && offline) ? 'visible' : 'none');
    }
    const src = (id: string) => map.getSource(id) as { setData?: (d: unknown) => void } | undefined;
    src('oml-tracks')?.setData?.(linesGeoJSON([
      ...osmLines.flatMap((t) => t.parts.map((points, i) => ({ key: `${t.key}-${i}`, points, props: { closed: t.closed } }))),
      ...closedLines.flatMap((l) => l.parts.map((points, i) => ({ key: `c-${l.key}-${i}`, points, props: { closed: true } }))),
    ]));
    src('oml-trail-names')?.setData?.(pointsGeoJSON(labels.map((l) => ({ key: l.key, at: l.at, props: { name: l.closed ? `${l.name} · Closed` : l.name, closed: l.closed } }))));
    src('oml-rider-trails')?.setData?.(linesGeoJSON(riderTrails.map((t) => ({ key: t.id, points: t.points }))));
  }, [map, styled, trails, offline, osmLines, closedLines, labels, riderTrails]);

  // The screen's own lines, redrawn when they change.
  const drawn = useRef<string[]>([]);
  useEffect(() => {
    if (!map || !styled) return;
    for (const id of drawn.current) {
      if (map.getLayer(`${id}-case`)) map.removeLayer(`${id}-case`);
      if (map.getLayer(`${id}-ink`)) map.removeLayer(`${id}-ink`);
      if (map.getSource(id)) map.removeSource(id);
    }
    drawn.current = [];
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
  }, [map, styled, lines]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <div ref={el} style={{ position: 'absolute', inset: 0, zIndex: 0, background: Colors.background }} />
      <MapCtx.Provider value={map}>{children}</MapCtx.Provider>
    </View>
  );
}

/** A pin on the website's 3D map: any view, drawn by React into a Mapbox marker. */
export function TerrainMarker({
  at, anchor = { x: 0.5, y: 0.5 }, children,
}: { at: LatLng; anchor?: { x: number; y: number }; children: ReactNode }) {
  const map = useContext(MapCtx);
  const holder = useMemo(() => (typeof document === 'undefined' ? null : document.createElement('div')), []);
  const marker = useRef<MapboxMarker | null>(null);
  useEffect(() => {
    if (!map || !holder) return;
    let gone = false;
    loadGl().then((gl) => {
      if (gone) return;
      holder.style.transform = '';
      marker.current = new gl.Marker({ element: holder, anchor: 'top-left', offset: [0, 0] }).setLngLat([at.lng, at.lat]).addTo(map);
    });
    return () => {
      gone = true;
      marker.current?.remove();
      marker.current = null;
    };
    // Made once per map; the position is moved below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, holder]);
  useEffect(() => {
    marker.current?.setLngLat([at.lng, at.lat]);
  }, [at.lat, at.lng]);
  if (!holder) return null;
  return createPortal(
    <div style={{ transform: `translate(${-anchor.x * 100}%, ${-anchor.y * 100}%)` }}>{children}</div>,
    holder,
  );
}
