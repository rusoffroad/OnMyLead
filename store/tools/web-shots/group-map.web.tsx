// Store-screenshot build only: the live group map drawn on satellite imagery, the way the apps show it.
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { drawRoute, esc, ll, satelliteMap } from '@/lib/web-map';
import type { MapRider } from './group-map-types';

export type { MapRider } from './group-map-types';

export function GroupMap({
  riders, route, edgePadding,
}: {
  riders: MapRider[];
  route?: { lat: number; lng: number }[] | null;
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
  trail?: TrailMap;
  waypoints?: Waypoint[];
  onPressWaypoint?: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
  edgePadding?: { top: number; right: number; bottom: number; left: number };
}) {
  const box = useRef<View>(null);
  useEffect(() => {
    const el = box.current as unknown as HTMLElement;
    const m = satelliteMap(el);
    const g = L.layerGroup().addTo(m);
    if (route && route.length > 1) drawRoute(g, route);
    const pts: LatLng[] = [...(route ?? [])];
    for (const r of riders) {
      if (r.lat == null || r.lng == null) continue;
      pts.push({ lat: r.lat, lng: r.lng });
      const live = r.freshness?.state === 'live';
      const color = !live ? '#8A97AB' : r.role === 'leader' ? RideColors.leader : RideColors.rider;
      const size = r.role === 'leader' ? 22 : 16;
      L.marker(ll({ lat: r.lat, lng: r.lng }), {
        icon: L.divIcon({
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.6)">`
            + `<span style="position:absolute;left:${size + 4}px;top:-2px;white-space:nowrap;padding:1px 6px;border-radius:6px;background:rgba(10,22,38,.85);color:${Colors.text};font:12px Barlow_700Bold,sans-serif">${esc(r.name)}</span></div>`,
        }),
      }).addTo(g);
    }
    const p = edgePadding ?? { top: 60, right: 60, bottom: 60, left: 60 };
    const fit = () => { m.invalidateSize(); if (pts.length > 1) m.fitBounds(L.latLngBounds(pts.map(ll)), { paddingTopLeft: [p.left + 30, p.top + 30], paddingBottomRight: [p.right + 30, p.bottom + 30], maxZoom: 16 }); };
    fit();
    const t = setTimeout(fit, 1500);
    return () => { clearTimeout(t); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.length, riders.length, JSON.stringify(edgePadding)]);
  return <View ref={box} style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background }]} />;
}
