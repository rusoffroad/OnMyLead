import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';
import { StopPin, WaypointPin } from './waypoint-blaze';

/**
 * The ride's waypoints on a satellite (or topo) map, with the route under them. Press and hold
 * anywhere to drop a new one; tap a blaze to open it.
 */
export function WaypointMap({
  waypoints, route, center, trail, onPressWaypoint, onLongPressMap,
}: {
  waypoints: Waypoint[];
  route?: LatLng[] | null;
  center: LatLng | null;
  trail: TrailMap;
  onPressWaypoint: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef(false);

  // Frame the route and the waypoints once they've loaded; leave the map alone after that.
  useEffect(() => {
    const pts = [...(route ?? []), ...waypoints].map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (fitted.current || pts.length < 2) return;
    fitted.current = true;
    map.current?.fitToCoordinates(pts, { edgePadding: { top: 140, right: 60, bottom: 380, left: 60 }, animated: false });
  }, [route, waypoints]);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      showsUserLocation
      showsCompass
      tintColor={Colors.text}
      {...trail.mapProps}
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined}
      onLongPress={onLongPressMap ? (e) => onLongPressMap({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}>
      <TrailTiles base={trail.base} trails={trail.trails} offline={trail.offline} osm={trail.osmLines} />
      {route && route.length > 1 ? (
        <>
          <RouteLine points={route} />
          <RouteEnds points={route} />
        </>
      ) : null}
      {waypoints.map((w) => (
        <Marker
          key={w.id}
          coordinate={{ latitude: w.lat, longitude: w.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={(e) => {
            e.stopPropagation?.();
            onPressWaypoint(w);
          }}
          accessibilityLabel={w.planned_stop ? `Planned stop ${stopNumber(w, waypoints ?? [])}, ${w.name}` : `Waypoint ${w.name}`}
          zIndex={w.planned_stop ? 5 : w.shared ? 4 : 3}>
          {w.planned_stop ? (
            <StopPin name={w.name} n={stopNumber(w, waypoints ?? [])} time={stopTimeLabel(w.stop_time)} />
          ) : (
            <WaypointPin name={w.name} kind={w.kind} shared={w.shared} />
          )}
        </Marker>
      ))}
    </MapView>
  );
}
