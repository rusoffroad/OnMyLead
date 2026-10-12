import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, font, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { TrailMap } from '@/hooks/use-trail-map';
import type { MapRider } from './group-map-types';
import { BreakdownBadge } from './rider-status-badge';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';

export type { MapRider } from './group-map-types';

/**
 * Live group map. Every rider is the same grey dot with their ride name beside it; the leader is
 * the one bigger blue dot, so a glance finds them. A yellow or red ring means Ride Bubble trouble,
 * and an amber wrench means a Mechanical Issue.
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

/** Wide enough for a 24-character name; the dot sits dead centre so the anchor stays on it. */
const PIN_W = 220;

function RiderPin({ rider: r }: { rider: MapRider }) {
  const leader = r.role === 'leader';
  const size = leader ? 22 : 14;
  const trouble = r.status === 'red' || r.status === 'yellow';
  const ring = size + 10;
  return (
    <View style={[styles.pin, { opacity: r.stale ? 0.55 : 1 }]}>
      {trouble ? (
        <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: RideColors[r.status] }]} />
      ) : null}
      <View
        style={[
          styles.dot,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: leader ? RideColors.leader : RideColors.rider },
          leader && styles.leaderDot,
        ]}
      />
      {r.breakdown ? (
        <View style={[styles.badge, { left: PIN_W / 2 + size / 2 - 8, top: 0 }]}>
          <BreakdownBadge size={18} />
        </View>
      ) : null}
      <View style={[styles.label, { left: PIN_W / 2 + (trouble ? ring : size) / 2 + (r.breakdown ? 14 : 4) }, leader && styles.leaderLabel]}>
        <Text style={[styles.name, leader && styles.leaderName]} numberOfLines={1}>
          {r.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { width: PIN_W, height: 34, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, backgroundColor: 'rgba(10,22,38,0.35)' },
  dot: { borderWidth: 2, borderColor: Colors.background },
  // The leader is the one everyone follows: bigger, ringed in white, and the only blue dot.
  leaderDot: { borderWidth: 3, borderColor: Colors.text },
  label: {
    position: 'absolute', maxWidth: PIN_W / 2 - 24, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 6, backgroundColor: 'rgba(10,22,38,0.78)',
  },
  leaderLabel: { backgroundColor: RideColors.leader },
  name: { color: Colors.text, fontFamily: font(600), fontSize: 11, lineHeight: 14 },
  leaderName: { color: '#fff', fontFamily: font(800), fontSize: 12, lineHeight: 15 },
});
