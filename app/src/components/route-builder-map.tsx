import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors, font } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { TrailMap } from '@/hooks/use-trail-map';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';

/**
 * Satellite map for building a route: tap to add the next point, drag a point to move it.
 * An imported track is shown as is (no points to drag).
 */
export function RouteBuilderMap({
  points, waypoints, center, editable, onAdd, onMove, trail,
}: {
  points: LatLng[];
  waypoints: LatLng[];
  center: LatLng | null;
  editable: boolean;
  onAdd: (p: LatLng) => void;
  onMove: (index: number, p: LatLng) => void;
  /** Topo and public trails layers. A tap adds a point here, so pressing and holding looks up a trail. */
  trail?: TrailMap;
}) {
  const map = useRef<MapView>(null);
  const fittedTo = useRef<LatLng[] | null>(null);

  // Frame a newly loaded or imported route once; leave the map alone while the leader taps.
  useEffect(() => {
    if (points.length < 2 || fittedTo.current === points || waypoints.length) return;
    fittedTo.current = points;
    map.current?.fitToCoordinates(points.map((p) => ({ latitude: p.lat, longitude: p.lng })), {
      edgePadding: { top: 140, right: 50, bottom: 320, left: 50 },
      animated: true,
    });
  }, [points, waypoints.length]);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      mapType={trail?.mapProps.mapType ?? 'hybrid'}
      onRegionChangeComplete={trail?.mapProps.onRegionChangeComplete}
      onLayout={trail?.mapProps.onLayout}
      onLongPress={(e) => trail?.identifyAt(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      showsUserLocation
      showsCompass
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined}
      onPress={(e) => {
        if (e.nativeEvent.action === 'marker-press') return;
        const c = e.nativeEvent.coordinate;
        // An imported track can't be edited, so a plain tap is free to look up the trail.
        if (!editable) return trail?.identifyAt(c.latitude, c.longitude);
        onAdd({ lat: c.latitude, lng: c.longitude });
      }}>
      {trail ? <TrailTiles base={trail.base} trails={trail.trails} /> : null}
      {points.length > 1 ? <RouteLine points={points} /> : null}
      {points.length > 1 && !waypoints.length ? <RouteEnds points={points} /> : null}
      {waypoints.map((w, i) => (
        <Marker
          key={i}
          coordinate={{ latitude: w.lat, longitude: w.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          draggable={editable}
          onDragEnd={(e) => onMove(i, { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
          zIndex={4}>
          <View style={[styles.pin, i === 0 && styles.first, i === waypoints.length - 1 && i > 0 && styles.last]}>
            <Text style={[styles.num, i === waypoints.length - 1 && i > 0 && { color: Colors.background }]}>{i + 1}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 2.5, borderColor: Colors.accent,
  },
  first: { backgroundColor: '#3CC36B', borderColor: Colors.background },
  last: { backgroundColor: Colors.text, borderColor: Colors.background },
  num: { color: '#fff', fontFamily: font(800), fontSize: 12 },
});
