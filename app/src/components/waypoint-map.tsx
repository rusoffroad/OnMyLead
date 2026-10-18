import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, font } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
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
  waypoints, route, center, trail, onPressWaypoint, onLongPressMap, found, onCenter,
}: {
  waypoints: Waypoint[];
  route?: LatLng[] | null;
  center: LatLng | null;
  trail: TrailMap;
  onPressWaypoint: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
  /** Web only: keeps framed routes clear of the panels over the map. */
  padding?: [number, number, number, number];
  /** A place picked in the map search: the map moves there and marks it. Nothing is added. */
  found?: Place | null;
  /** Where the map is looking after each move, so a search ranks nearby places first. */
  onCenter?: (c: LatLng) => void;
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

  // Go to a searched place: the whole area when it has one, else close in on the spot.
  useEffect(() => {
    if (!found) return;
    const b = found.bounds;
    if (b) {
      map.current?.fitToCoordinates(
        [{ latitude: b.north, longitude: b.west }, { latitude: b.south, longitude: b.east }],
        { edgePadding: { top: 140, right: 40, bottom: 380, left: 40 }, animated: true },
      );
    } else {
      // Nudged north so the spot lands in the open map above the panel.
      map.current?.animateToRegion({ latitude: found.lat - 0.006, longitude: found.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 700);
    }
  }, [found]);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      showsUserLocation
      showsCompass
      tintColor={Colors.text}
      {...trail.mapProps}
      onRegionChangeComplete={(r) => {
        onCenter?.({ lat: r.latitude, lng: r.longitude });
        trail.mapProps.onRegionChangeComplete(r);
      }}
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined}
      onLongPress={onLongPressMap ? (e) => onLongPressMap({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}>
      <TrailTiles base={trail.base} trails={trail.trails} offline={trail.offline} osm={trail.osmLines} />
      {route && route.length > 1 ? (
        <>
          <RouteLine points={route} />
          <RouteEnds points={route} />
        </>
      ) : null}
      {found ? (
        <Marker
          coordinate={{ latitude: found.lat, longitude: found.lng }}
          anchor={{ x: 0.5, y: 1 }}
          tappable={false}
          tracksViewChanges={false}
          accessibilityLabel={`Search result: ${found.name}`}
          zIndex={2}>
          <View style={styles.found}>
            <Text style={styles.foundText} numberOfLines={1}>{found.name}</Text>
            <View style={styles.foundStem} />
            <View style={styles.foundDot} />
          </View>
        </Marker>
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

const styles = StyleSheet.create({
  found: { alignItems: 'center', maxWidth: 220 },
  foundText: {
    color: Colors.background, backgroundColor: '#ECCD91', fontFamily: font(700), fontSize: 13,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden',
  },
  foundStem: { width: 2, height: 10, backgroundColor: '#ECCD91' },
  foundDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ECCD91', borderWidth: 2, borderColor: Colors.background },
});
