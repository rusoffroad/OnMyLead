import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, font, RideColors } from '@/constants/theme';
import type { MapRider } from './group-map-types';

export type { MapRider } from './group-map-types';

/** Live group map. Leader and Sweep get distinct colors; the ring shows Ride Bubble status. */
export function GroupMap({
  riders, regroup, onPressRider,
}: {
  riders: MapRider[];
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef(false);

  useEffect(() => {
    const pts = riders.filter((r) => r.lat != null).map((r) => ({ latitude: r.lat!, longitude: r.lng! }));
    if (!fitted.current && pts.length) {
      map.current?.fitToCoordinates(pts, { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: false });
      fitted.current = true;
    }
  }, [riders]);

  return (
    <MapView ref={map} style={StyleSheet.absoluteFill} showsUserLocation showsCompass mapType="hybrid">
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
