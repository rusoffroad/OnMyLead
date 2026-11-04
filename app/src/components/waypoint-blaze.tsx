import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

import { Colors, font, MapLabelText, themedStyles } from '@/constants/theme';
import { symbolDrawing, symbolInfo, waypointSymbol, warningTriangle, type WaypointSymbol } from '@/core/waypoint-symbols';
import { stopNumber, type Waypoint } from '@/core/waypoints';
import { MarkerBody } from './marker-body';

/** A symbol's line drawing (core/waypoint-symbols), on a 24 grid. On its own unless it's on its blaze (onBlaze). */
export function WaypointGlyph({ symbol, size = 16, color, onBlaze }: { symbol: WaypointSymbol; size?: number; color: string; onBlaze?: boolean }) {
  const info = symbolDrawing(symbol, !onBlaze);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {info.paths.map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {info.dots.map(([cx, cy, r]) => <Circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill={color} />)}
    </Svg>
  );
}

/**
 * A waypoint drawn as a trail blaze: the painted diamond nailed to a tree along a trail. The
 * leader's shared ones are logo blue (blue already means "the leader" on the map); a rider's own
 * are white, so "only mine" reads at a glance (light against dark, so it reads without colour too).
 * Hazards are painted on a warning triangle instead, so they stand out by shape.
 */
export function WaypointBlaze({ symbol, shared, size = 34 }: { symbol: WaypointSymbol; shared: boolean; size?: number }) {
  const fill = shared ? Colors.sky : Colors.text;
  const ink = shared ? '#FFFFFF' : Colors.background;
  const info = symbolInfo(symbol);
  const side = size / Math.SQRT2;
  const triangle = info.shape === 'triangle';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}>
        {triangle ? (
          <Polygon points={warningTriangle(size)} fill={fill} stroke={Colors.background} strokeWidth={2.5} strokeLinejoin="round" />
        ) : (
          <Rect
            x={(size - side) / 2}
            y={(size - side) / 2}
            width={side}
            height={side}
            rx={size * 0.09}
            fill={fill}
            stroke={Colors.background}
            strokeWidth={2.5}
            transform={`rotate(45 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={triangle ? { marginTop: size * 0.16 } : undefined}>
        <WaypointGlyph symbol={symbol} size={size * (triangle ? 0.44 : 0.46)} color={ink} onBlaze />
      </View>
    </View>
  );
}

/** Wide enough for a 24-character name; the blaze sits dead centre so the anchor stays on it. */
const PIN_W = 260;

/** A waypoint on a live map: the blaze with its name beside it. */
export function WaypointPin({ name, symbol, shared }: { name: string; symbol: WaypointSymbol; shared: boolean }) {
  return (
    <MarkerBody style={styles.pin}>
      <WaypointBlaze symbol={symbol} shared={shared} size={30} />
      <View style={[styles.label, shared && styles.sharedLabel]}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
      </View>
    </MarkerBody>
  );
}

const styles = themedStyles(() => ({
  pin: { width: PIN_W, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: {
    position: 'absolute', left: PIN_W / 2 + 17, maxWidth: PIN_W / 2 - 20, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 6, backgroundColor: 'rgba(10,22,38,0.82)', borderWidth: 1, borderColor: 'rgba(241,244,248,0.35)',
  },
  sharedLabel: { borderColor: Colors.sky },
  name: { color: MapLabelText, fontFamily: font(700), fontSize: 12 },
  stopN: { color: '#FFFFFF', fontFamily: font(800, 'display'), textAlign: 'center', includeFontPadding: false },
  stopLabel: { left: PIN_W / 2 + 22, maxWidth: PIN_W / 2 - 24, borderColor: Colors.accent, paddingVertical: 2 },
  stopName: { color: Colors.text, fontFamily: font(800), fontSize: 13 },
  stopBadge: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: Colors.background,
  },
  stopTime: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 11, fontVariant: ['tabular-nums'] },
}));

/** The eight corners of a stop sign filling a square of this size. */
export function octagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/**
 * A planned stop: a red stop sign with its number, so "we stop here, second" reads from across the
 * map. Logo red with a white rim, so it stays clear of the red route line it usually sits on.
 */
export function StopSign({ n, size = 34, symbol }: { n: number | null; size?: number; symbol?: WaypointSymbol | null }) {
  const c = size / 2;
  const badge = Math.round(size * 0.5);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}>
        <Polygon points={octagon(c, c, c - 0.5)} fill={Colors.background} />
        <Polygon points={octagon(c, c, c - 2.5)} fill="#FFFFFF" />
        <Polygon points={octagon(c, c, c - 4.5)} fill={Colors.accent} />
      </Svg>
      <Text style={[styles.stopN, { fontSize: size * 0.5, lineHeight: size * 0.56 }]}>{n ?? ''}</Text>
      {symbol && symbol !== 'spot' ? (
        // What the stop is for (fuel, food, camp): a small white tag on the sign's corner.
        <View style={[styles.stopBadge, { width: badge, height: badge, borderRadius: badge / 2, right: -badge * 0.35, top: -badge * 0.3 }]}>
          <WaypointGlyph symbol={symbol} size={badge * 0.66} color={Colors.background} />
        </View>
      ) : null}
    </View>
  );
}

/** A planned stop on a live map: the stop sign, with its name and planned time beside it. */
export function StopPin({ name, n, time, symbol }: { name: string; n: number | null; time?: string | null; symbol?: WaypointSymbol | null }) {
  return (
    <MarkerBody style={styles.pin}>
      <StopSign n={n} size={38} symbol={symbol} />
      <View style={[styles.label, styles.stopLabel]}>
        <Text style={styles.stopName} numberOfLines={1}>{name}</Text>
        {time ? <Text style={styles.stopTime}>{time}</Text> : null}
      </View>
    </MarkerBody>
  );
}

/** Waypoints as dots for the drawn route (RouteSketch): stop signs, blue or white blazes, hazards as triangles. */
export const waypointDots = (list: Waypoint[], names = false) =>
  list.map((w) => ({
    id: w.id, lat: w.lat, lng: w.lng, name: names ? w.name : undefined,
    color: w.shared ? Colors.sky : Colors.text, diamond: true, stop: stopNumber(w, list) ?? undefined,
    triangle: symbolInfo(waypointSymbol(w)).shape === 'triangle',
  }));
