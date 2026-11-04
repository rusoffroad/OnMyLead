import { memo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { Colors, font, Glass, RideColors, themedStyles } from '@/constants/theme';
import { CAUTION_SHARE, degrees, pitchSide, rollSide, tiltLevel, type TiltLevel } from '@/core/tilt';

import { t } from '@/lib/i18n';
/** Level colors: the same green, amber and red the Ride Bubble uses, so riders already know them. */
// Getters, so the colours follow the theme and Color Blind Mode.
export const LEVEL_INK: Record<TiltLevel, string> = {
  get ok() {
    return RideColors.green;
  },
  get caution() {
    return RideColors.yellow;
  },
  get warn() {
    return RideColors.red;
  },
};

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

const TIRE = '#05101E';

/** An axle seen from behind (two tires, the axle tube and the frame above it): leans with roll. */
function RearAxle({ ink }: { ink: string }) {
  return (
    <G>
      <Rect x={62} y={46} width={76} height={8} rx={4} fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2} />
      <Line x1={84} y1={54} x2={89} y2={80} stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <Line x1={116} y1={54} x2={111} y2={80} stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <Rect x={74} y={81} width={52} height={8} rx={4} fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2} />
      <Circle cx={100} cy={85} r={11} fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2.5} />
      {[52, 126].map((x) => (
        <G key={x}>
          <Rect x={x} y={62} width={22} height={45} rx={7} fill={TIRE} stroke={ink} strokeWidth={2.5} />
          {[71, 79, 87, 95].map((y) => (
            <Line key={y} x1={x + 5} y1={y} x2={x + 17} y2={y} stroke={ink} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
          ))}
        </G>
      ))}
    </G>
  );
}

/** Two wheels and the frame rail from the side, front to the right: tips with pitch. */
function SideChassis({ ink }: { ink: string }) {
  return (
    <G>
      <Line x1={60} y1={86} x2={78} y2={64} stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <Line x1={140} y1={86} x2={122} y2={64} stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <Rect x={44} y={58} width={112} height={8} rx={4} fill={Colors.backgroundSelected} stroke={ink} strokeWidth={2} />
      <Path d="M164 54 L174 62 L164 70" stroke={ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[60, 140].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={86} r={21} fill={TIRE} stroke={ink} strokeWidth={2.5} />
          <Circle cx={x} cy={86} r={13} fill="none" stroke={ink} strokeOpacity={0.45} strokeWidth={2} />
          <Circle cx={x} cy={86} r={5} fill={ink} />
        </G>
      ))}
    </G>
  );
}

/**
 * One dial: the scale arc with its amber and red zones at the rider's limit, the vehicle leaning on
 * it, and the big reading under it. Roll leans an axle seen from behind; pitch tips two wheels
 * and the frame seen from the side.
 */
export const TiltDial = memo(function TiltDial({
  axis, angle, limit, max, width, zeroed = true,
}: {
  axis: 'roll' | 'pitch';
  angle: number | null;
  limit: number;
  /** Biggest lean each way this ride: [left/down, right/up]. */
  max: [number, number];
  width: number;
  /** False before the rider taps Zero: the reading is only roughly level, so it stays blue, never amber or red. */
  zeroed?: boolean;
}) {
  const a = angle ?? 0;
  const level = angle == null || !zeroed ? 'ok' : tiltLevel(a, limit);
  const ink = angle == null ? Colors.textSecondary : zeroed ? LEVEL_INK[level] : Colors.sky;
  // Roll right (positive) turns the rear view clockwise; nose up turns the side view counterclockwise.
  const turn = axis === 'roll' ? a : -a;
  const shown = Math.max(-SCALE, Math.min(SCALE, turn));
  const needle = polar(shown, R + 2);
  const caution = limit * CAUTION_SHARE;
  const side = angle == null ? '' : axis === 'roll' ? rollSide(a) : pitchSide(a);
  const label = axis === 'roll' ? t('Roll') : t('Pitch');
  const [lo, hi] = axis === 'roll' ? ['Left', 'Right'] : ['Down', 'Up'];
  const height = (width * 132) / 200;
  // The reading scales with the dial, so two dials fit on a phone screen.
  const big = Math.round(Math.min(72, width * 0.19));
  return (
    <View
      style={styles.dial}
      accessible
      accessibilityRole="text"
      accessibilityLabel={angle == null ? t('{label}, no reading yet', { label }) : `${label} ${degrees(a)} degrees ${side}`.trim()}>
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
          <Line x1={CX} y1={CY + 4} x2={CX} y2={CY - R + 14} stroke={ink} strokeWidth={1.5} strokeOpacity={0.35} strokeDasharray="3 4" />
          {axis === 'roll' ? <RearAxle ink={ink} /> : <SideChassis ink={ink} />}
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
        <Text style={styles.max}>{t('Max {lo} {v}°', { lo, v: Math.round(max[0]) })}</Text>
        <Text style={styles.max}>{t('Max {hi} {v}°', { hi, v: Math.round(max[1]) })}</Text>
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
  dial: { alignItems: 'center' },
  readout: { alignItems: 'center', marginTop: -6 },
  axis: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 18, letterSpacing: 0.4 },
  value: { fontFamily: font(800, 'display'), fontSize: 72, lineHeight: 76, fontVariant: ['tabular-nums'] },
  deg: { fontSize: 40, color: Colors.textSecondary },
  side: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, marginTop: -2 },
  maxRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
  max: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, fontVariant: ['tabular-nums'] },
}));
