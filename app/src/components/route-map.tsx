import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { projectRoute } from '@/core/summary';
import { useTrailMap } from '@/hooks/use-trail-map';
import { MapboxMap, MapboxMarker, type MapLine, type MapboxMapHandle } from './mapbox-map';

type RouteMapProps = {
  route: LatLng[]; width?: number; height?: number;
  /** Line color, and dots instead of a solid line (a trail another rider mapped). */
  color?: string; dotted?: boolean; label?: string;
};

/** A trail's preview: on the Mapbox map when this build and the owner allow it, else the line drawing below. */
export function RouteMap(props: RouteMapProps) {
  const trail = useTrailMap();
  if (props.route.length < 2) return null;
  if (trail.mapbox) return <RouteMapboxPreview {...props} trail={trail} />;
  return <SketchRouteMap {...props} />;
}

/** The trail over the rider's map look, framed and still (it's inside a page; the big map is a tap away). */
function RouteMapboxPreview({ route, width = 320, height = 180, color = RideColors.yellow, dotted, label = 'Map of your route', trail }: RouteMapProps & { trail: ReturnType<typeof useTrailMap> }) {
  const map = useRef<MapboxMapHandle>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) map.current?.fit(route, { top: 24, right: 24, bottom: 24, left: 24 }, false);
  }, [ready, route]);
  const lines = useMemo<MapLine[]>(
    () => [{ id: 'preview', points: route, color, width: 4, casing: Colors.background, casingWidth: 8, ...(dotted ? { dash: [1, 8] } : {}) }],
    [route, color, dotted],
  );
  const dot = (fill: string) => <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: fill, borderWidth: 2, borderColor: '#fff' }} />;
  return (
    <View accessible accessibilityLabel={label} style={{ width: '100%', aspectRatio: width / height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1b1d1f' }}>
      <MapboxMap ref={map} trail={trail} tilt={false} interactive={false} compass={false} initial={{ center: route[0], zoom: 12 }} lines={lines} onReady={() => setReady(true)}>
        <MapboxMarker id="route-start" at={route[0]}>{dot(RideColors.green)}</MapboxMarker>
        <MapboxMarker id="route-end" at={route[route.length - 1]}>{dot(RideColors.red)}</MapboxMarker>
      </MapboxMap>
    </View>
  );
}

/**
 * The rider's own route as a simple line drawing (no map tiles, so it works offline and on
 * the web). Only ever drawn for the rider who recorded it.
 */
function SketchRouteMap({ route, width = 320, height = 180, color = RideColors.yellow, dotted, label = 'Map of your route' }: RouteMapProps) {
  const xy = projectRoute(route, width, height, 14);
  if (xy.length < 2) return null;
  const start = xy[0];
  const end = xy[xy.length - 1];
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ width: '100%', aspectRatio: width / height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1b1d1f' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={dotted ? 4.5 : 3}
          strokeDasharray={dotted ? '0.1 8' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={start.x} cy={start.y} r={6} fill={RideColors.green} stroke="#fff" strokeWidth={2} />
        <Circle cx={end.x} cy={end.y} r={6} fill={RideColors.red} stroke="#fff" strokeWidth={2} />
      </Svg>
    </View>
  );
}
