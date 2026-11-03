import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

import { Colors, font } from '@/constants/theme';
import { followCamShouldMove } from '@/core/follow-camera';
import { followCamDurationMs } from '@/core/glide';
import type { LatLng } from '@/core/geo';
import { cameraCenterFor, openMapCenter } from '@/core/map-center';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import { metersPerPoint } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MarkerBody } from './marker-body';
import { OwnHeadingMarker, useOwnLocation } from './own-heading';
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

/** Map Mode's own dot reports every second; the follow camera glides for about that long. */
const FOLLOW_MS = followCamDurationMs(1000);
const toCoords = (pts: LatLng[]) => pts.map((p) => ({ latitude: p.lat, longitude: p.lng }));

/**
 * Navigation Mode's map: satellite or topo with every trail layer (agency, OpenStreetMap and rider
 * trails), the rider's own location, the trail being recorded (a bright cream line), a trail being
 * followed (the route red, with start and finish), and the distance finder's points. A tap measures
 * while measuring; otherwise it looks up the trail under the finger.
 */
export function NavMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, followMe, onUserMove, ref,
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
  /** Follow-me camera: while set, the map keeps this spot (the rider) in the open map. */
  followMe?: LatLng | null;
  /** The rider dragged, pinched or turned the map by hand. */
  onUserMove?: () => void;
  /** The website draws the rider's arrow from this; the phones read their own map dot. */
  meHeading?: number | null;
  ref?: Ref<NavMapHandle>;
}) {
  const map = useRef<MapView>(null);
  const region = useRef<Region | null>(null);
  const width = useRef(390);
  const size = useRef({ width: 390, height: 800 });
  const followed = useRef<LatLng | null>(null);
  const centered = useRef(false);
  // The arrow on the rider's own dot (the phone draws the dot itself, never with a direction).
  const own = useOwnLocation();
  const [mapHeading, setMapHeading] = useState(0);
  const pad = padding ?? [120, 50, 320, 50];
  const edge = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };

  useImperativeHandle(ref, () => ({
    centerOn(p) {
      // The follow-me camera takes over from this spot once the rider moves.
      followed.current = p;
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

  // Follow-me camera: slide the map (same zoom and heading) so the rider stays in the open part of
  // the map between the panels. Moves under a couple of meters are GPS jitter and skipped.
  useEffect(() => {
    if (!followMe) {
      followed.current = null;
      return;
    }
    if (!followCamShouldMove(followed.current, followMe)) return;
    followed.current = followMe;
    const m = map.current;
    if (!m) return;
    const target = { latitude: followMe.lat, longitude: followMe.lng };
    const { width: w, height: h } = size.current;
    const open = openMapCenter(size.current, { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] });
    Promise.all([m.coordinateForPoint({ x: w / 2, y: h / 2 }), m.coordinateForPoint(open)])
      .then(([here, there]) => {
        const c = cameraCenterFor(followMe, { lat: here.latitude, lng: here.longitude }, { lat: there.latitude, lng: there.longitude });
        m.animateCamera({ center: { latitude: c.lat, longitude: c.lng } }, { duration: FOLLOW_MS });
      })
      .catch(() => m.animateCamera({ center: target }, { duration: FOLLOW_MS }));
    // Only when the followed spot moves; the panels' padding is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followMe]);

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
      onUserLocationChange={own.onUserLocationChange}
      userLocationUpdateInterval={1000}
      userLocationFastestInterval={1000}
      showsCompass
      showsScale
      tintColor={Colors.text}
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 } : { latitude: 39.5, longitude: -105.8, latitudeDelta: 6, longitudeDelta: 6 }}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        trail.mapProps.onLayout(e);
      }}
      onPanDrag={() => onUserMove?.()}
      onRegionChangeComplete={(r, details) => {
        if (details?.isGesture) onUserMove?.();
        region.current = r;
        onCenter?.({ lat: r.latitude, lng: r.longitude });
        trail.mapProps.onRegionChangeComplete(r);
        map.current?.getCamera().then((c) => setMapHeading(Math.round((c.heading ?? 0) / 5) * 5 % 360)).catch(() => {});
      }}
      onPress={(e) => {
        if (e.nativeEvent.action === 'marker-press') return;
        const c = e.nativeEvent.coordinate;
        if (measuring) onMeasure({ lat: c.latitude, lng: c.longitude }, snapM());
        else trail.mapProps.onPress(e);
      }}
      onLongPress={(e) => trail.identifyAt(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}>
      <TrailTiles trail={trail} />
      <OwnHeadingMarker own={own} mapHeading={mapHeading} />
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
