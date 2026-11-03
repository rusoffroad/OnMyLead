import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { Colors, font, Glass, RideColors } from '@/constants/theme';
import { CAUTION_SHARE, degrees, pitchSide, rollSide, tiltLevel, type TiltLevel } from '@/core/tilt';

/** Level colors: the same green, amber and red the Ride Bubble uses, so riders already know them. */
export const LEVEL_INK: Record<TiltLevel, string> = { ok: RideColors.green, caution: RideColors.yellow, warn: RideColors.red };

/** The dial shows this far each way; past it the vehicle still turns but the scale stops. */
const SCALE = 60;
const CX = 100;
const CY = 104;
const R = 86;

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
};

function arc(from: number, to: number, r: number) {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** The back of a truck, as seen from behind: leans with roll. */
function RearTruck({ ink }: { ink: string }) {
  return (
    <G>
      <Rect x={62} y={84} width={18} height={22} rx={4} fill="#05101E" stroke={ink} strokeWidth={2} />
      <Rect x={120} y={84} width={18} height={22} rx={4} fill="#05101E" stroke={ink} strokeWidth={2} />
      <Path d="M70 54 L76 34 H124 L130 54 Z" fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M80 39 H120 L124 51 H76 Z" fill="#05101E" />
      <Rect x={56} y={54} width={88} height={34} rx={6} fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2.5} />
      <Rect x={62} y={60} width={12} height={8} rx={2} fill={RideColors.red} />
      <Rect x={126} y={60} width={12} height={8} rx={2} fill={RideColors.red} />
      <Rect x={86} y={74} width={28} height={8} rx={2} fill="#05101E" />
    </G>
  );
}

/** A truck from the side, nose to the right: tips with pitch. */
function SideTruck({ ink }: { ink: string }) {
  return (
    <G>
      <Path d="M42 88 V68 L60 64 L76 40 H120 L134 64 L158 68 V88 Z" fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M80 45 H98 V62 H67 Z" fill="#05101E" />
      <Path d="M103 45 H117 L128 62 H103 Z" fill="#05101E" />
      <Circle cx={68} cy={90} r={14} fill="#05101E" stroke={ink} strokeWidth={2.5} />
      <Circle cx={132} cy={90} r={14} fill="#05101E" stroke={ink} strokeWidth={2.5} />
      <Circle cx={68} cy={90} r={5} fill={ink} />
      <Circle cx={132} cy={90} r={5} fill={ink} />
    </G>
  );
}

/**
 * One dial: the scale arc with its amber and red zones at the rider's limit, the vehicle leaning on
 * it, and the big reading under it. Roll leans the rear view; pitch tips the side view.
 */
export const TiltDial = memo(function TiltDial({
  axis, angle, limit, max, width,
}: {
  axis: 'roll' | 'pitch';
  angle: number | null;
  limit: number;
  /** Biggest lean each way this ride: [left/down, right/up]. */
  max: [number, number];
  width: number;
}) {
  const a = angle ?? 0;
  const level = angle == null ? 'ok' : tiltLevel(a, limit);
  const ink = angle == null ? Colors.textSecondary : LEVEL_INK[level];
  // Roll right (positive) turns the rear view clockwise; nose up turns the side view counterclockwise.
  const turn = axis === 'roll' ? a : -a;
  const shown = Math.max(-SCALE, Math.min(SCALE, turn));
  const needle = polar(shown, R + 2);
  const caution = limit * CAUTION_SHARE;
  const side = angle == null ? '' : axis === 'roll' ? rollSide(a) : pitchSide(a);
  const label = axis === 'roll' ? 'Roll' : 'Pitch';
  const [lo, hi] = axis === 'roll' ? ['Left', 'Right'] : ['Down', 'Up'];
  const height = (width * 132) / 200;
  // The reading scales with the dial, so two dials fit on a phone screen.
  const big = Math.round(Math.min(72, width * 0.19));
  return (
    <View
      style={styles.dial}
      accessible
      accessibilityRole="text"
      accessibilityLabel={angle == null ? `${label}, no reading yet` : `${label} ${degrees(a)} degrees ${side}`.trim()}>
      <Svg width={width} height={height} viewBox="0 0 200 132">
        {/* Scale: ticks every 5°, longer every 15°. */}
        {Array.from({ length: (SCALE * 2) / 5 + 1 }, (_, i) => {
          const d = -SCALE + i * 5;
          const long = d % 15 === 0;
          const p1 = polar(d, R - (long ? 10 : 5));
          const p2 = polar(d, R);
          return <Line key={d} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={d === 0 ? Colors.text : Colors.border} strokeWidth={long ? 2 : 1.2} />;
        })}
        {/* Amber near the limit, red past it, both ways. */}
        <Path d={arc(caution, limit, R + 6)} stroke={RideColors.yellow} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d={arc(-limit, -caution, R + 6)} stroke={RideColors.yellow} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d={arc(limit, SCALE, R + 6)} stroke={RideColors.red} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d={arc(-SCALE, -limit, R + 6)} stroke={RideColors.red} strokeWidth={4} fill="none" strokeLinecap="round" />
        {/* Level ground stays put; the vehicle turns over it. */}
        <Line x1={18} y1={CY + 4} x2={182} y2={CY + 4} stroke={Glass.edge} strokeWidth={1.5} strokeDasharray="4 5" />
        <G transform={`rotate(${turn.toFixed(1)} ${CX} ${CY})`}>
          <Line x1={CX} y1={CY + 4} x2={CX} y2={CY - R + 14} stroke={ink} strokeWidth={1.5} strokeOpacity={0.5} />
          {axis === 'roll' ? <RearTruck ink={ink} /> : <SideTruck ink={ink} />}
        </G>
        <Circle cx={needle.x} cy={needle.y} r={6} fill={ink} stroke={Colors.background} strokeWidth={2} />
      </Svg>
      <View style={styles.readout}>
        <Text style={styles.axis}>{label}</Text>
        <Text style={[styles.value, { fontSize: big, lineHeight: Math.round(big * 1.06) }, { color: angle == null ? Colors.textSecondary : level === 'ok' ? Colors.text : ink }]}>
          {angle == null ? '–' : degrees(a)}
          <Text style={[styles.deg, { fontSize: Math.round(big * 0.55) }]}>°</Text>
        </Text>
        <Text style={styles.side}>{side || 'Level'}</Text>
      </View>
      <View style={styles.maxRow}>
        <Text style={styles.max}>Max {lo} {Math.round(max[0])}°</Text>
        <Text style={styles.max}>Max {hi} {Math.round(max[1])}°</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dial: { alignItems: 'center' },
  readout: { alignItems: 'center', marginTop: -6 },
  axis: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 18, letterSpacing: 0.4 },
  value: { fontFamily: font(800, 'display'), fontSize: 72, lineHeight: 76, fontVariant: ['tabular-nums'] },
  deg: { fontSize: 40, color: Colors.textSecondary },
  side: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, marginTop: -2 },
  maxRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
  max: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, fontVariant: ['tabular-nums'] },
});
