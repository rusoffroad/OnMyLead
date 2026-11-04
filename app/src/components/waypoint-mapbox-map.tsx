import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Colors, font, themedStyles } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
import { symbolLabel, waypointSymbol } from '@/core/waypoint-symbols';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MapboxMap, MapboxMarker, type MapLine, type MapboxMapHandle } from './mapbox-map';
import { StopPin, WaypointPin } from './waypoint-blaze';

import { t } from '@/lib/i18n';
const FOUND_INK = '#ECCD91';

/**
 * The ride's waypoints on Mapbox (apps and website), with the route under them. Press and hold
 * (right-click on the website) anywhere to drop a new one; tap a blaze to open it. Same props as
 * the flat waypoint map (waypoint-map.tsx).
 */
export function WaypointMapboxMap({
  waypoints, route, center, trail, onPressWaypoint, onLongPressMap, padding, found, onCenter,
}: {
  waypoints: Waypoint[];
  route?: LatLng[] | null;
  center: LatLng | null;
  trail: TrailMap;
  onPressWaypoint: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
  padding?: [number, number, number, number];
  found?: Place | null;
  onCenter?: (c: LatLng) => void;
}) {
  const map = useRef<MapboxMapHandle>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);
  const pad = padding ?? [140, 60, 380, 60];
  const inset = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };

  // Frame the route and the waypoints once they've loaded; leave the map alone after that.
  useEffect(() => {
    const pts: LatLng[] = [...(route ?? []), ...waypoints];
    if (!ready || fitted.current || pts.length < 2) return;
    fitted.current = true;
    map.current?.fit(pts, inset, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, route, waypoints]);

  useEffect(() => {
    if (!found || !ready) return;
    const b = found.bounds;
    if (b) map.current?.fit([{ lat: b.north, lng: b.west }, { lat: b.south, lng: b.east }], inset);
    else map.current?.centerOn(found, inset, { zoom: 14, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, ready]);

  const lines = useMemo<MapLine[]>(
    () => (route && route.length > 1 ? [{ id: 'route', points: route, color: Colors.accent, width: 5, casing: Colors.background, casingWidth: 9 }] : []),
    [route],
  );

  return (
    <MapboxMap
      ref={map}
      trail={trail}
      tilt={false}
      initial={center ? { center, zoom: 12.5 } : null}
      lines={lines}
      onReady={() => setReady(true)}
      // On the website a click drops a waypoint (as its map always has); a right-click looks up the trail.
      onPress={Platform.OS === 'web' ? onLongPressMap : undefined}
      onLongPress={Platform.OS === 'web' ? undefined : onLongPressMap}
      onIdle={(c) => onCenter?.(c.center)}>
      {route && route.length > 1 ? (
        <>
          <MapboxMarker at={route[0]}><View accessible accessibilityLabel={t('Start')} style={[styles.end, { backgroundColor: '#3CC36B' }]} /></MapboxMarker>
          <MapboxMarker at={route[route.length - 1]}>
            <View accessible accessibilityLabel={t('Finish')} style={[styles.end, { backgroundColor: Colors.text }]}><View style={styles.finishCore} /></View>
          </MapboxMarker>
        </>
      ) : null}
      {found ? (
        <MapboxMarker at={found} anchor={{ x: 0.5, y: 1 }}>
          <View accessible accessibilityLabel={t('Search result: {name}', { name: found.name })} style={styles.found}>
            <Text style={styles.foundText} numberOfLines={1}>{found.name}</Text>
            <View style={styles.foundStem} />
            <View style={styles.foundDot} />
          </View>
        </MapboxMarker>
      ) : null}
      {waypoints.map((w) => (
        <MapboxMarker key={`w-${w.id}`} at={w}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.planned_stop ? t('Planned stop {v}, {name}, {v2}', { v: stopNumber(w, waypoints), name: w.name, v2: symbolLabel(waypointSymbol(w)) }) : t('{v} waypoint, {name}', { v: symbolLabel(waypointSymbol(w)), name: w.name })}
            onPress={() => onPressWaypoint(w)}>
            {w.planned_stop ? (
              <StopPin name={w.name} n={stopNumber(w, waypoints)} time={stopTimeLabel(w.stop_time)} symbol={waypointSymbol(w)} />
            ) : (
              <WaypointPin name={w.name} symbol={waypointSymbol(w)} shared={w.shared} />
            )}
          </Pressable>
        </MapboxMarker>
      ))}
    </MapboxMap>
  );
}

const styles = themedStyles(() => ({
  end: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  finishCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.background },
  found: { alignItems: 'center', maxWidth: 220 },
  foundText: {
    color: Colors.background, backgroundColor: FOUND_INK, fontFamily: font(700), fontSize: 13,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden',
  },
  foundStem: { width: 2, height: 10, backgroundColor: FOUND_INK },
  foundDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: FOUND_INK, borderWidth: 2, borderColor: Colors.background },
}));
