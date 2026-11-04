import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Colors, RideColors, themedStyles } from '@/constants/theme';
import { followCamShouldMove } from '@/core/follow-camera';
import type { LatLng } from '@/core/geo';
import { followCamDurationMs } from '@/core/glide';
import { symbolLabel, waypointSymbol } from '@/core/waypoint-symbols';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { track } from '@/lib/analytics';
import type { GroupMapHandle, MapRider } from './group-map-types';
import { useGlide } from './rider-marker';
import { RiderPin } from './rider-pin';
import { TerrainMap, TerrainMarker, type TerrainLine, type TerrainMapHandle, type TerrainOwnFix } from './terrain-map';
import { StopPin, WaypointPin } from './waypoint-blaze';

import { t } from '@/lib/i18n';
type Inset = { top: number; right: number; bottom: number; left: number };

/**
 * Ride Mode's live map in 3D Terrain: the same riders, route, waypoints and regroup pin as the
 * flat map (group-map.tsx), framed and followed the same way, on Mapbox's raised satellite ground.
 */
export function GroupTerrainMap({
  riders, regroup, route, meId, onPressRider, trail, waypoints, onPressWaypoint, onLongPressMap, edgePadding, fallback,
  onReady, onUserMove, follow, locationEveryMs = 1000, ref,
}: {
  riders: MapRider[];
  meId?: string;
  route?: LatLng[] | null;
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
  trail: TrailMap;
  waypoints?: Waypoint[];
  onPressWaypoint?: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
  edgePadding: Inset;
  fallback?: LatLng | null;
  onReady?: () => void;
  onUserMove?: () => void;
  follow?: { inset: Inset } | null;
  locationEveryMs?: number;
  ref?: Ref<GroupMapHandle>;
}) {
  const map = useRef<TerrainMapHandle>(null);
  // How many riders use 3D Terrain (Admin > Analytics), to watch Mapbox's free allowance.
  useEffect(() => {
    track('terrain_3d_opened', { platform: Platform.OS, screen: 'ride_mode' });
  }, []);
  const [ready, setReady] = useState(false);
  const fitted = useRef<'no' | 'riders' | 'route'>('no');
  const [mapHeading, setMapHeading] = useState(0);
  const lastFix = useRef<LatLng | null>(null);
  const followed = useRef<LatLng | null>(null);
  const followRef = useRef(follow);
  const everyMs = useRef(locationEveryMs);
  useEffect(() => {
    followRef.current = follow;
    everyMs.current = locationEveryMs;
  }, [follow, locationEveryMs]);

  const userMoved = useCallback(() => {
    fitted.current = 'route';
    onUserMove?.();
  }, [onUserMove]);

  useImperativeHandle(ref, () => ({
    centerOn: async (p, inset, opts) => {
      fitted.current = 'route';
      map.current?.centerOn(p, inset, opts);
    },
  }), []);

  // Follow Me: keep the rider's own spot in the open map as they move (jitter under a couple of meters skipped).
  const onOwnFix = useCallback((f: TerrainOwnFix) => {
    lastFix.current = { lat: f.lat, lng: f.lng };
    const fl = followRef.current;
    if (!fl || !followCamShouldMove(followed.current, f)) return;
    followed.current = { lat: f.lat, lng: f.lng };
    fitted.current = 'route';
    map.current?.centerOn(f, fl.inset, { duration: followCamDurationMs(everyMs.current) });
  }, []);
  const followOn = !!follow;
  useEffect(() => {
    if (!followOn) {
      followed.current = null;
      return;
    }
    const f = lastFix.current;
    if (f && followRef.current) {
      followed.current = f;
      map.current?.centerOn(f, followRef.current.inset);
    }
  }, [followOn]);

  // Frame the group (and the route) once, as the flat map does; then the rider's moves win.
  useEffect(() => {
    if (!ready) return;
    const pts: LatLng[] = riders.filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat!, lng: r.lng! }));
    if (route?.length) pts.push(...route);
    const want = route?.length ? 'route' : 'riders';
    if (fitted.current !== want && fitted.current !== 'route' && pts.length) {
      map.current?.fit(pts, edgePadding, false);
      fitted.current = want;
    } else if (fitted.current === 'no' && !pts.length && fallback) {
      map.current?.fit([fallback], edgePadding, false);
      fitted.current = 'riders';
    }
  }, [ready, riders, route, edgePadding, fallback]);

  const lines = useMemo<TerrainLine[]>(
    () => (route && route.length > 1 ? [{ id: 'route', points: route, color: Colors.accent, width: 5, casing: Colors.background, casingWidth: 9 }] : []),
    [route],
  );
  const pressRider = useRef(onPressRider);
  useEffect(() => {
    pressRider.current = onPressRider;
  }, [onPressRider]);
  const onRider = useCallback((id: string) => pressRider.current?.(id), []);

  return (
    <TerrainMap
      ref={map}
      trail={trail}
      initial={fallback ? { center: fallback } : null}
      lines={lines}
      onLongPress={onLongPressMap}
      onUserMove={userMoved}
      onReady={() => {
        setReady(true);
        onReady?.();
      }}
      onCamera={(c) => setMapHeading(c.heading)}
      onOwnFix={onOwnFix}>
      {route && route.length > 1 ? <RouteEnds3d points={route} /> : null}
      {waypoints?.map((w) => (
        <TerrainMarker key={`w-${w.id}`} at={w}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.planned_stop ? t('Planned stop {v}, {name}, {v2}', { v: stopNumber(w, waypoints), name: w.name, v2: symbolLabel(waypointSymbol(w)) }) : `${symbolLabel(waypointSymbol(w))} waypoint, ${w.name}`}
            onPress={() => onPressWaypoint?.(w)}>
            {w.planned_stop ? (
              <StopPin name={w.name} n={stopNumber(w, waypoints)} time={stopTimeLabel(w.stop_time)} />
            ) : (
              <WaypointPin name={w.name} symbol={waypointSymbol(w)} shared={w.shared} />
            )}
          </Pressable>
        </TerrainMarker>
      ))}
      {riders
        .filter((r) => r.lat != null && r.lng != null && r.id !== meId)
        .map((r) => (
          <RiderPin3d key={r.id} rider={r} mapHeading={mapHeading} onPress={onRider} />
        ))}
      {regroup ? (
        <TerrainMarker at={{ lat: regroup.lat, lng: regroup.lng }} anchor={{ x: 0.5, y: 1 }}>
          <View accessible accessibilityLabel={regroup.label ?? 'Regroup here'} style={styles.regroup}>
            <View style={styles.regroupDot} />
          </View>
        </TerrainMarker>
      ) : null}
    </TerrainMap>
  );
}

/** A rider's pin, sliding to each new fix like the flat map's (rider-marker useGlide). */
const RiderPin3d = memo(function RiderPin3d({ rider: r, mapHeading, onPress }: { rider: MapRider; mapHeading: number; onPress: (id: string) => void }) {
  const at = useGlide(r.lat!, r.lng!);
  return (
    <TerrainMarker at={at}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.detail}`} onPress={() => onPress(r.id)}>
        <RiderPin rider={r} mapHeading={mapHeading} />
      </Pressable>
    </TerrainMarker>
  );
});

function RouteEnds3d({ points }: { points: LatLng[] }) {
  const a = points[0];
  const b = points[points.length - 1];
  return (
    <>
      <TerrainMarker at={a}>
        <View accessible accessibilityLabel={t('Start')} style={[styles.end, { backgroundColor: RideColors.green }]} />
      </TerrainMarker>
      <TerrainMarker at={b}>
        <View accessible accessibilityLabel={t('Finish')} style={[styles.end, { backgroundColor: Colors.text }]}>
          <View style={styles.finishCore} />
        </View>
      </TerrainMarker>
    </>
  );
}

const styles = themedStyles(() => ({
  end: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  finishCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.background },
  regroup: {
    width: 26, height: 26, borderRadius: 13, borderBottomRightRadius: 2, transform: [{ rotate: '45deg' }],
    backgroundColor: RideColors.yellow, borderWidth: 3, borderColor: Colors.background, alignItems: 'center', justifyContent: 'center',
  },
  regroupDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.background },
}));
