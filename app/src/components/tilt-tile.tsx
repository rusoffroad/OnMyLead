import { router } from 'expo-router';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, font, Glass, GlassSurface, themedStyles } from '@/constants/theme';
import { degrees, describeTilt, overallLevel, pitchSide, rollSide, tiltLevel, type TiltLimits } from '@/core/tilt';
import type { TiltReading } from '@/hooks/use-tilt';
import { Icon } from './icon';
import { LEVEL_INK } from './tilt-gauge';

export const TILT_TILE_H = 48;

/**
 * The Tilt tile in Map Mode and Ride Mode: roll and pitch at a glance, green to amber to red as the
 * vehicle nears the rider's limits. Tap opens the full Tilt screen.
 *
 * `bar` is the wide row under the Map Mode dash; otherwise it is a pill that floats over the map.
 */
export function TiltTile({ reading, limits, bar, style }: { reading: TiltReading; limits: TiltLimits; bar?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = reading.tilt;
  // Colours only once zeroed: before that the reading is only roughly level.
  const on = !!t && reading.zeroed;
  const level = on ? overallLevel(t!, limits) : 'ok';
  const ink = on ? LEVEL_INK[level] : Colors.textSecondary;
  const short = (side: string) => (side === 'Left' ? 'L' : side === 'Right' ? 'R' : side);
  // Never calibrated: the meter is off, and the tile asks for a calibration instead.
  if (!reading.zeroed) {
    return (
      <Pressable
        onPress={() => router.push('/tilt')}
        accessibilityRole="button"
        accessibilityLabel="Calibrate Tilt"
        accessibilityHint="Opens the tilt meter so you can calibrate it"
        hitSlop={6}
        style={({ pressed }) => [bar ? styles.bar : styles.pill, pressed && { opacity: 0.8 }, style]}>
        <Icon name="tilt" size={bar ? 22 : 20} color={Colors.textSecondary} strokeWidth={2.3} />
        <Text style={[styles.calibrate, bar && { flex: 1 }]} numberOfLines={1}>Calibrate Tilt</Text>
        {bar ? <Icon name="chevron" size={18} color={Colors.textSecondary} /> : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => router.push('/tilt')}
      accessibilityRole="button"
      accessibilityLabel={t ? `Tilt. ${describeTilt(t)}${reading.zeroed ? '' : '. Not zeroed yet'}` : 'Tilt'}
      accessibilityHint="Opens the tilt meter"
      hitSlop={6}
      style={({ pressed }) => [
        bar ? styles.bar : styles.pill,
        level !== 'ok' && { borderColor: ink, borderWidth: 2 },
        pressed && { opacity: 0.8 },
        style,
      ]}>
      <Icon name="tilt" size={bar ? 22 : 20} color={ink} strokeWidth={2.3} />
      <Axis
        label="Roll"
        value={t ? `${degrees(t.roll)}°` : '–'}
        side={t ? (bar ? rollSide(t.roll) : short(rollSide(t.roll))) : ''}
        ink={on && tiltLevel(t!.roll, limits.roll) !== 'ok' ? LEVEL_INK[tiltLevel(t.roll, limits.roll)] : Colors.text}
        bar={bar}
      />
      <View style={styles.rule} />
      <Axis
        label="Pitch"
        value={t ? `${degrees(t.pitch)}°` : '–'}
        side={t ? pitchSide(t.pitch) : ''}
        ink={on && tiltLevel(t!.pitch, limits.pitch) !== 'ok' ? LEVEL_INK[tiltLevel(t.pitch, limits.pitch)] : Colors.text}
        bar={bar}
      />
      {bar ? <Icon name="chevron" size={18} color={Colors.textSecondary} /> : null}
    </Pressable>
  );
}

function Axis({ label, value, side, ink, bar }: { label: string; value: string; side: string; ink: string; bar?: boolean }) {
  return (
    <View style={[styles.axis, bar && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: ink }, bar && styles.valueBar]} numberOfLines={1}>
        {value}
        {side ? <Text style={styles.side}> {side}</Text> : null}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  pill: {
    position: 'absolute', zIndex: 15, height: TILT_TILE_H, borderRadius: TILT_TILE_H / 2, flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingLeft: 12, paddingRight: 16, ...GlassSurface,
  },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge,
  },
  axis: { gap: 0 },
  label: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 11, lineHeight: 13 },
  value: { fontFamily: font(800, 'display'), fontSize: 18, lineHeight: 21, fontVariant: ['tabular-nums'] },
  valueBar: { fontSize: 22, lineHeight: 25 },
  side: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 15 },
  calibrate: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  rule: { width: 1, alignSelf: 'stretch', marginVertical: 6, backgroundColor: Glass.edge },
}));
