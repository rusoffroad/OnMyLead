import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { BATTERY_MODES, BATTERY_PLANS, batteryWarning, DEFAULT_BATTERY_MODE, type BatteryMode } from '@/core/battery';
import { EXPANDED_MIN } from '@/core/layout';
import { setBatteryMode, useBatteryMode } from '@/lib/battery';
import { confirmAsync } from '@/lib/confirm';
import { applyBatteryPlan } from '@/lib/location';

/** The stretch of riding each trail shows, so the dots compare across the three choices. */
const TRAIL_SEC = 90;

/**
 * Battery Saver: how often this phone tells the group where it is while sharing. Best Accuracy is
 * the default; picking anything else asks first and says what the group loses.
 */
export default function BatteryScreen() {
  const mode = useBatteryMode();
  const { width } = useWindowDimensions();
  // A tablet or wide window has room to compare the three side by side.
  const sideBySide = width >= EXPANDED_MIN;
  const [error, setError] = useState<string | null>(null);

  async function pick(next: BatteryMode) {
    if (next === mode) return;
    const warning = batteryWarning(mode, next);
    if (warning && !(await confirmAsync(warning.title, warning.message, warning.confirm, 'Keep Current'))) return;
    setError(null);
    setBatteryMode(next);
    // A share that is running switches now, not at the next share.
    applyBatteryPlan().catch(() => setError('Saved, but your current share didn’t switch over. Open Ride Mode to restart sharing with the new setting.'));
  }

  return (
    <Screen width={sideBySide ? 'page' : 'readable'}>
      <Stack.Screen options={{ title: 'Battery Saver' }} />
      <ThemedText themeColor="textSecondary">
        How often this phone tells your group where you are while you share your location. Fewer updates use less battery.
      </ThemedText>

      {mode !== DEFAULT_BATTERY_MODE ? (
        <View style={styles.warn} accessibilityLiveRegion="polite">
          <ThemedText type="smallBold">Your Group Sees You Less Often</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your dot can trail up to {BATTERY_PLANS[mode].heartbeatSec} seconds behind you, so you’re harder to follow and to find if you stop.
          </ThemedText>
          <Button title="Switch Back to Best Accuracy" kind="secondary" onPress={() => pick(DEFAULT_BATTERY_MODE)} style={{ marginTop: Spacing.two }} />
        </View>
      ) : null}

      <View style={[styles.options, sideBySide && styles.optionsRow]} accessibilityRole="radiogroup">
        {BATTERY_MODES.map((m) => (
          <Option key={m} mode={m} on={m === mode} wide={sideBySide} onPress={() => pick(m)} />
        ))}
      </View>
      <ErrorText error={error} />

      <ThemedText type="small" themeColor="textSecondary">
        This setting is for this phone only. Need Help, EMERGENCY and your other taps still send right away on every setting. Other riders aren’t told which one you picked.
      </ThemedText>
    </Screen>
  );
}

function Option({ mode, on, wide, onPress }: { mode: BatteryMode; on: boolean; wide: boolean; onPress: () => void }) {
  const p = BATTERY_PLANS[mode];
  const recommended = mode === DEFAULT_BATTERY_MODE;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${p.label}${recommended ? ', recommended' : ''}. ${p.detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.option, wide && { flex: 1 }, on && styles.optionOn, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={styles.optionHead}>
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
        <Text style={styles.optionTitle}>{p.label}</Text>
        {recommended ? <Text style={styles.recommended}>Recommended</Text> : null}
      </View>
      <Trail heartbeatSec={p.heartbeatSec} fuzzy={p.accuracy === 'balanced'} on={on} />
      <Text style={styles.short}>{p.short}</Text>
      <Text style={styles.detail}>{p.detail}</Text>
    </Pressable>
  );
}

/**
 * The same 90 seconds of trail as the group sees it: one dot per update, the newest solid. Fewer
 * dots is a rider who is harder to follow; a soft ring is a less precise fix.
 */
function Trail({ heartbeatSec, fuzzy, on }: { heartbeatSec: number; fuzzy: boolean; on: boolean }) {
  const count = Math.floor(TRAIL_SEC / heartbeatSec) + 1;
  const color = on ? Colors.sky : Colors.textSecondary;
  return (
    <View style={styles.trail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.trailLine} />
      {Array.from({ length: count }, (_, i) => {
        const at = (i * heartbeatSec) / TRAIL_SEC;
        const newest = i === count - 1;
        return (
          <View key={i} style={[styles.dotSpot, { left: `${at * 100}%` }]}>
            {fuzzy ? <View style={[styles.halo, { backgroundColor: `${color}26`, borderColor: `${color}55` }]} /> : null}
            <View style={[styles.dot, { backgroundColor: color, opacity: newest ? 1 : 0.35 + (0.4 * i) / count }, newest && styles.dotNow]} />
          </View>
        );
      })}
    </View>
  );
}

const DOT = 10;
const HALO = 24;

const styles = StyleSheet.create({
  warn: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: RideColors.yellow, padding: Spacing.three, gap: 4 },
  options: { gap: Spacing.two },
  optionsRow: { flexDirection: 'row', alignItems: 'stretch' },
  option: {
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, borderWidth: 2, borderColor: 'transparent',
    padding: Spacing.three, gap: Spacing.two,
  },
  optionOn: { borderColor: Colors.sky },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.sky },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.sky },
  optionTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 24, flexShrink: 1 },
  recommended: {
    color: RideColors.green, fontFamily: font(700), fontSize: 12, overflow: 'hidden',
    backgroundColor: `${RideColors.green}1F`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
  trail: { height: HALO, marginHorizontal: HALO / 2, justifyContent: 'center', marginVertical: 2 },
  trailLine: { height: 2, borderRadius: 1, backgroundColor: Colors.backgroundSelected },
  dotSpot: { position: 'absolute', top: 0, width: HALO, height: HALO, marginLeft: -HALO / 2, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, borderWidth: 1 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  dotNow: { width: DOT + 4, height: DOT + 4, borderRadius: (DOT + 4) / 2, borderWidth: 2, borderColor: Colors.text },
  short: { color: Colors.text, fontFamily: font(600), fontSize: 15, lineHeight: 20 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
});
