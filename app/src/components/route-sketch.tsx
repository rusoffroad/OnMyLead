import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { Colors, FontFamilies, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { projectRoute } from '@/core/summary';

export type SketchDot = LatLng & { id: string; color: string; label?: string; mine?: boolean; big?: boolean; name?: string; /** A waypoint: drawn as a trail blaze. */ diamond?: boolean };

/**
 * The route as a drawing on a navy grid, no map tiles: it works offline and on the web, and is
 * the preview on the ride page. Riders, when given, are framed together with the route.
 */
export function RouteSketch({
  points, waypoints = [], dots = [], width = 340, height = 200, style, label = 'Drawing of the ride’s route',
}: {
  points: LatLng[];
  waypoints?: LatLng[];
  dots?: SketchDot[];
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const all = [...points, ...waypoints, ...dots];
  const xy = projectRoute(all, width, height, 22);
  const line = xy.slice(0, points.length);
  const taps = xy.slice(points.length, points.length + waypoints.length);
  const riders = xy.slice(points.length + waypoints.length);
  const grid = 28;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[{ width: '100%', aspectRatio: width / height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0D1C31' }, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <G opacity={0.35}>
          {Array.from({ length: Math.ceil(width / grid) }, (_, i) => (
            <Line key={`v${i}`} x1={i * grid} y1={0} x2={i * grid} y2={height} stroke={Colors.border} strokeWidth={0.5} />
          ))}
          {Array.from({ length: Math.ceil(height / grid) }, (_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * grid} x2={width} y2={i * grid} stroke={Colors.border} strokeWidth={0.5} />
          ))}
        </G>
        {line.length > 1 ? (
          <>
            <Polyline points={pts(line)} fill="none" stroke={Colors.background} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
            <Polyline points={pts(line)} fill="none" stroke={Colors.accent} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {taps.map((p, i) => (
          <Circle key={`w${i}`} cx={p.x} cy={p.y} r={4.5} fill={Colors.background} stroke={Colors.text} strokeWidth={2} />
        ))}
        {line.length > 1 ? (
          <>
            <Circle cx={line[0].x} cy={line[0].y} r={7} fill={RideColors.green} stroke={Colors.background} strokeWidth={3} />
            <Circle cx={line[line.length - 1].x} cy={line[line.length - 1].y} r={7} fill={Colors.text} stroke={Colors.background} strokeWidth={3} />
            <Circle cx={line[line.length - 1].x} cy={line[line.length - 1].y} r={2.5} fill={Colors.background} />
          </>
        ) : null}
        {riders.map((p, i) => {
          const d = dots[i];
          const r = d.mine ? 12 : d.big ? 8 : d.name ? 5.5 : 10;
          return (
            <G key={d.id}>
              {d.diamond ? (
                <Rect x={p.x - 6.5} y={p.y - 6.5} width={13} height={13} rx={1.5} fill={d.color} stroke={Colors.background} strokeWidth={2} transform={`rotate(45 ${p.x} ${p.y})`} />
              ) : (
                <Circle cx={p.x} cy={p.y} r={r} fill={d.color} stroke={d.mine || d.big ? Colors.text : Colors.background} strokeWidth={d.big ? 2.5 : 2} />
              )}
              {d.name
                ? [Colors.background, d.big ? Colors.text : Colors.textSecondary].map((c, k) => (
                    <SvgText
                      key={k}
                      x={p.x + r + 4}
                      y={p.y + 4}
                      fill={c}
                      stroke={k === 0 ? Colors.background : undefined}
                      strokeWidth={k === 0 ? 3 : 0}
                      fontSize={d.big ? 12 : 10.5}
                      fontFamily={FontFamilies.body[d.big ? 800 : 600]}>
                      {d.name}
                    </SvgText>
                  ))
                : null}
              {d.label ? (
                <SvgText x={p.x} y={p.y + 3.5} fill="#fff" fontSize={d.mine ? 8 : 10} fontFamily={FontFamilies.body[800]} textAnchor="middle">
                  {d.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const pts = (xy: { x: number; y: number }[]) => xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
