import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { projectRoute } from '@/core/summary';

/**
 * A trail's shape as a small drawing (no map tiles, so it shows with no signal and on the web).
 * Mint dots for a rider's shared trail, cream for your own, like on the map.
 */
export function TrailThumb({ points, color, size = 56, dotted }: { points: LatLng[]; color: string; size?: number; dotted?: boolean }) {
  const xy = projectRoute(points, size, size, 6);
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#0D1C31', borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
      {xy.length > 1 ? (
        <Svg width={size} height={size}>
          <Polyline
            points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={dotted ? 3 : 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dotted ? '0.1 5' : undefined}
          />
          <Circle cx={xy[0].x} cy={xy[0].y} r={3} fill="#3CC36B" />
        </Svg>
      ) : null}
    </View>
  );
}
