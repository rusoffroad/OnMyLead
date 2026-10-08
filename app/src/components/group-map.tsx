import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, font, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { MapRider } from './group-map-types';
import { RouteEnds, RouteLine } from './route-overlay';

export type { MapRider } from './group-map-types';

/** Live group map. Leader and Sweep get distinct colors; the ring shows Ride Bubble status. */
export function GroupMap({
  riders, regroup, route, onPressRider,
}: {
  riders: MapRider[];
  /** The ride's planned route, drawn under the riders. */
  route?: LatLng[] | null;
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
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
    <MapView ref={map} style={StyleSheet.absoluteFill} showsUserLocation showsCompass mapType="hybrid">
      {route && route.length > 1 ? (
        <>
          <RouteLine points={route} />
          <RouteEnds points={route} />
        </>
      ) : null}
      {riders
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.lat!, longitude: r.lng! }}
            title={r.name}
            description={r.detail}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onPressRider?.(r.id)}
            opacity={r.stale ? 0.55 : 1}>
            <View style={[styles.ring, { borderColor: RideColors[r.status] }]}>
              <View style={[styles.dot, { backgroundColor: RideColors[r.role], opacity: r.stale ? 0.4 : 1 }]}>
                <Text style={styles.initial}>{r.role === 'leader' ? 'L' : r.role === 'sweep' ? 'S' : r.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            </View>
          </Marker>
        ))}
      {regroup ? (
        <Marker coordinate={{ latitude: regroup.lat, longitude: regroup.lng }} title={regroup.label ?? 'Regroup here'} pinColor={RideColors.yellow} />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontFamily: font(800) },
});
