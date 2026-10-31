import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { cameraCenterFor, openMapCenter } from '@/core/map-center';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import type { GroupMapHandle, MapRider } from './group-map-types';
import { RiderPin } from './rider-pin';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';
import { StopPin, WaypointPin } from './waypoint-blaze';

export type { GroupMapHandle, MapRider } from './group-map-types';

const FIT_PADDING = { top: 80, right: 60, bottom: 80, left: 60 };

/** Whether every point is within about 300 m, too close together to frame by fitting. */
function isTight(pts: { latitude: number; longitude: number }[]) {
  const lats = pts.map((p) => p.latitude);
  const lngs = pts.map((p) => p.longitude);
  return Math.max(...lats) - Math.min(...lats) < 0.003 && Math.max(...lngs) - Math.min(...lngs) < 0.003;
}

/** Two corners about 800 m either side of a point, the closest the map frames on its own. */
function around(p: { latitude: number; longitude: number }) {
  return [
    { latitude: p.latitude - 0.007, longitude: p.longitude - 0.007 },
    { latitude: p.latitude + 0.007, longitude: p.longitude + 0.007 },
  ];
}

/**
 * Live group map. Every rider is the same grey dot with their ride name beside it; the leader is
 * the one bigger blue dot, so a glance finds them. A yellow or red ring means Ride Bubble trouble,
 * and an amber wrench means a Mechanical Issue. A rider whose last fix is over a minute old is
 * drawn hollow at where they were last seen, with the age on the tag, so an old position never
 * passes for a live one.
 */
export function GroupMap({
  riders, regroup, route, meId, onPressRider, trail, waypoints, onPressWaypoint, onLongPressMap, edgePadding = FIT_PADDING, ref,
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
  /** Waypoints this rider can see: the leader's shared ones (blue) and their own (white). */
  waypoints?: Waypoint[];
  onPressWaypoint?: (w: Waypoint) => void;
  /** Press and hold the map: drop a waypoint there. */
  onLongPressMap?: (p: LatLng) => void;
  /** Room the first framing of the group leaves around it, for panels that sit over the map (tablets). */
  edgePadding?: { top: number; right: number; bottom: number; left: number };
  /** Lets Ride Mode's center-on-me button move the map. */
  ref?: Ref<GroupMapHandle>;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef<'no' | 'riders' | 'route'>('no');
  const size = useRef({ width: 0, height: 0 });

  useImperativeHandle(ref, () => ({
    async centerOn(p, inset) {
      const m = map.current;
      if (!m) return;
      const { width, height } = size.current;
      const target = { latitude: p.lat, longitude: p.lng };
      try {
        const open = openMapCenter(size.current, inset);
        // Both points are on screen now, so reading them is exact even on a turned map.
        const [here, there] = await Promise.all([
          m.coordinateForPoint({ x: width / 2, y: height / 2 }),
          m.coordinateForPoint(open),
        ]);
        const c = cameraCenterFor(
          p,
          { lat: here.latitude, lng: here.longitude },
          { lat: there.latitude, lng: there.longitude },
        );
        m.animateCamera({ center: { latitude: c.lat, longitude: c.lng } }, { duration: 450 });
      } catch {
        // No reading from the map (not laid out yet): centre on the whole map instead.
        m.animateCamera({ center: target }, { duration: 450 });
      }
    },
  }), []);

  useEffect(() => {
    const pts = riders.filter((r) => r.lat != null).map((r) => ({ latitude: r.lat!, longitude: r.lng! }));
    // With a route, frame the route and the group together so everyone can be seen on it.
    if (route?.length) for (const p of route) pts.push({ latitude: p.lat, longitude: p.lng });
    const want = route?.length ? 'route' : 'riders';
    if (fitted.current !== want && fitted.current !== 'route' && pts.length) {
      // One rider, or the whole group at the meeting spot, would zoom all the way in, past where
      // satellite and topo tiles exist, so the map showed blank or blurred: frame about a mile.
      map.current?.fitToCoordinates(isTight(pts) ? around(pts[0]) : pts, { edgePadding, animated: false });
      fitted.current = want;
    }
  }, [riders, route, edgePadding]);

  return (
    <MapView ref={map} style={StyleSheet.absoluteFill}
      onLayout={(e) => { size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}
      showsUserLocation showsCompass mapType="hybrid" tintColor={Colors.text} {...trail?.mapProps}
      onLongPress={onLongPressMap ? (e) => onLongPressMap({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}>
      {trail ? <TrailTiles trail={trail} /> : null}
      {route && route.length > 1 ? (
        <>
          <RouteLine points={route} />
          <RouteEnds points={route} />
        </>
      ) : null}
      {waypoints?.map((w) => (
        <Marker
          key={`w-${w.id}`}
          coordinate={{ latitude: w.lat, longitude: w.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={(e) => {
            // Keep the tap from also reaching the map (which looks up trails).
            e.stopPropagation?.();
            onPressWaypoint?.(w);
          }}
          accessibilityLabel={w.planned_stop ? `Planned stop ${stopNumber(w, waypoints ?? [])}, ${w.name}` : `Waypoint ${w.name}`}
          zIndex={w.planned_stop ? 4 : w.shared ? 3 : 2}>
          {w.planned_stop ? (
            <StopPin name={w.name} n={stopNumber(w, waypoints ?? [])} time={stopTimeLabel(w.stop_time)} />
          ) : (
            <WaypointPin name={w.name} kind={w.kind} shared={w.shared} />
          )}
        </Marker>
      ))}
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
