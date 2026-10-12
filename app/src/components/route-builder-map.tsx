import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

import { Colors, font } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { snapRadiusM } from '@/core/trail-router';
import { metersPerPoint } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';

/**
 * Satellite map for building a route: tap to add the next point, drag a point to move it.
 * An imported track is shown as is (no points to drag). Each tap carries how far it may snap to
 * a trail: about a fingertip at the zoom it was made.
 */
export function RouteBuilderMap({
  points, waypoints, center, editable, onAdd, onMove, trail, pending = [],
}: {
  points: LatLng[];
  waypoints: LatLng[];
  center: LatLng | null;
  editable: boolean;
  onAdd: (p: LatLng, snapM: number) => void;
  onMove: (index: number, p: LatLng, snapM: number) => void;
  /** Legs still finding their trail, drawn as a dashed straight line meanwhile. */
  pending?: LatLng[][];
  /** Topo and public trails layers. A tap adds a point here, so pressing and holding looks up a trail. */
  trail?: TrailMap;
  /** Web only: keeps framed routes clear of the panels over the map. */
  padding?: [number, number, number, number];
}) {
  const map = useRef<MapView>(null);
  const fittedTo = useRef<LatLng[] | null>(null);
  const region = useRef<Region | null>(null);
  const width = useRef(390);
  const snapM = () => (region.current ? snapRadiusM(metersPerPoint(region.current, width.current)) : 60);

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
      onRegionChangeComplete={(r) => {
        region.current = r;
        trail?.mapProps.onRegionChangeComplete(r);
      }}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        trail?.mapProps.onLayout(e);
      }}
      onLongPress={(e) => trail?.identifyAt(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      showsUserLocation
      showsCompass
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined}
      onPress={(e) => {
        if (e.nativeEvent.action === 'marker-press') return;
        const c = e.nativeEvent.coordinate;
        // An imported track can't be edited, so a plain tap is free to look up the trail.
        if (!editable) return trail?.identifyAt(c.latitude, c.longitude);
        onAdd({ lat: c.latitude, lng: c.longitude }, snapM());
      }}>
      {trail ? <TrailTiles base={trail.base} trails={trail.trails} offline={trail.offline} osm={trail.osmLines} /> : null}
      {points.length > 1 ? <RouteLine points={points} /> : null}
      {pending.map((leg, i) => (
        <Polyline
          key={`p${i}`}
          coordinates={leg.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor="#F1F4F8"
          strokeWidth={3}
          lineDashPattern={[6, 6]}
          zIndex={3}
        />
      ))}
      {points.length > 1 && !waypoints.length ? <RouteEnds points={points} /> : null}
      {waypoints.map((w, i) => (
        <Marker
          key={i}
          coordinate={{ latitude: w.lat, longitude: w.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          draggable={editable}
          onDragEnd={(e) => onMove(i, { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }, snapM())}
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
