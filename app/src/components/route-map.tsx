import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { projectRoute } from '@/core/summary';

/**
 * The rider's own route as a simple line drawing (no map tiles, so it works offline and on
 * the web). Only ever drawn for the rider who recorded it.
 */
export function RouteMap({ route, width = 320, height = 180 }: { route: LatLng[]; width?: number; height?: number }) {
  const xy = projectRoute(route, width, height, 14);
  if (xy.length < 2) return null;
  const start = xy[0];
  const end = xy[xy.length - 1];
  return (
    <View
      accessible
      accessibilityLabel="Map of your route"
      style={{ width: '100%', aspectRatio: width / height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1b1d1f' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={RideColors.yellow}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={start.x} cy={start.y} r={6} fill={RideColors.green} stroke="#fff" strokeWidth={2} />
        <Circle cx={end.x} cy={end.y} r={6} fill={RideColors.red} stroke="#fff" strokeWidth={2} />
      </Svg>
    </View>
  );
}
