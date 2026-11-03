import L from 'leaflet';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { followCamShouldMove } from '@/core/follow-camera';
import type { LatLng } from '@/core/geo';
import { OBSTACLE_INK, type Obstacle } from '@/core/obstacles';
import type { DayLine } from '@/core/track-line';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import type { TrailMap } from '@/hooks/use-trail-map';
import { drawRoute, esc, frame, ll, reportRegion, satelliteMap, trailLayers } from '@/lib/web-map';

export type NavMapHandle = { centerOn: (p: LatLng) => void; fit: (points: LatLng[]) => void };

export const RECORD_INK = '#F6F1E3';
const MEASURE_INK = '#ECCD91';
/** The rider's dot with the white wedge every moving rider gets, turned to their heading. */
const meDotHtml = (heading: number | null | undefined) =>
  heading == null
    ? ME_DOT
    : `<div style="position:relative;width:18px;height:18px">${ME_DOT}<div aria-hidden="true" style="position:absolute;left:-13px;top:-13px;width:44px;height:44px;transform:rotate(${Math.round(heading)}deg);pointer-events:none"><div style="position:absolute;left:12px;top:0;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:14px solid rgba(10,22,38,.85)"></div><div style="position:absolute;left:14.5px;top:3px;width:0;height:0;border-left:7.5px solid transparent;border-right:7.5px solid transparent;border-bottom:10.5px solid #fff"></div></div></div>`;
const ME_DOT = '<div role="img" aria-label="You are here" style="width:18px;height:18px;border-radius:9px;background:#2F80FF;border:3px solid #FFFFFF;box-sizing:border-box;box-shadow:0 0 0 6px rgba(47,128,255,.25),0 2px 4px rgba(0,0,0,.5)"></div>';

/**
 * Map Mode's map on the website: the phone's layers on Leaflet (satellite or topo, agency,
 * OpenStreetMap and rider trails), a followed trail in route red, a recorded line, and the distance
 * finder. A click measures while measuring; otherwise it shows the trail under it.
 */
export function NavMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, followMe, onUserMove, meHeading, trackLines, obstacles, onObstacle, ref,
}: {
  trail: TrailMap;
  recorded: LatLng[];
  following: LatLng[] | null;
  measure: LatLng[];
  measureTaps: LatLng[];
  measuring: boolean;
  onMeasure: (p: LatLng, snapM: number) => void;
  center: LatLng | null;
  found?: Place | null;
  onCenter?: (c: LatLng) => void;
  padding?: [number, number, number, number];
  /** Follow-me camera: while set, the map keeps this spot in the open map between the panels. */
  followMe?: LatLng | null;
  /** The rider dragged the map by hand. */
  onUserMove?: () => void;
  /** Which way the rider is moving (core/heading riderHeading), for the arrow on their dot. */
  meHeading?: number | null;
  /** Track Line: where the rider has been, one colour per day, oldest first. */
  trackLines?: DayLine[];
  /** Named spots on the trail being drawn, recorded or followed. */
  obstacles?: Obstacle[];
  onObstacle?: (o: Obstacle) => void;
  ref?: Ref<NavMapHandle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tracks = useRef<ReturnType<typeof trailLayers> | null>(null);
  const centered = useRef(false);
  const followed = useRef<LatLng | null>(null);
  const meDot = useRef<L.Marker | null>(null);
  const cb = useRef({ measuring, onMeasure, identifyAt: trail.identifyAt, onRegion: trail.onRegion, onCenter, onUserMove, onObstacle });
  useEffect(() => {
    cb.current = { measuring, onMeasure, identifyAt: trail.identifyAt, onRegion: trail.onRegion, onCenter, onUserMove, onObstacle };
  }, [measuring, onMeasure, trail.identifyAt, trail.onRegion, onCenter, onUserMove, onObstacle]);
  const pad = padding ?? [120, 40, 320, 40];
  const fitPadding = { paddingTopLeft: [pad[3], pad[0]] as L.PointTuple, paddingBottomRight: [pad[1], pad[2]] as L.PointTuple };
  const snapM = (m: L.Map) => snapRadiusM((156_543.03 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** m.getZoom());

  useImperativeHandle(ref, () => ({
    centerOn(p) {
      followed.current = p;
      map.current?.setView(ll(p), Math.max(map.current.getZoom(), 14), { animate: true });
    },
    fit(points) {
      if (points.length >= 2) map.current?.fitBounds(L.latLngBounds(points.map(ll)), { ...fitPadding, maxZoom: 16 });
    },
  }));

  useEffect(() => {
    const m = satelliteMap(el.current!, { doubleClickZoom: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    tracks.current = trailLayers(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.measuring) cb.current.onMeasure({ lat: e.latlng.lat, lng: e.latlng.lng }, snapM(m));
      else cb.current.identifyAt(e.latlng.lat, e.latlng.lng);
    });
    const report = () => {
      const c = m.getCenter();
      cb.current.onCenter?.({ lat: c.lat, lng: c.lng });
      reportRegion(m, cb.current.onRegion);
    };
    m.on('moveend', report);
    m.on('dragstart', () => cb.current.onUserMove?.());
    frame(m, [], center);
    map.current = m;
    report();
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is created once; later changes redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!center || centered.current || !map.current) return;
    centered.current = true;
    map.current.setView(ll(center), 13);
  }, [center]);

  // The rider's own spot (the phone maps draw it themselves).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!center) {
      meDot.current?.remove();
      meDot.current = null;
      return;
    }
    const icon = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: meDotHtml(meHeading) });
    if (meDot.current) {
      meDot.current.setLatLng(ll(center));
      meDot.current.setIcon(icon);
    } else {
      meDot.current = L.marker(ll(center), { interactive: false, keyboard: false, zIndexOffset: 1000, icon }).addTo(m);
    }
  }, [center, meHeading]);

  // Follow-me camera: pan (same zoom) so the spot sits in the open map between the panels.
  useEffect(() => {
    const m = map.current;
    if (!followMe) {
      followed.current = null;
      return;
    }
    if (!m || !followCamShouldMove(followed.current, followMe)) return;
    followed.current = followMe;
    const z = m.getZoom();
    const p = m.project(ll(followMe), z).add([(pad[1] - pad[3]) / 2, (pad[2] - pad[0]) / 2]);
    m.panTo(m.unproject(p, z), { animate: true, duration: 0.6 });
    // Only when the followed spot moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followMe]);

  useEffect(() => {
    el.current?.classList.toggle('oml-draw', measuring);
  }, [measuring]);

  const riderLines = useMemo(() => trail.riderTrails.map((t) => t.points), [trail.riderTrails]);
  const { base, trails, osmLines, closedLines, labels } = trail;
  useEffect(() => {
    tracks.current?.update({ base, trails, osmLines, closedLines, labels, riderLines });
  }, [base, trails, osmLines, closedLines, labels, riderLines]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const d of trackLines ?? []) {
      for (const piece of d.pieces) L.polyline(piece.map(ll), { color: d.color, weight: 4, opacity: 0.95, interactive: false }).addTo(g);
    }
    if (following && following.length > 1) drawRoute(g, following, true);
    if (recorded.length > 1) {
      L.polyline(recorded.map(ll), { color: Colors.background, weight: 8, interactive: false }).addTo(g);
      L.polyline(recorded.map(ll), { color: RECORD_INK, weight: 4.5, interactive: false }).addTo(g);
    }
    if (measure.length > 1) {
      L.polyline(measure.map(ll), { color: Colors.background, weight: 7, interactive: false }).addTo(g);
      L.polyline(measure.map(ll), { color: MEASURE_INK, weight: 3.5, dashArray: '8 5', interactive: false }).addTo(g);
    }
    measureTaps.forEach((p, i) => {
      L.marker(ll(p), {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: `<div class="oml-tap">${i + 1}</div>` }),
      }).addTo(g);
    });
    for (const o of obstacles ?? []) {
      const pin = L.marker(ll(o), {
        keyboard: true,
        title: o.name,
        icon: L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div class="oml-found" style="pointer-events:auto;cursor:pointer"><span style="background:rgba(10,22,38,.92);color:#F1F4F8;border:1.5px solid ${OBSTACLE_INK[o.kind]}">${esc(o.name)}</span></div>`,
        }),
      }).addTo(g);
      pin.on('click', () => cb.current.onObstacle?.(o));
    }
    if (found) {
      L.marker(ll(found), {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="oml-found"><span>${esc(found.name)}</span></div>` }),
      }).addTo(g);
    }
  }, [following, recorded, measure, measureTaps, found, trackLines, obstacles]);

  useEffect(() => {
    if (!found || !map.current) return;
    const b = found.bounds;
    const area: L.LatLngBoundsExpression = b ? [[b.south, b.west], [b.north, b.east]] : [ll(found), ll(found)];
    map.current.flyToBounds(area, { ...fitPadding, maxZoom: b ? 16 : 15, duration: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <div ref={el} className="omlmap oml-full" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
    </View>
  );
}
