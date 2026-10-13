import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import type { TrailMap } from '@/hooks/use-trail-map';
import { drawOsmTracks, drawRoute, esc, frame, ll, satelliteMap } from '@/lib/web-map';

/**
 * The route builder's map on the web: satellite imagery, click to add the next point, drag a
 * numbered point to move it. An imported track is shown as is (no points to drag). OpenStreetMap
 * trails are drawn once the map is in close (zoom 13), the same sand dash as on the phone.
 */
export function RouteBuilderMap({
  points, waypoints, center, editable, onAdd, onMove, padding, trail, pending = [], found, onCenter,
}: {
  points: LatLng[];
  waypoints: LatLng[];
  center: LatLng | null;
  editable: boolean;
  onAdd: (p: LatLng, snapM: number) => void;
  onMove: (index: number, p: LatLng, snapM: number) => void;
  pending?: LatLng[][];
  trail?: TrailMap;
  /** Keeps framed routes clear of the panels drawn over the map: [top, right, bottom, left]. */
  padding?: [number, number, number, number];
  /** A place picked in the map search: the map moves there and marks it. Nothing joins the route. */
  found?: Place | null;
  /** Where the map is looking after each move, so a search ranks nearby places first. */
  onCenter?: (c: LatLng) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tracks = useRef<L.LayerGroup | null>(null);
  const fittedTo = useRef<LatLng[] | null>(null);
  const cb = useRef({ onAdd, onMove, editable, onRegion: trail?.onRegion, onCenter });
  useEffect(() => {
    cb.current = { onAdd, onMove, editable, onRegion: trail?.onRegion, onCenter };
  }, [onAdd, onMove, editable, trail?.onRegion, onCenter]);
  const marker = useRef<L.Marker | null>(null);
  // About a fingertip (24 screen pixels) at the map's zoom.
  const snapM = (m: L.Map) => snapRadiusM((156_543.03 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** m.getZoom());
  const pad = padding ?? [120, 40, 320, 40];
  const fitPadding = { paddingTopLeft: [pad[3], pad[0]] as L.PointTuple, paddingBottomRight: [pad[1], pad[2]] as L.PointTuple };

  useEffect(() => {
    const m = satelliteMap(el.current!, { doubleClickZoom: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    tracks.current = L.layerGroup().addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.editable) cb.current.onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }, snapM(m));
    });
    // Tell the trail layer what's on screen, so it fetches the squares to draw.
    const report = () => {
      const b = m.getBounds();
      const c = b.getCenter();
      cb.current.onCenter?.({ lat: c.lat, lng: c.lng });
      cb.current.onRegion?.({ latitude: c.lat, longitude: c.lng, latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() }, m.getZoom());
    };
    m.on('moveend', report);
    const start = waypoints.length ? waypoints : points;
    if (start.length >= 2) m.fitBounds(L.latLngBounds(start.map(ll)), { ...fitPadding, maxZoom: 16 });
    else frame(m, start, center);
    fittedTo.current = points;
    map.current = m;
    report();
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is created once; later changes redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const osm = trail?.osmLines;
  useEffect(() => {
    const g = tracks.current;
    if (!g || !map.current) return;
    g.clearLayers();
    if (osm?.length) drawOsmTracks(g, osm);
    const credit = 'Trails © OpenStreetMap contributors, © OpenMapTiles';
    if (osm?.length) map.current.attributionControl.addAttribution(credit);
    else map.current.attributionControl.removeAttribution(credit);
  }, [osm]);

  // Go to a searched place: the whole area when it has one, else close in on the spot.
  useEffect(() => {
    const m = map.current;
    marker.current?.remove();
    marker.current = null;
    if (!m || !found) return;
    const b = found.bounds;
    // Framed inside the open map, clear of the panels over it; a lone spot comes in at zoom 15.
    const area: L.LatLngBoundsExpression = b ? [[b.south, b.west], [b.north, b.east]] : [ll(found), ll(found)];
    m.flyToBounds(area, { ...fitPadding, maxZoom: b ? 16 : 15, duration: 0.9 });
    marker.current = L.marker(ll(found), {
      interactive: false,
      keyboard: false,
      zIndexOffset: 200,
      icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="oml-found"><span>${esc(found.name)}</span></div>` }),
    }).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  useEffect(() => {
    el.current?.classList.toggle('oml-draw', editable);
  }, [editable]);

  // Frame a newly imported route once; leave the map alone while the leader clicks.
  useEffect(() => {
    if (!map.current || points.length < 2 || fittedTo.current === points || waypoints.length) return;
    fittedTo.current = points;
    map.current.fitBounds(L.latLngBounds(points.map(ll)), { ...fitPadding, maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, waypoints.length]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    drawRoute(g, points, !waypoints.length);
    for (const leg of pending) {
      L.polyline(leg.map(ll), { color: '#F1F4F8', weight: 3, dashArray: '6 6', interactive: false }).addTo(g);
    }
    waypoints.forEach((w, i) => {
      const last = i === waypoints.length - 1 && i > 0;
      const icon = L.divIcon({
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div class="oml-tap${i === 0 ? ' first' : last ? ' last' : ''}">${i + 1}</div>`,
      });
      const mk = L.marker(ll(w), { icon, draggable: editable, title: `Point ${i + 1}${editable ? ', drag to move' : ''}`, zIndexOffset: 500 }).addTo(g);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        if (map.current) cb.current.onMove(i, { lat: p.lat, lng: p.lng }, snapM(map.current));
      });
    });
  }, [points, waypoints, editable, pending]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <div ref={el} className="omlmap oml-full" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
    </View>
  );
}
