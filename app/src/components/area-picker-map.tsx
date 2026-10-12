import { useCallback, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import MapView, { type Region } from 'react-native-maps';

import { Colors } from '@/constants/theme';
import type { Box } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { TrailTiles } from './trail-tiles';

/**
 * The map behind the area picker. Whatever sits inside the frame (insets from the screen edges)
 * is the area to download; after every pan or zoom the frame's corners are turned into a box.
 */
export function AreaPickerMap({
  trail, frame, start, onBox,
}: {
  trail: TrailMap;
  frame: { top: number; bottom: number; left: number; right: number };
  start: { lat: number; lng: number } | null;
  onBox: (box: Box | null) => void;
}) {
  const map = useRef<MapView>(null);
  const { width, height } = useWindowDimensions();

  const measure = useCallback(
    async (r: Region) => {
      trail.mapProps.onRegionChangeComplete(r);
      try {
        const [nw, se] = await Promise.all([
          map.current!.coordinateForPoint({ x: frame.left, y: frame.top }),
          map.current!.coordinateForPoint({ x: width - frame.right, y: height - frame.bottom }),
        ]);
        onBox({ minLat: se.latitude, maxLat: nw.latitude, minLng: nw.longitude, maxLng: se.longitude });
      } catch {
        onBox(null);
      }
    },
    [frame, width, height, onBox, trail.mapProps],
  );

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      mapType={trail.mapProps.mapType}
      onLayout={trail.mapProps.onLayout}
      onRegionChangeComplete={measure}
      onMapReady={() => measure(regionNow())}
      showsUserLocation
      showsCompass={false}
      rotateEnabled={false}
      pitchEnabled={false}
      tintColor={Colors.text}
      initialRegion={start ? { latitude: start.lat, longitude: start.lng, latitudeDelta: 0.25, longitudeDelta: 0.25 } : undefined}>
      <TrailTiles base={trail.base} trails={trail.trails} offline={trail.offline} osm={trail.osmLines} />
    </MapView>
  );

  function regionNow(): Region {
    return start
      ? { latitude: start.lat, longitude: start.lng, latitudeDelta: 0.25, longitudeDelta: 0.25 }
      : { latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 30 };
  }
}
