import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

import { Colors, font } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import { metersPerPoint } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MarkerBody } from './marker-body';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';

export type NavMapHandle = {
  /** Move the map to a point, keeping a close zoom. */
  centerOn: (p: LatLng) => void;
  /** Frame a line. */
  fit: (points: LatLng[]) => void;
};

export const RECORD_INK = '#F6F1E3';
const MEASURE_INK = '#ECCD91';

const toCoords = (pts: LatLng[]) => pts.map((p) => ({ latitude: p.lat, longitude: p.lng }));

/**
 * Navigation Mode's map: satellite or topo with every trail layer (agency, OpenStreetMap and rider
 * trails), the rider's own location, the trail being recorded (a bright cream line), a trail being
 * followed (the route red, with start and finish), and the distance finder's points. A tap measures
 * while measuring; otherwise it looks up the trail under the finger.
 */
export function NavMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, ref,
}: {
  trail: TrailMap;
  recorded: LatLng[];
  following: LatLng[] | null;
  /** The distance finder's line (following trails or straight) and its tapped points. */
  measure: LatLng[];
  measureTaps: LatLng[];
  measuring: boolean;
  onMeasure: (p: LatLng, snapM: number) => void;
  center: LatLng | null;
  found?: Place | null;
  onCenter?: (c: LatLng) => void;
  /** Room the panels take over the map: [top, right, bottom, left]. */
  padding?: [number, number, number, number];
  ref?: Ref<NavMapHandle>;
}) {
  const map = useRef<MapView>(null);
  const region = useRef<Region | null>(null);
  const width = useRef(390);
  const centered = useRef(false);
  const pad = padding ?? [120, 50, 320, 50];
  const edge = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };

  useImperativeHandle(ref, () => ({
    centerOn(p) {
      const d = region.current ? Math.min(region.current.latitudeDelta, 0.05) : 0.03;
      map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: d, longitudeDelta: d }, 450);
    },
    fit(points) {
      if (points.length < 2) return;
      map.current?.fitToCoordinates(toCoords(points), { edgePadding: edge, animated: true });
    },
  }));

  // Open on the rider the first time their location is known.
  useEffect(() => {
    if (!center || centered.current) return;
    centered.current = true;
    map.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 1);
  }, [center]);

  useEffect(() => {
    if (!found) return;
    const b = found.bounds;
    if (b) map.current?.fitToCoordinates([{ latitude: b.north, longitude: b.west }, { latitude: b.south, longitude: b.east }], { edgePadding: edge, animated: true });
    else map.current?.animateToRegion({ latitude: found.lat, longitude: found.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 700);
    // Only when a new place is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const rec = useMemo(() => toCoords(recorded), [recorded]);
  const meas = useMemo(() => toCoords(measure), [measure]);
  const snapM = () => (region.current ? snapRadiusM(metersPerPoint(region.current, width.current)) : 60);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      mapType={trail.mapProps.mapType}
      showsUserLocation
      showsCompass
      showsScale
      tintColor={Colors.text}
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 } : { latitude: 39.5, longitude: -105.8, latitudeDelta: 6, longitudeDelta: 6 }}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        trail.mapProps.onLayout(e);
      }}
      onRegionChangeComplete={(r) => {
        region.current = r;
        onCenter?.({ lat: r.latitude, lng: r.longitude });
        trail.mapProps.onRegionChangeComplete(r);
      }}
      onPress={(e) => {
        if (e.nativeEvent.action === 'marker-press') return;
        const c = e.nativeEvent.coordinate;
        if (measuring) onMeasure({ lat: c.latitude, lng: c.longitude }, snapM());
        else trail.mapProps.onPress(e);
      }}
      onLongPress={(e) => trail.identifyAt(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}>
      <TrailTiles trail={trail} />
      {following && following.length > 1 ? (
        <>
          <RouteLine points={following} />
          <RouteEnds points={following} />
        </>
      ) : null}
      {rec.length > 1 ? (
        <>
          <Polyline coordinates={rec} strokeColor={Colors.background} strokeWidth={8} zIndex={5} tappable={false} />
          <Polyline coordinates={rec} strokeColor={RECORD_INK} strokeWidth={4.5} zIndex={5} tappable={false} />
        </>
      ) : null}
      {meas.length > 1 ? (
        <>
          <Polyline coordinates={meas} strokeColor={Colors.background} strokeWidth={7} zIndex={6} tappable={false} />
          <Polyline coordinates={meas} strokeColor={MEASURE_INK} strokeWidth={3.5} lineDashPattern={[8, 5]} zIndex={6} tappable={false} />
        </>
      ) : null}
      {measureTaps.map((p, i) => (
        <Marker key={`m${i}`} coordinate={{ latitude: p.lat, longitude: p.lng }} anchor={{ x: 0.5, y: 0.5 }} tappable={false} zIndex={7}>
          <View style={styles.pin}><Text style={styles.pinText}>{i + 1}</Text></View>
        </Marker>
      ))}
      {found ? (
        <Marker coordinate={{ latitude: found.lat, longitude: found.lng }} anchor={{ x: 0.5, y: 1 }} tappable={false} accessibilityLabel={`Search result: ${found.name}`}>
          <MarkerBody style={{ alignItems: 'center', maxWidth: 220 }}>
            <Text style={styles.found} numberOfLines={1}>{found.name}</Text>
            <View style={styles.foundDot} />
          </MarkerBody>
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 2.5, borderColor: MEASURE_INK,
  },
  pinText: { color: Colors.text, fontFamily: font(800), fontSize: 11 },
  found: { color: Colors.background, backgroundColor: MEASURE_INK, fontFamily: font(700), fontSize: 13, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  foundDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: MEASURE_INK, borderWidth: 2, borderColor: Colors.background },
});
