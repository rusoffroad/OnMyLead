import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { Colors, RideColors } from '@/constants/theme';
import { followCamShouldMove } from '@/core/follow-camera';
import { followCamDurationMs } from '@/core/glide';
import type { LatLng } from '@/core/geo';
import { cameraCenterFor, fitInset, isFarOut, openMapCenter, rideViewCorners } from '@/core/map-center';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import { symbolLabel, waypointSymbol } from '@/core/waypoint-symbols';
import type { TrailMap } from '@/hooks/use-trail-map';
import type { GroupMapHandle, MapRider } from './group-map-types';
import { GroupMapboxMap } from './group-mapbox-map';
import { OwnHeadingMarker, useOwnLocation } from './own-heading';
import { RiderMarker } from './rider-marker';
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

type GroupMapProps = Parameters<typeof FlatGroupMap>[0];

/**
 * Ride Mode's live map: Mapbox when this build and the owner allow it and it can draw here
 * (use-trail-map mapbox), otherwise the flat Apple or Google map below.
 */
export function GroupMap(props: GroupMapProps) {
  if (props.trail?.mapbox) {
    return <GroupMapboxMap {...props} trail={props.trail} edgePadding={props.edgePadding ?? FIT_PADDING} />;
  }
  return <FlatGroupMap {...props} />;
}

/**
 * Live group map. Every rider is the same grey dot with their ride name beside it; the leader is
 * the one bigger blue dot, so a glance finds them. A yellow or red ring means Ride Bubble trouble,
 * and an amber wrench means a Mechanical Issue. A rider whose last fix is over a minute old is
 * drawn hollow at where they were last seen, with the age on the tag, so an old position never
 * passes for a live one.
 */
function FlatGroupMap({
  riders, regroup, route, meId, onPressRider, trail, waypoints, onPressWaypoint, onLongPressMap, edgePadding = FIT_PADDING, fallback,
  onReady, onUserMove, follow, locationEveryMs = 1000, ref,
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
  /** Where to open when there is no rider or route to frame yet (the meeting point). */
  fallback?: LatLng | null;
  /** The map is laid out and can be moved. */
  onReady?: () => void;
  /** The rider dragged, pinched or turned the map themselves. */
  onUserMove?: () => void;
  /**
   * Follow Me: while set, the map keeps the rider's own dot in the open map (between the panels
   * given by `inset`) as they move. Null or missing: the map stays where it is.
   */
  follow?: { inset: { top: number; right: number; bottom: number; left: number } } | null;
  /** How often Android reports the phone's own dot (iPhone and iPad report it as it moves). */
  locationEveryMs?: number;
  /** Lets Ride Mode center the map on the rider (when it opens, and the center-on-me button). */
  ref?: Ref<GroupMapHandle>;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef<'no' | 'riders' | 'route'>('no');
  const size = useRef({ width: 0, height: 0 });
  // The map's last region, to tell whether it is zoomed far out (null: a fresh map over the world).
  const region = useRef<Region | null>(null);
  const userMoved = () => {
    // Once the rider moves the map, no automatic framing moves it again.
    fitted.current = 'route';
    onUserMove?.();
  };
  // How far the map is turned from north, so heading arrows stay true on a rotated map.
  const [mapHeading, setMapHeading] = useState(0);
  const readHeading = () => {
    // In 5-degree steps: a turn smaller than that doesn't change the arrows, so the pins stay put.
    map.current?.getCamera().then((c) => setMapHeading(Math.round((c.heading ?? 0) / 5) * 5 % 360)).catch(() => {});
  };

  // Center the map on a point in the open map; far out over a state or the world, zoom in too.
  const centerMap = useCallback(async (
    p: LatLng,
    inset: { top: number; right: number; bottom: number; left: number },
    opts?: { animated?: boolean; duration?: number },
  ) => {
    const m = map.current;
    if (!m) return;
    // From here on the rider's own spot is the framing; a later group framing must not undo it.
    fitted.current = 'route';
    const { width, height } = size.current;
    const target = { latitude: p.lat, longitude: p.lng };
    if (isFarOut(region.current, width || 390)) {
      // Zoomed out over a state or the world (a fresh map opens over the world): zoom in to
      // riding distance too, with the rider in the middle of the open map.
      const corners = rideViewCorners(p).map((c) => ({ latitude: c.lat, longitude: c.lng }));
      m.fitToCoordinates(corners, { edgePadding: fitInset(size.current, inset), animated: opts?.animated ?? true });
      return;
    }
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
      m.animateCamera({ center: { latitude: c.lat, longitude: c.lng } }, { duration: opts?.duration ?? 450 });
    } catch {
      // No reading from the map (not laid out yet): centre on the whole map instead.
      m.animateCamera({ center: target }, { duration: opts?.duration ?? 450 });
    }
  }, []);

  // Follow Me: each time the phone's own dot moves a real step, slide the map (same zoom and
  // turn) so the dot stays in the open map. Moves under a couple of meters are GPS jitter.
  const followRef = useRef(follow);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);
  const followed = useRef<LatLng | null>(null);
  const everyMs = useRef(locationEveryMs);
  useEffect(() => {
    everyMs.current = locationEveryMs;
  }, [locationEveryMs]);
  // One press handler for every rider pin, so a new handler each render doesn't redraw them all.
  const pressRider = useRef(onPressRider);
  useEffect(() => {
    pressRider.current = onPressRider;
  }, [onPressRider]);
  const onRiderPress = useCallback((id: string) => pressRider.current?.(id), []);
  const own = useOwnLocation(useCallback((f: LatLng) => {
    const fl = followRef.current;
    if (!fl || !followCamShouldMove(followed.current, f)) return;
    followed.current = { lat: f.lat, lng: f.lng };
    // As long as the phone takes to report the next spot, so the map moves in one steady glide.
    centerMap(f, fl.inset, { duration: followCamDurationMs(everyMs.current) });
  }, [centerMap]));
  // Follow Me just came on (or back on): go to the rider at once rather than at their next step.
  const followOn = !!follow;
  useEffect(() => {
    if (!followOn) {
      followed.current = null;
      return;
    }
    const f = own.last.current;
    if (f && followRef.current) {
      followed.current = { lat: f.lat, lng: f.lng };
      centerMap(f, followRef.current.inset);
    }
  }, [followOn, own, centerMap]);

  useImperativeHandle(ref, () => ({
    centerOn: (p, inset, opts) => centerMap(p, inset, opts),
  }), [centerMap]);

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
    } else if (fitted.current === 'no' && !pts.length && fallback) {
      // Nobody to frame yet: open on the meeting point rather than over the whole world.
      map.current?.fitToCoordinates(around({ latitude: fallback.lat, longitude: fallback.lng }), { edgePadding, animated: false });
      fitted.current = 'riders';
    }
  }, [riders, route, edgePadding, fallback]);

  return (
    <MapView ref={map} style={StyleSheet.absoluteFill}
      showsUserLocation showsCompass mapType="hybrid" tintColor={Colors.text} {...trail?.mapProps}
      onUserLocationChange={own.onUserLocationChange}
      userLocationUpdateInterval={locationEveryMs}
      userLocationFastestInterval={Math.min(locationEveryMs, 1000)}
      onLayout={(e) => {
        // After the trail props, which have their own onLayout that used to replace this one, so
        // the map's size was never known and centering fell back to the whole map's middle.
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        trail?.mapProps.onLayout(e);
      }}
      onMapReady={onReady}
      onPanDrag={userMoved}
      onRegionChangeComplete={(r, details) => {
        region.current = r;
        if (details?.isGesture) userMoved();
        trail?.mapProps.onRegionChangeComplete(r);
        readHeading();
      }}
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
          accessibilityLabel={w.planned_stop ? `Planned stop ${stopNumber(w, waypoints ?? [])}, ${w.name}, ${symbolLabel(waypointSymbol(w))}` : `${symbolLabel(waypointSymbol(w))} waypoint, ${w.name}`}
          zIndex={w.planned_stop ? 4 : w.shared ? 3 : 2}>
          {w.planned_stop ? (
            <StopPin name={w.name} n={stopNumber(w, waypoints ?? [])} time={stopTimeLabel(w.stop_time)} symbol={waypointSymbol(w)} />
          ) : (
            <WaypointPin name={w.name} symbol={waypointSymbol(w)} shared={w.shared} />
          )}
        </Marker>
      ))}
      {riders
        .filter((r) => r.lat != null && r.lng != null && r.id !== meId)
        .map((r) => (
          <RiderMarker key={r.id} rider={r} mapHeading={mapHeading} onPress={onRiderPress} />
        ))}
      <OwnHeadingMarker own={own} mapHeading={mapHeading} />
      {regroup ? (
        <Marker coordinate={{ latitude: regroup.lat, longitude: regroup.lng }} title={regroup.label ?? 'Regroup here'} pinColor={RideColors.yellow} />
      ) : null}
    </MapView>
  );
}
