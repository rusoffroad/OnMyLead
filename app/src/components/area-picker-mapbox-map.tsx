import { useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';

import type { Box } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MapboxMap, type MapboxMapHandle } from './mapbox-map';

/**
 * The map behind the area picker, on Mapbox: whatever sits inside the frame (insets from the
 * screen edges) is the area to download; after every pan or zoom the frame's corners are turned
 * into a box. Kept flat and north-up so the frame is a true box on the ground.
 */
export function AreaPickerMapboxMap({
  trail, frame, start, onBox,
}: {
  trail: TrailMap;
  frame: { top: number; bottom: number; left: number; right: number };
  start: { lat: number; lng: number } | null;
  onBox: (box: Box | null) => void;
}) {
  const map = useRef<MapboxMapHandle>(null);
  const { width, height } = useWindowDimensions();

  const measure = useCallback(async () => {
    const m = map.current;
    if (!m) return onBox(null);
    const [nw, se] = await Promise.all([m.pointAt(frame.left, frame.top), m.pointAt(width - frame.right, height - frame.bottom)]);
    onBox(nw && se ? { minLat: se.lat, maxLat: nw.lat, minLng: nw.lng, maxLng: se.lng } : null);
  }, [frame, width, height, onBox]);

  return (
    <MapboxMap
      ref={map}
      trail={trail}
      tilt={false}
      rotate={false}
      compass={false}
      initial={start ? { center: start, zoom: 10.5 } : null}
      onReady={measure}
      onIdle={measure}
    />
  );
}
