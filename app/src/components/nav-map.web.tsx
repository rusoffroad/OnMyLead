import L from 'leaflet';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import type { TrailMap } from '@/hooks/use-trail-map';
import { drawRoute, esc, frame, ll, reportRegion, satelliteMap, trailLayers } from '@/lib/web-map';

export type NavMapHandle = { centerOn: (p: LatLng) => void; fit: (points: LatLng[]) => void };

export const RECORD_INK = '#F6F1E3';
const MEASURE_INK = '#ECCD91';

/**
 * Navigation Mode's map on the website: the phone's layers on Leaflet (satellite or topo, agency,
 * OpenStreetMap and rider trails), a followed trail in route red, a recorded line, and the distance
 * finder. A click measures while measuring; otherwise it shows the trail under it.
 */
export function NavMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, ref,
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
  ref?: Ref<NavMapHandle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tracks = useRef<ReturnType<typeof trailLayers> | null>(null);
  const centered = useRef(false);
  const cb = useRef({ measuring, onMeasure, identifyAt: trail.identifyAt, onRegion: trail.onRegion, onCenter });
  useEffect(() => {
    cb.current = { measuring, onMeasure, identifyAt: trail.identifyAt, onRegion: trail.onRegion, onCenter };
  }, [measuring, onMeasure, trail.identifyAt, trail.onRegion, onCenter]);
  const pad = padding ?? [120, 40, 320, 40];
  const fitPadding = { paddingTopLeft: [pad[3], pad[0]] as L.PointTuple, paddingBottomRight: [pad[1], pad[2]] as L.PointTuple };
  const snapM = (m: L.Map) => snapRadiusM((156_543.03 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** m.getZoom());

  useImperativeHandle(ref, () => ({
    centerOn(p) {
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
    if (found) {
      L.marker(ll(found), {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="oml-found"><span>${esc(found.name)}</span></div>` }),
      }).addTo(g);
    }
  }, [following, recorded, measure, measureTaps, found]);

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
