import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Colors, font, themedStyles } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MapboxMap, MapboxMarker, type MapLine, type MapboxMapHandle } from './mapbox-map';

const PENDING_INK = '#F1F4F8';
const FOUND_INK = '#ECCD91';

/**
 * The route builder's map on Mapbox (apps and website): tap to add the next point, drag a
 * numbered point to move it; an imported track is shown as is. Same props as the flat route
 * builder map (route-builder-map.tsx), so the screen doesn't care which one draws.
 */
export function RouteBuilderMapboxMap({
  points, waypoints, center, editable, onAdd, onMove, trail, pending = [], padding, found, onCenter,
}: {
  points: LatLng[];
  waypoints: LatLng[];
  center: LatLng | null;
  editable: boolean;
  onAdd: (p: LatLng, snapM: number) => void;
  onMove: (index: number, p: LatLng, snapM: number) => void;
  pending?: LatLng[][];
  trail: TrailMap;
  padding?: [number, number, number, number];
  found?: Place | null;
  onCenter?: (c: LatLng) => void;
}) {
  const map = useRef<MapboxMapHandle>(null);
  const [ready, setReady] = useState(false);
  const fittedTo = useRef<LatLng[] | null>(null);
  // Meters per point where the map last came to rest, for how far a tap may snap to a trail.
  const mpp = useRef(12);
  const pad = padding ?? [140, 50, 320, 50];
  const inset = { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] };

  // Frame a newly loaded or imported route once; leave the map alone while the leader taps.
  useEffect(() => {
    if (!ready || points.length < 2 || fittedTo.current === points || waypoints.length) return;
    fittedTo.current = points;
    map.current?.fit(points, inset);
    // Only when the route itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, waypoints.length]);

  // Go to a searched place: the whole area when it has one, else close in on the spot.
  useEffect(() => {
    if (!found || !ready) return;
    const b = found.bounds;
    if (b) map.current?.fit([{ lat: b.north, lng: b.west }, { lat: b.south, lng: b.east }], inset);
    else map.current?.centerOn(found, inset, { zoom: 14, duration: 700 });
    // Only when a new place is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, ready]);

  const lines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = [];
    if (points.length > 1) out.push({ id: 'route', points, color: Colors.accent, width: 5, casing: Colors.background, casingWidth: 9 });
    if (pending.length) out.push({ id: 'pending', points: pending, color: PENDING_INK, width: 3, dash: [6, 6] });
    return out;
  }, [points, pending]);

  const ends = points.length > 1 && !waypoints.length;
  return (
    <MapboxMap
      ref={map}
      trail={trail}
      tilt={false}
      initial={center ? { center, zoom: 12.5 } : null}
      lines={lines}
      onReady={() => setReady(true)}
      onPress={(p) => (editable ? onAdd(p, snapRadiusM(mpp.current)) : trail.identifyAt(p.lat, p.lng))}
      onLongPress={(p) => trail.identifyAt(p.lat, p.lng)}
      onIdle={(c) => {
        mpp.current = c.metersPerPoint;
        onCenter?.(c.center);
      }}>
      {ends ? (
        <>
          <MapboxMarker at={points[0]}><View accessible accessibilityLabel="Start" style={[styles.end, { backgroundColor: '#3CC36B' }]} /></MapboxMarker>
          <MapboxMarker at={points[points.length - 1]}>
            <View accessible accessibilityLabel="Finish" style={[styles.end, { backgroundColor: Colors.text }]}><View style={styles.finishCore} /></View>
          </MapboxMarker>
        </>
      ) : null}
      {found ? (
        <MapboxMarker at={found} anchor={{ x: 0.5, y: 1 }}>
          <View accessible accessibilityLabel={`Search result: ${found.name}`} style={styles.found}>
            <Text style={styles.foundText} numberOfLines={1}>{found.name}</Text>
            <View style={styles.foundStem} />
            <View style={styles.foundDot} />
          </View>
        </MapboxMarker>
      ) : null}
      {waypoints.map((w, i) => {
        const last = i === waypoints.length - 1 && i > 0;
        return (
          <MapboxMarker key={`p${i}`} id={`route-point-${i}`} at={w} draggable={editable} onDragEnd={(p) => onMove(i, p, snapRadiusM(mpp.current))}>
            <View accessible accessibilityLabel={`Point ${i + 1}${editable ? ', drag to move' : ''}`} style={[styles.pin, i === 0 && styles.first, last && styles.last]}>
              <Text style={[styles.num, last && { color: Colors.background }]}>{i + 1}</Text>
            </View>
          </MapboxMarker>
        );
      })}
    </MapboxMap>
  );
}

const styles = themedStyles(() => ({
  pin: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 2.5, borderColor: Colors.accent,
  },
  first: { backgroundColor: '#3CC36B', borderColor: Colors.background },
  last: { backgroundColor: Colors.text, borderColor: Colors.background },
  num: { color: '#fff', fontFamily: font(800), fontSize: 12 },
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
