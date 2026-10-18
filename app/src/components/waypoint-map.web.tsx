import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { drawRoute, esc, ll, satelliteMap } from '@/lib/web-map';
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
 * stops as numbered stop signs. Click anywhere to drop a new one; click a blaze to open it.
 */
export function WaypointMap({
  waypoints, route, center, onPressWaypoint, onLongPressMap, padding, found, onCenter,
}: {
  waypoints: Waypoint[];
  route?: LatLng[] | null;
  center: LatLng | null;
  trail: TrailMap;
  onPressWaypoint: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
  /** Keeps the framed route clear of the panels drawn over the map: [top, right, bottom, left]. */
  padding?: [number, number, number, number];
  /** A place picked in the map search: the map moves there and marks it. Nothing is added. */
  found?: Place | null;
  /** Where the map is looking after each move, so a search ranks nearby places first. */
  onCenter?: (c: LatLng) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef({ onPressWaypoint, onLongPressMap, onCenter });
  useEffect(() => {
    cb.current = { onPressWaypoint, onLongPressMap, onCenter };
  }, [onPressWaypoint, onLongPressMap, onCenter]);
  const pad = padding ?? [80, 40, 380, 40];

  useEffect(() => {
    const m = satelliteMap(el.current!, { doubleClickZoom: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cb.current.onLongPressMap?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.on('moveend', () => {
      const c = m.getCenter();
      cb.current.onCenter?.({ lat: c.lat, lng: c.lng });
    });
    m.setView(center ? ll(center) : [39.5, -98.35], center ? 13 : 4);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Go to a searched place: the whole area when it has one, else close in on the spot.
  useEffect(() => {
    const m = map.current;
    marker.current?.remove();
    marker.current = null;
    if (!m || !found) return;
    const b = found.bounds;
    const area: L.LatLngBoundsExpression = b ? [[b.south, b.west], [b.north, b.east]] : [ll(found), ll(found)];
    m.flyToBounds(area, { paddingTopLeft: [pad[3], pad[0]], paddingBottomRight: [pad[1], pad[2]], maxZoom: b ? 16 : 15, duration: 0.9 });
    marker.current = L.marker(ll(found), {
      interactive: false,
      keyboard: false,
      zIndexOffset: 200,
      icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="oml-found"><span>${esc(found.name)}</span></div>` }),
    }).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

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
