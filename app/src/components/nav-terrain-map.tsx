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
import type { TrailMap } from '@/hooks/use-trail-map';
import { track } from '@/lib/analytics';
import { TerrainMap, TerrainMarker, type TerrainLine, type TerrainMapHandle } from './terrain-map';

export type NavMapHandle = { centerOn: (p: LatLng) => void; fit: (points: LatLng[]) => void };

const RECORD_INK = '#F6F1E3';
const MEASURE_INK = '#ECCD91';
const FOLLOW_MS = followCamDurationMs(1000);

/**
 * Map Mode in 3D Terrain: the trail being recorded, a followed trail, Track Line, the distance
 * finder, obstacles and a search result, on Mapbox's raised satellite ground. Same props as the
 * flat Map Mode map (nav-map.tsx), so the screen doesn't care which one draws.
 */
export function NavTerrainMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, followMe, onUserMove, meHeading,
  trackLines, obstacles, onObstacle, ref,
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
  meHeading?: number | null;
  trackLines?: DayLine[];
  obstacles?: Obstacle[];
  onObstacle?: (o: Obstacle) => void;
  ref?: Ref<NavMapHandle>;
}) {
  const map = useRef<TerrainMapHandle>(null);
  // How many riders use 3D Terrain (Admin > Analytics), to watch Mapbox's free allowance.
  useEffect(() => {
    track('terrain_3d_opened', { platform: Platform.OS, screen: 'map_mode' });
  }, []);
  const pad = padding ?? [120, 50, 320, 50];
  const inset = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };
  const [ready, setReady] = useState(false);
  const centered = useRef(false);
  const followed = useRef<LatLng | null>(null);
  // Meters per point where the map last came to rest, for the distance finder's snap radius.
  const mpp = useRef(12);

  useImperativeHandle(ref, () => ({
    centerOn(p) {
      followed.current = p;
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

  // Follow-me camera, as on the flat map.
  useEffect(() => {
    if (!followMe) {
      followed.current = null;
      return;
    }
    if (!followCamShouldMove(followed.current, followMe)) return;
    followed.current = followMe;
    map.current?.centerOn(followMe, inset, { duration: FOLLOW_MS });
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

  const lines = useMemo<TerrainLine[]>(() => {
    const out: TerrainLine[] = [];
    for (const d of trackLines ?? []) out.push({ id: `track-${d.key}`, points: d.pieces, color: d.color, width: 4 });
    if (following && following.length > 1) out.push({ id: 'following', points: following, color: Colors.accent, width: 5, casing: Colors.background, casingWidth: 9 });
    if (recorded.length > 1) out.push({ id: 'recorded', points: recorded, color: RECORD_INK, width: 4.5, casing: Colors.background, casingWidth: 8 });
    if (measure.length > 1) out.push({ id: 'measure', points: measure, color: MEASURE_INK, width: 3.5, casing: Colors.background, casingWidth: 7, dash: [8, 5] });
    return out;
  }, [trackLines, following, recorded, measure]);

  return (
    <TerrainMap
      ref={map}
      trail={trail}
      initial={center ? { center, zoom: 13 } : null}
      lines={lines}
      onPress={(p) => (measuring ? onMeasure(p, snapRadiusM(mpp.current)) : trail.identifyAt(p.lat, p.lng))}
      onLongPress={(p) => trail.identifyAt(p.lat, p.lng)}
      onUserMove={onUserMove}
      onReady={() => setReady(true)}
      onIdle={(c) => {
        mpp.current = c.metersPerPoint;
        onCenter?.(c.center);
      }}>
      {/* The website draws the rider's own dot; the apps' map draws it (with its arrow) itself. */}
      {Platform.OS === 'web' && center ? (
        <TerrainMarker at={center}>
          <View accessible accessibilityLabel="You are here" style={styles.me}>
            {meHeading != null ? <View style={[styles.meArrow, { transform: [{ rotate: `${Math.round(meHeading)}deg` }] }]} /> : null}
          </View>
        </TerrainMarker>
      ) : null}
      {following && following.length > 1 ? (
        <>
          <TerrainMarker at={following[0]}><View accessible accessibilityLabel="Start" style={[styles.end, { backgroundColor: '#34C759' }]} /></TerrainMarker>
          <TerrainMarker at={following[following.length - 1]}>
            <View accessible accessibilityLabel="Finish" style={[styles.end, { backgroundColor: Colors.text }]}><View style={styles.finishCore} /></View>
          </TerrainMarker>
        </>
      ) : null}
      {measureTaps.map((p, i) => (
        <TerrainMarker key={`m${i}`} at={p}>
          <View style={styles.pin}><Text style={styles.pinText}>{i + 1}</Text></View>
        </TerrainMarker>
      ))}
      {(obstacles ?? []).map((o) => (
        <TerrainMarker key={o.id} at={o} anchor={{ x: 0.5, y: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={o.name} onPress={() => onObstacle?.(o)} style={{ alignItems: 'center', maxWidth: 180 }}>
            <Text style={[styles.obstacle, { borderColor: OBSTACLE_INK[o.kind] }]} numberOfLines={1}>{o.name}</Text>
            <View style={[styles.obstacleDot, { backgroundColor: OBSTACLE_INK[o.kind] }]} />
          </Pressable>
        </TerrainMarker>
      ))}
      {found ? (
        <TerrainMarker at={found} anchor={{ x: 0.5, y: 1 }}>
          <View accessible accessibilityLabel={`Search result: ${found.name}`} style={{ alignItems: 'center', maxWidth: 220 }}>
            <Text style={styles.found} numberOfLines={1}>{found.name}</Text>
            <View style={styles.foundDot} />
          </View>
        </TerrainMarker>
      ) : null}
    </TerrainMap>
  );
}

const styles = themedStyles(() => ({
  me: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#2F80FF', borderWidth: 3, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'flex-start',
  },
  meArrow: {
    position: 'absolute', top: -14, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF',
  },
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
