import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Colors, font } from '@/constants/theme';
import type { WaypointKind } from '@/core/waypoints';

/** One small line drawing per kind, on a 24 grid. */
const GLYPHS: Record<WaypointKind, string[]> = {
  spot: [],
  camp: ['M3.5 19h17', 'M12 5L5 19', 'M12 5l7 14', 'M10 19l2-4.5 2 4.5'],
  fuel: ['M5.5 20V5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V20', 'M4 20h11', 'M8 8.5h4', 'M13.5 10.5h2a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 0 3 0V8L18 5.5'],
  water: ['M12 3.5s-6 6.6-6 10.5a6 6 0 0 0 12 0c0-3.9-6-10.5-6-10.5z'],
  view: ['M2.5 19l6.5-10 4 6 3-4 5.5 8z'],
  hazard: ['M12 4L2.5 20h19z', 'M12 10v4.5', 'M12 17.6v.1'],
  parking: ['M8.5 20V4.5h4.5a4.5 4.5 0 0 1 0 9H8.5'],
};

export function WaypointGlyph({ kind, size = 16, color }: { kind: WaypointKind; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === 'spot' ? <Circle cx={12} cy={12} r={4.5} fill={color} /> : null}
      {GLYPHS[kind].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

/**
 * A waypoint drawn as a trail blaze: the painted diamond nailed to a tree along a trail. The
 * leader's shared ones are logo blue (blue already means "the leader" on the map); a rider's own
 * are white, so "only mine" reads at a glance.
 */
export function WaypointBlaze({ kind, shared, size = 34 }: { kind: WaypointKind; shared: boolean; size?: number }) {
  const fill = shared ? Colors.sky : Colors.text;
  const ink = shared ? '#FFFFFF' : Colors.background;
  const side = size / Math.SQRT2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}>
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
      </Svg>
      <WaypointGlyph kind={kind} size={size * 0.46} color={ink} />
    </View>
  );
}

/** Wide enough for a 24-character name; the blaze sits dead centre so the anchor stays on it. */
const PIN_W = 260;

/** A waypoint on a live map: the blaze with its name beside it. */
export function WaypointPin({ name, kind, shared }: { name: string; kind: WaypointKind; shared: boolean }) {
  return (
    <View style={styles.pin}>
      <WaypointBlaze kind={kind} shared={shared} size={30} />
      <View style={[styles.label, shared && styles.sharedLabel]}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { width: PIN_W, height: 36, alignItems: 'center', justifyContent: 'center' },
  label: {
    position: 'absolute', left: PIN_W / 2 + 17, maxWidth: PIN_W / 2 - 20, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 6, backgroundColor: 'rgba(10,22,38,0.82)', borderWidth: 1, borderColor: 'rgba(241,244,248,0.35)',
  },
  sharedLabel: { borderColor: Colors.sky },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 12 },
});
