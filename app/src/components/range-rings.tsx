import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { Colors, font, RideColors } from '@/constants/theme';
import { ringFraction, ringMiles, ringSpot, type NearbyRider } from '@/core/out-riding';

/**
 * Who's out nearby as range rings: you in the middle, each rider on the ring for roughly how far
 * away they are. Distance only: the angle is made up from the rider's id, never their direction,
 * and the caption says so. Riders you know are green; everyone else is grey.
 */
export function RangeRings({
  riders, radius, size, onPick,
}: { riders: NearbyRider[]; radius: number; size: number; onPick?: (r: NearbyRider) => void }) {
  const c = size / 2;
  const outer = c - 18;
  const rings = ringMiles(radius);
  const dot = Math.max(26, Math.round(size / 11));
  return (
    <View style={{ width: size, alignSelf: 'center', gap: 6 }}>
      <View style={{ width: size, height: size }} accessible accessibilityLabel={`${riders.length} riders out within ${radius} miles`}>
        <Svg width={size} height={size}>
          {/* Crosshair ticks, faint: a range finder, not a compass. */}
          <Line x1={c} y1={c - outer - 8} x2={c} y2={c - outer + 6} stroke={Colors.border} strokeWidth={1.5} />
          <Line x1={c} y1={c + outer - 6} x2={c} y2={c + outer + 8} stroke={Colors.border} strokeWidth={1.5} />
          <Line x1={c - outer - 8} y1={c} x2={c - outer + 6} y2={c} stroke={Colors.border} strokeWidth={1.5} />
          <Line x1={c + outer - 6} y1={c} x2={c + outer + 8} y2={c} stroke={Colors.border} strokeWidth={1.5} />
          {rings.map((m, i) => (
            <Circle
              key={m}
              cx={c}
              cy={c}
              r={outer * ringFraction(m, radius)}
              stroke={i === rings.length - 1 ? Colors.border : Colors.backgroundSelected}
              strokeWidth={i === rings.length - 1 ? 2 : 1.5}
              strokeDasharray={i === rings.length - 1 ? undefined : '3 6'}
              fill="none"
            />
          ))}
          <Circle cx={c} cy={c} r={23} fill={Colors.accent} opacity={0.18} />
          <Circle cx={c} cy={c} r={17} fill={Colors.accent} />
        </Svg>
        {rings.map((m) => (
          // Along the right-hand spoke, just under it, clear of the middle.
          <Text key={m} style={[styles.ringLabel, { left: c + outer * ringFraction(m, radius) - 34, top: c + 4 }]}>{m} mi</Text>
        ))}
        <Text style={[styles.you, { left: c - 20, top: c - 9 }]}>You</Text>
        {riders.map((r) => {
          const s = ringSpot(r.user_id, r.miles, radius);
          const a = (s.angle * Math.PI) / 180;
          const x = c + Math.cos(a) * outer * s.fraction - dot / 2;
          const y = c + Math.sin(a) * outer * s.fraction - dot / 2;
          return (
            <Pressable
              key={r.user_id}
              accessibilityRole="button"
              accessibilityLabel={`${r.display_name}, ${r.miles < 1 ? 'under a mile' : `about ${r.miles} miles`} away`}
              onPress={onPick ? () => onPick(r) : undefined}
              hitSlop={6}
              style={[
                styles.dot,
                { left: x, top: y, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: r.known ? RideColors.green : RideColors.rider },
              ]}>
              <Text style={[styles.initial, { fontSize: dot * 0.44 }]}>{(r.display_name.trim()[0] ?? '?').toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.caption}>Rings show roughly how far, never which way.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ringLabel: { position: 'absolute', width: 30, textAlign: 'right', color: Colors.textSecondary, fontFamily: font(600, 'display'), fontSize: 13 },
  you: { position: 'absolute', width: 40, textAlign: 'center', color: '#fff', fontFamily: font(800, 'display'), fontSize: 14, lineHeight: 18 },
  dot: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.background },
  initial: { color: '#fff', fontFamily: font(800) },
  caption: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, textAlign: 'center' },
});
