import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Colors, font, themedStyles } from '@/constants/theme';
import { followCamShouldMove } from '@/core/follow-camera';
import type { LatLng } from '@/core/geo';
import { followCamDurationMs } from '@/core/glide';
import { OBSTACLE_INK, type Obstacle } from '@/core/obstacles';
import type { Place } from '@/core/places';
import type { DayLine } from '@/core/track-line';
import { snapRadiusM } from '@/core/trail-router';
import { symbolLabel, waypointSymbol } from '@/core/waypoint-symbols';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { track } from '@/lib/analytics';
import { useFollowCamera } from './use-follow-camera';
import { MapboxMap, MapboxMarker, type MapLine, type MapboxMapHandle } from './mapbox-map';
import { StopPin, WaypointPin } from './waypoint-blaze';

import { t } from '@/lib/i18n';
export type NavMapHandle = { centerOn: (p: LatLng) => void; fit: (points: LatLng[]) => void };

const RECORD_INK = '#F6F1E3';
const MEASURE_INK = '#ECCD91';
const FOLLOW_MS = followCamDurationMs(1000);

/**
 * Map Mode on Mapbox: the trail being recorded, a followed trail, Track Line, the distance
 * finder, obstacles and a search result, in the rider's look (satellite, topo or 3D Terrain's
 * raised ground). Same props as the flat Map Mode map (nav-map.tsx), so the screen doesn't care
 * which one draws.
 */
export function NavMapboxMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, followMe, onUserMove,
  trackLines, obstacles, onObstacle, waypoints, onPressWaypoint, onLongPressMap, ref,
}: {
  trail: TrailMap;
  recorded: LatLng[];
  following: LatLng[] | null;
  measure: LatLng[];
  measureTaps: LatLng[];
  measuring: boolean;
  onMeasure: (p: LatLng, snapM: number) => void;
  center: LatLng | null;
  found?: Place | null;
  onCenter?: (c: LatLng) => void;
  padding?: [number, number, number, number];
  followMe?: LatLng | null;
  onUserMove?: () => void;
  /** The flat maps draw the rider's arrow from this; the Mapbox map draws your dot (with its arrow) itself. */
  meHeading?: number | null;
  trackLines?: DayLine[];
  obstacles?: Obstacle[];
  onObstacle?: (o: Obstacle) => void;
  /** Waypoints on the map: Map Mode's own, and the ride's when the rider is on a live group ride. */
  waypoints?: Waypoint[];
  onPressWaypoint?: (w: Waypoint) => void;
  /** Press and hold (right-click on the website): when set, called instead of looking up the trail there. */
  onLongPressMap?: (p: LatLng) => void;
  ref?: Ref<NavMapHandle>;
}) {
  const map = useRef<MapboxMapHandle>(null);
  // How many riders open a Mapbox map, and in which look (Admin > Analytics), to watch Mapbox's free allowance.
  useEffect(() => {
    track('mapbox_map_opened', { platform: Platform.OS, screen: 'map_mode', look: trail.look });
    // Once per map, not per look change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pad = padding ?? [120, 50, 320, 50];
  const inset = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };
  const [ready, setReady] = useState(false);
  const centered = useRef(false);
  const followed = useRef<LatLng | null>(null);
  // Meters per point where the map last came to rest, for the distance finder's snap radius.
  const mpp = useRef(12);

  const cam = useFollowCamera(map);
  useImperativeHandle(ref, () => ({
    centerOn(p) {
      followed.current = p;
      // Center on Me allows the one zoom out again.
      cam.stop();
      map.current?.centerOn(p, undefined, { zoom: 13.5 });
    },
    fit(points) {
      if (points.length >= 2) map.current?.fit(points, inset);
    },
  }));

  // Open on the rider the first time their location is known.
  useEffect(() => {
    if (!center || !ready || centered.current) return;
    centered.current = true;
    map.current?.centerOn(center, inset, { animated: false, zoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, ready]);

  // Follow-me camera (core/follow-camera): zoom out once, then move the map to keep the dot on
  // screen, and zoom in at intersections when that's on. Course and speed come from the map's own fix.
  const own = useRef<{ course: number | null; speed: number | null }>({ course: null, speed: null });
  useEffect(() => {
    if (!followMe) {
      if (followed.current) cam.stop();
      followed.current = null;
      return;
    }
    if (!followCamShouldMove(followed.current, followMe)) return;
    if (!followed.current) {
      followed.current = followMe;
      cam.start(followMe, inset);
      return;
    }
    // Only a fix the camera used counts as followed (a step still running skips this one).
    void cam.step({ ...followMe, ...own.current }, inset, FOLLOW_MS).then((took) => {
      if (took && followed.current) followed.current = followMe;
    });
    // Only when the followed spot moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followMe]);

  useEffect(() => {
    if (!found) return;
    const b = found.bounds;
    if (b) map.current?.fit([{ lat: b.north, lng: b.west }, { lat: b.south, lng: b.east }], inset);
    else map.current?.centerOn(found, inset, { zoom: 13.5, duration: 700 });
    // Only when a new place is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const lines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = [];
    for (const d of trackLines ?? []) out.push({ id: `track-${d.key}`, points: d.pieces, color: d.color, width: 4 });
    if (following && following.length > 1) out.push({ id: 'following', points: following, color: Colors.accent, width: 5, casing: Colors.background, casingWidth: 9 });
    if (recorded.length > 1) out.push({ id: 'recorded', points: recorded, color: RECORD_INK, width: 4.5, casing: Colors.background, casingWidth: 8 });
    if (measure.length > 1) out.push({ id: 'measure', points: measure, color: MEASURE_INK, width: 3.5, casing: Colors.background, casingWidth: 7, dash: [8, 5] });
    return out;
  }, [trackLines, following, recorded, measure]);

  return (
    <MapboxMap
      ref={map}
      trail={trail}
      initial={center ? { center, zoom: 13 } : null}
      lines={lines}
      onPress={(p) => (measuring ? onMeasure(p, snapRadiusM(mpp.current)) : trail.identifyAt(p.lat, p.lng))}
      onLongPress={(p) => (onLongPressMap ? onLongPressMap(p) : trail.identifyAt(p.lat, p.lng))}
      onUserMove={onUserMove}
      scaleBar
      onReady={() => setReady(true)}
      onOwnFix={(f) => {
        own.current = { course: f.course, speed: f.speed };
      }}
      onIdle={(c) => {
        mpp.current = c.metersPerPoint;
        onCenter?.(c.center);
      }}>
      {following && following.length > 1 ? (
        <>
          <MapboxMarker at={following[0]}><View accessible accessibilityLabel={t('Start')} style={[styles.end, { backgroundColor: '#34C759' }]} /></MapboxMarker>
          <MapboxMarker at={following[following.length - 1]}>
            <View accessible accessibilityLabel={t('Finish')} style={[styles.end, { backgroundColor: Colors.text }]}><View style={styles.finishCore} /></View>
          </MapboxMarker>
        </>
      ) : null}
      {(waypoints ?? []).map((w) => (
        <MapboxMarker key={`w-${w.id}`} at={w}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.planned_stop ? t('Planned stop {v}, {name}, {v2}', { v: stopNumber(w, waypoints ?? []), name: w.name, v2: symbolLabel(waypointSymbol(w)) }) : t('{v} waypoint, {name}', { v: symbolLabel(waypointSymbol(w)), name: w.name })}
            onPress={() => onPressWaypoint?.(w)}>
            {w.planned_stop ? (
              <StopPin name={w.name} n={stopNumber(w, waypoints ?? [])} time={stopTimeLabel(w.stop_time)} symbol={waypointSymbol(w)} />
            ) : (
              <WaypointPin name={w.name} symbol={waypointSymbol(w)} shared={w.shared} />
            )}
          </Pressable>
        </MapboxMarker>
      ))}
      {measureTaps.map((p, i) => (
        <MapboxMarker key={`m${i}`} at={p}>
          <View style={styles.pin}><Text style={styles.pinText}>{i + 1}</Text></View>
        </MapboxMarker>
      ))}
      {waypoints?.map((w) => (
        <MapboxMarker key={`w-${w.id}`} at={w}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.planned_stop ? t('Planned stop {v}, {name}', { v: stopNumber(w, waypoints), name: w.name }) : t('{v} waypoint, {name}', { v: symbolLabel(waypointSymbol(w)), name: w.name })}
            onPress={() => onPressWaypoint?.(w)}>
            {w.planned_stop ? (
              <StopPin name={w.name} n={stopNumber(w, waypoints)} time={stopTimeLabel(w.stop_time)} symbol={waypointSymbol(w)} />
            ) : (
              <WaypointPin name={w.name} symbol={waypointSymbol(w)} shared={w.shared} />
            )}
          </Pressable>
        </MapboxMarker>
      ))}
      {(obstacles ?? []).map((o) => (
        <MapboxMarker key={o.id} at={o} anchor={{ x: 0.5, y: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={o.name} onPress={() => onObstacle?.(o)} style={{ alignItems: 'center', maxWidth: 180 }}>
            <Text style={[styles.obstacle, { borderColor: OBSTACLE_INK[o.kind] }]} numberOfLines={1}>{o.name}</Text>
            <View style={[styles.obstacleDot, { backgroundColor: OBSTACLE_INK[o.kind] }]} />
          </Pressable>
        </MapboxMarker>
      ))}
      {found ? (
        <MapboxMarker at={found} anchor={{ x: 0.5, y: 1 }}>
          <View accessible accessibilityLabel={t('Search result: {name}', { name: found.name })} style={{ alignItems: 'center', maxWidth: 220 }}>
            <Text style={styles.found} numberOfLines={1}>{found.name}</Text>
            <View style={styles.foundDot} />
          </View>
        </MapboxMarker>
      ) : null}
    </MapboxMap>
  );
}

const styles = themedStyles(() => ({
  end: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  finishCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.background },
  pin: {
    minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 2.5, borderColor: MEASURE_INK,
  },
  pinText: { color: Colors.text, fontFamily: font(800), fontSize: 11 },
  found: { color: Colors.background, backgroundColor: MEASURE_INK, fontFamily: font(700), fontSize: 13, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  obstacle: {
    color: Colors.text, backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1.5, fontFamily: font(700), fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, overflow: 'hidden',
  },
  obstacleDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3, borderWidth: 2, borderColor: Colors.background },
  foundDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: MEASURE_INK, borderWidth: 2, borderColor: Colors.background },
}));
