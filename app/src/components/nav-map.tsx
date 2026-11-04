import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

import { Colors, font, MapLabelText, themedStyles } from '@/constants/theme';
import { followCamShouldMove } from '@/core/follow-camera';
import { followCamDurationMs } from '@/core/glide';
import type { LatLng } from '@/core/geo';
import { OBSTACLE_INK, type Obstacle } from '@/core/obstacles';
import type { DayLine } from '@/core/track-line';
import {
  cameraCenterFor, OPENING_CHECK_MS, OPENING_DELTA, OPENING_START, openingMoveWanted, openingReached, openMapCenter, type OpeningCamera,
} from '@/core/map-center';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import { metersPerPoint } from '@/core/trails';
import { symbolLabel, waypointSymbol } from '@/core/waypoint-symbols';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { NavMapboxMap } from '@/components/nav-mapbox-map';
import { MarkerBody } from './marker-body';
import { OwnHeadingMarker, useOwnLocation } from './own-heading';
import { RouteEnds, RouteLine } from './route-overlay';
import { TrailTiles } from './trail-tiles';
import { StopPin, WaypointPin } from './waypoint-blaze';

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

type NavMapProps = Parameters<typeof FlatNavMap>[0];

/** Map Mode's map: Mapbox when this build and the owner allow it and it can draw here, otherwise the flat map. */
export function NavMap(props: NavMapProps) {
  if (props.trail.mapbox) return <NavMapboxMap {...props} />;
  return <FlatNavMap {...props} />;
}

/**
 * Map Mode's map: satellite or topo with every trail layer (agency, OpenStreetMap and rider
 * trails), the rider's own location, the trail being recorded (a bright cream line), a trail being
 * followed (the route red, with start and finish), and the distance finder's points. A tap measures
 * while measuring; otherwise it looks up the trail under the finger.
 */
function FlatNavMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, followMe, onUserMove, trackLines, obstacles, onObstacle,
  waypoints, onPressWaypoint, onLongPressMap, ref,
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
  /** Track Line: where the rider has been, one colour per day, oldest first. */
  trackLines?: DayLine[];
  /** Named spots on the trail being drawn, recorded or followed. */
  obstacles?: Obstacle[];
  onObstacle?: (o: Obstacle) => void;
  /** Waypoints on the map (the rider's own and shared ones); tap a blaze to open it. */
  waypoints?: Waypoint[];
  onPressWaypoint?: (w: Waypoint) => void;
  /** Press and hold the map: the screen decides (drop a waypoint, or look up the trail). Missing: the trail lookup. */
  onLongPressMap?: (p: LatLng) => void;
  ref?: Ref<NavMapHandle>;
}) {
  const map = useRef<MapView>(null);
  const region = useRef<Region | null>(null);
  const width = useRef(390);
  const size = useRef({ width: 390, height: 800 });
  const followed = useRef<LatLng | null>(null);
  const opening = useRef<OpeningCamera>({ ...OPENING_START });
  const openingTarget = useRef<LatLng | null>(null);
  // The arrow on the rider's own dot (the phone draws the dot itself, never with a direction).
  const own = useOwnLocation();
  const [mapHeading, setMapHeading] = useState(0);
  const pad = padding ?? [120, 50, 320, 50];
  const edge = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };

  useImperativeHandle(ref, () => ({
    centerOn(p) {
      opening.current.done = true;
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

  // Open on the rider the first time their location is known, at riding zoom (core/map-center
  // OpeningCamera). The first fix can land after the map is ready (a cold start with no GPS yet),
  // and Android's map drops camera moves sent before it is ready or laid out (it stayed zoomed out
  // on the whole state), so the move is checked and sent again until the map is on the rider.
  // Dragging the map or searching first stops it.
  const [ready, setReady] = useState(false);
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    // A map that never reports ready still gets the opening move (and its checks).
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!ready || !openingMoveWanted(opening.current, center)) return;
    const target = center!;
    if (openingReached(region.current, target)) {
      opening.current.done = true;
      return;
    }
    opening.current.tries += 1;
    openingTarget.current = target;
    map.current?.animateToRegion({ latitude: target.lat, longitude: target.lng, latitudeDelta: OPENING_DELTA, longitudeDelta: OPENING_DELTA }, 1);
    const t = setTimeout(() => setRecheck((n) => n + 1), OPENING_CHECK_MS);
    return () => clearTimeout(t);
  }, [center, ready, recheck]);

  // Follow-me camera: slide the map (same zoom and heading) so the rider stays in the open part of
  // the map between the panels. Moves under a couple of meters are GPS jitter and skipped.
  useEffect(() => {
    if (!followMe) {
      followed.current = null;
      return;
    }
    // Until the opening move lands, it does the centering: the follow camera keeps the zoom, which
    // on a cold start is still the whole state.
    if (openingMoveWanted(opening.current, followMe)) return;
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
      onMapReady={() => setReady(true)}
      showsCompass
      showsScale
      tintColor={Colors.text}
      initialRegion={center ? { latitude: center.lat, longitude: center.lng, latitudeDelta: OPENING_DELTA, longitudeDelta: OPENING_DELTA } : { latitude: 39.5, longitude: -105.8, latitudeDelta: 6, longitudeDelta: 6 }}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        trail.mapProps.onLayout(e);
      }}
      onPanDrag={() => {
        opening.current.userMoved = true;
        onUserMove?.();
      }}
      onRegionChangeComplete={(r, details) => {
        if (details?.isGesture) {
          opening.current.userMoved = true;
          onUserMove?.();
        }
        region.current = r;
        const target = openingTarget.current;
        if (target && !opening.current.done && openingReached(r, target)) opening.current.done = true;
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
      onLongPress={(e) => {
        const c = e.nativeEvent.coordinate;
        if (onLongPressMap) onLongPressMap({ lat: c.latitude, lng: c.longitude });
        else trail.identifyAt(c.latitude, c.longitude);
      }}>
      <TrailTiles trail={trail} />
      <OwnHeadingMarker own={own} mapHeading={mapHeading} />
      {(trackLines ?? []).map((d) => d.pieces.map((piece, i) => (
        <Polyline key={`t${d.key}${i}`} coordinates={toCoords(piece)} strokeColor={d.color} strokeWidth={4} zIndex={3} tappable={false} />
      )))}
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
      {(waypoints ?? []).map((w) => (
        <Marker
          key={`w-${w.id}`}
          coordinate={{ latitude: w.lat, longitude: w.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={(e) => {
            e.stopPropagation?.();
            onPressWaypoint?.(w);
          }}
          accessibilityLabel={w.planned_stop ? `Planned stop ${stopNumber(w, waypoints ?? [])}, ${w.name}, ${symbolLabel(waypointSymbol(w))}` : `${symbolLabel(waypointSymbol(w))} waypoint, ${w.name}`}
          zIndex={w.planned_stop ? 4 : w.shared ? 3 : 2}>
          {w.planned_stop ? (
            <StopPin name={w.name} n={stopNumber(w, waypoints ?? [])} time={stopTimeLabel(w.stop_time)} symbol={waypointSymbol(w)} />
          ) : (
            <WaypointPin name={w.name} symbol={waypointSymbol(w)} shared={w.shared} />
          )}
        </Marker>
      ))}
      {measureTaps.map((p, i) => (
        <Marker key={`m${i}`} coordinate={{ latitude: p.lat, longitude: p.lng }} anchor={{ x: 0.5, y: 0.5 }} tappable={false} zIndex={7}>
          <View style={styles.pin}><Text style={styles.pinText}>{i + 1}</Text></View>
        </Marker>
      ))}
      {(obstacles ?? []).map((o) => (
        <Marker
          key={o.id}
          coordinate={{ latitude: o.lat, longitude: o.lng }}
          anchor={{ x: 0.5, y: 1 }}
          zIndex={8}
          onPress={() => onObstacle?.(o)}
          accessibilityLabel={o.name}>
          <MarkerBody style={{ alignItems: 'center', maxWidth: 180 }}>
            <Text style={[styles.obstacle, { borderColor: OBSTACLE_INK[o.kind] }]} numberOfLines={1}>{o.name}</Text>
            <View style={[styles.obstacleDot, { backgroundColor: OBSTACLE_INK[o.kind] }]} />
          </MarkerBody>
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

const styles = themedStyles(() => ({
  pin: {
    minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 2.5, borderColor: MEASURE_INK,
  },
  pinText: { color: Colors.text, fontFamily: font(800), fontSize: 11 },
  found: { color: Colors.background, backgroundColor: MEASURE_INK, fontFamily: font(700), fontSize: 13, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  obstacle: {
    color: MapLabelText, backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1.5, fontFamily: font(700), fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, overflow: 'hidden',
  },
  obstacleDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3, borderWidth: 2, borderColor: Colors.background },
  foundDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: MEASURE_INK, borderWidth: 2, borderColor: Colors.background },
}));
