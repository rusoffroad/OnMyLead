import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { drawRoute, esc, ll, reportRegion, satelliteMap, trailLayers } from '@/lib/web-map';
import { octagon } from './waypoint-blaze';

const blaze = (shared: boolean) => {
  const fill = shared ? Colors.sky : Colors.text;
  const ink = shared ? '#FFFFFF' : Colors.background;
  return `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="4.4" y="4.4" width="21.2" height="21.2" rx="2.7" fill="${fill}" stroke="${Colors.background}" stroke-width="2.5" transform="rotate(45 15 15)"/><circle cx="15" cy="15" r="3.4" fill="${ink}"/></svg>`;
};

const stopSign = (n: number | null) =>
  `<svg width="34" height="34" viewBox="0 0 34 34"><polygon points="${octagon(17, 17, 16.5)}" fill="${Colors.background}"/><polygon points="${octagon(17, 17, 14.5)}" fill="#FFFFFF"/><polygon points="${octagon(17, 17, 12.5)}" fill="${Colors.accent}"/><text x="17" y="22.5" text-anchor="middle" fill="#FFFFFF" font-family="BarlowCondensed_800ExtraBold, sans-serif" font-size="17">${n ?? ''}</text></svg>`;

/**
 * The ride's waypoints on the web: satellite imagery, the route under them, the leader's planned
 * stops as numbered stop signs, over the same trail layers as the phone. Click anywhere to drop a
 * new one; click a blaze to open it.
 */
export function WaypointMap({
  waypoints, route, center, trail, onPressWaypoint, onLongPressMap, padding,
}: {
  waypoints: Waypoint[];
  route?: LatLng[] | null;
  center: LatLng | null;
  trail: TrailMap;
  onPressWaypoint: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
  /** Keeps the framed route clear of the panels drawn over the map: [top, right, bottom, left]. */
  padding?: [number, number, number, number];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tracks = useRef<ReturnType<typeof trailLayers> | null>(null);
  const fitted = useRef(false);
  const cb = useRef({ onPressWaypoint, onLongPressMap, onRegion: trail.onRegion });
  useEffect(() => {
    cb.current = { onPressWaypoint, onLongPressMap, onRegion: trail.onRegion };
  }, [onPressWaypoint, onLongPressMap, trail.onRegion]);
  const pad = padding ?? [80, 40, 380, 40];

  useEffect(() => {
    const m = satelliteMap(el.current!, { doubleClickZoom: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    tracks.current = trailLayers(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cb.current.onLongPressMap?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.on('moveend', () => reportRegion(m, cb.current.onRegion));
    m.setView(center ? ll(center) : [39.5, -98.35], center ? 13 : 4);
    map.current = m;
    reportRegion(m, cb.current.onRegion);
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { base, trails, osmLines, closedLines, labels } = trail;
  useEffect(() => {
    tracks.current?.update({ base, trails, osmLines, closedLines, labels });
  }, [base, trails, osmLines, closedLines, labels]);

  useEffect(() => {
    el.current?.classList.toggle('oml-draw', !!onLongPressMap);
  }, [onLongPressMap]);

  // Frame the route and the waypoints once they've loaded; leave the map alone after that.
  useEffect(() => {
    const pts = [...(route ?? []), ...waypoints];
    if (!map.current || fitted.current || pts.length < 2) return;
    fitted.current = true;
    map.current.fitBounds(L.latLngBounds(pts.map(ll)), { paddingTopLeft: [pad[3], pad[0]], paddingBottomRight: [pad[1], pad[2]], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, waypoints]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (route) drawRoute(g, route);
    for (const w of waypoints) {
      const n = w.planned_stop ? stopNumber(w, waypoints) : null;
      const time = w.planned_stop ? stopTimeLabel(w.stop_time) : null;
      const cls = w.planned_stop ? 'stop' : w.shared ? 'shared' : '';
      const size = w.planned_stop ? 34 : 30;
      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div class="oml-wp ${cls}" style="width:${size}px;height:${size}px">${w.planned_stop ? stopSign(n) : blaze(w.shared)}<span>${esc(w.name)}${time ? `<small>${esc(time)}</small>` : ''}</span></div>`,
      });
      L.marker(ll(w), {
        icon,
        title: w.planned_stop ? `Planned stop ${n ?? ''}, ${w.name}` : `Waypoint ${w.name}`,
        zIndexOffset: w.planned_stop ? 500 : w.shared ? 400 : 300,
      })
        .on('click', () => cb.current.onPressWaypoint(w))
        .addTo(g);
    }
  }, [route, waypoints]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <div ref={el} className="omlmap oml-full" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
    </View>
  );
}
