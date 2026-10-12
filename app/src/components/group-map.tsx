import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { TrailMap } from '@/hooks/use-trail-map';
import type { MapRider } from './group-map-types';
import { RiderPin } from './rider-pin';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';

export type { MapRider } from './group-map-types';

/**
 * Live group map. Every rider is the same grey dot with their ride name beside it; the leader is
 * the one bigger blue dot, so a glance finds them. A yellow or red ring means Ride Bubble trouble,
 * and an amber wrench means a Mechanical Issue. A rider whose last fix is over a minute old is
 * drawn hollow at where they were last seen, with the age on the tag, so an old position never
 * passes for a live one.
 */
export function GroupMap({
  riders, regroup, route, meId, onPressRider, trail,
}: {
  riders: MapRider[];
  /** This phone's rider: iOS already draws them as the location dot, so no second pin. */
  meId?: string;
  /** The ride's planned route, drawn under the riders. */
  route?: LatLng[] | null;
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
  /** Topo and public trails layers (see useTrailMap); tapping a trail shows what it is. */
  trail?: TrailMap;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef<'no' | 'riders' | 'route'>('no');

  useEffect(() => {
    const pts = riders.filter((r) => r.lat != null).map((r) => ({ latitude: r.lat!, longitude: r.lng! }));
    // With a route, frame the route and the group together so everyone can be seen on it.
    if (route?.length) for (const p of route) pts.push({ latitude: p.lat, longitude: p.lng });
    const want = route?.length ? 'route' : 'riders';
    if (fitted.current !== want && fitted.current !== 'route' && pts.length) {
      map.current?.fitToCoordinates(pts, { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: false });
      fitted.current = want;
    }
  }, [riders, route]);

  return (
    <MapView ref={map} style={StyleSheet.absoluteFill} showsUserLocation showsCompass mapType="hybrid" tintColor={Colors.text} {...trail?.mapProps}>
      {trail ? <TrailTiles base={trail.base} trails={trail.trails} offline={trail.offline} /> : null}
      {route && route.length > 1 ? (
        <>
          <RouteLine points={route} />
          <RouteEnds points={route} />
        </>
      ) : null}
      {riders
        .filter((r) => r.lat != null && r.lng != null && r.id !== meId)
        .map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.lat!, longitude: r.lng! }}
            title={r.name}
            description={r.detail}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onPressRider?.(r.id)}
            zIndex={r.breakdown ? 6 : r.role === 'leader' ? 5 : 4}>
            <RiderPin rider={r} />
          </Marker>
        ))}
      {regroup ? (
        <Marker coordinate={{ latitude: regroup.lat, longitude: regroup.lng }} title={regroup.label ?? 'Regroup here'} pinColor={RideColors.yellow} />
      ) : null}
    </MapView>
  );
}
