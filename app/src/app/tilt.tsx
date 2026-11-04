import { useKeepAwake } from 'expo-keep-awake';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { TiltDial } from '@/components/tilt-gauge';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { CRASH_SENSITIVITIES, type CrashSensitivity } from '@/core/crash-detect';
import { EXPANDED_MIN } from '@/core/layout';
import { clampLimit, TILT_LIMIT_MAX, TILT_LIMIT_MIN } from '@/core/tilt';
import { resetTiltMax, useTilt } from '@/hooks/use-tilt';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { latestMotion, motionAvailable } from '@/lib/motion';
import {
  clearZero, setCrashSettings, setTiltLimits, setTiltShown, setTiltVoice, setTiltWarnings, useTiltSettings, zeroTilt,
} from '@/lib/tilt';
import { t as tr } from '@/lib/i18n';

/**
 * Tilt: a roll and pitch meter (inclinometer) from the phone's motion sensors, plus the Crash Alert
 * settings that use the same sensors. Works with no signal.
 */
export default function TiltScreen() {
  if (Platform.OS === 'web') return <NoSensors />;
  return <TiltMeter />;
}

function NoSensors() {
  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: tr('Tilt') }} />
      <ThemedText type="subtitle">Tilt Is in the App</ThemedText>
      <ThemedText themeColor="textSecondary">
        The roll and pitch meter and Crash Alert read the motion sensors in your phone or tablet, so they’re in the OnMyLead app for iPhone, iPad and Android, not on the website.
      </ThemedText>
    </Screen>
  );
}

function TiltMeter() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const settings = useTiltSettings();
  const reading = useTilt(settings);
  const { width, height } = useWindowDimensions();
  const sideBySide = width >= EXPANDED_MIN || width > height;
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    motionAvailable().then(setAvailable);
  }, []);

  const pageW = Math.min(width, sideBySide ? 1200 : 640) - 2 * Spacing.four;
  const dialW = Math.min(sideBySide ? (pageW - Spacing.four) / 2 : pageW, sideBySide ? 380 : 290);
  const { limits, crash } = settings;
  const t = reading.tilt;

  // Never zeroed: the meter is off until the rider calibrates it, and the button says Calibrate.
  const calibrated = !!settings.calibration;
  const zeroWord = calibrated ? 'Zero' : 'Calibrate';

  async function zero() {
    const ok = await confirmAsync(
      calibrated ? 'Zero the Tilt Meter' : 'Calibrate the Tilt Meter',
      `Place your phone where it will be mounted, with the vehicle on flat and level ground, then press ${zeroWord} to calibrate it.`,
      zeroWord,
      'Cancel',
    );
    if (!ok) return;
    const m = latestMotion();
    if (!m || !zeroTilt(m.gravity)) {
      showNotice('No Reading Yet', 'The motion sensors haven’t sent a reading yet. Hold still for a second and try again.');
      return;
    }
    resetTiltMax();
  }

  return (
    <Screen width={sideBySide ? 'wide' : 'readable'}>
      <Stack.Screen options={{ title: tr('Tilt') }} />
      {!available ? (
        <View style={styles.notice}>
          <ThemedText type="smallBold">No Motion Sensors Found</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">This device doesn’t report tilt, so the meter can’t show a reading.</ThemedText>
        </View>
      ) : null}

      <CrashToggle
        on={crash.enabled}
        onChange={(enabled) => setCrashSettings({ ...crash, enabled })}
      />

      <View style={[styles.dials, sideBySide && styles.dialsRow]}>
        <TiltDial axis="roll" angle={calibrated ? (t?.roll ?? null) : null} limit={limits.roll} max={calibrated ? [reading.max.rollLeft, reading.max.rollRight] : [0, 0]} width={dialW} zeroed={reading.zeroed} />
        <TiltDial axis="pitch" angle={calibrated ? (t?.pitch ?? null) : null} limit={limits.pitch} max={calibrated ? [reading.max.pitchDown, reading.max.pitchUp] : [0, 0]} width={dialW} zeroed={reading.zeroed} />
      </View>

      <View style={styles.actions}>
        <Button title={zeroWord} onPress={zero} style={{ flex: 1 }} accessibilityHint="Sets level for how the phone sits in its mount" />
        {calibrated ? <Button title="Reset Max" kind="secondary" onPress={resetTiltMax} style={{ flex: 1 }} /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {calibrated
          ? 'Zeroed for your mount. Zero again if you move the phone.'
          : 'The tilt meter is off until you calibrate it. Place your phone where it will be mounted, with the vehicle on flat and level ground, then press Calibrate.'}
        {settings.calibration ? (
          <Text onPress={clearZero} style={styles.link} accessibilityRole="button"> Clear Zero</Text>
        ) : null}
      </ThemedText>

      <View style={[styles.cards, sideBySide && styles.cardsRow]}>
        <View style={[styles.card, sideBySide && { flex: 1 }]}>
          <Text style={styles.cardTitle}>Tilt Warnings</Text>
          <Row title="Warn Me" detail="Buzzes when you lean past your limit." value={settings.warn} onChange={setTiltWarnings} />
          <Limit label="Roll Limit" value={limits.roll} disabled={!settings.warn} onChange={(v) => setTiltLimits({ ...limits, roll: v })} />
          <Limit label="Pitch Limit" value={limits.pitch} disabled={!settings.warn} onChange={(v) => setTiltLimits({ ...limits, pitch: v })} />
          <Row title="Say It Out Loud" detail="Speaks the angle, like “Roll 28 left”." value={settings.voice} onChange={setTiltVoice} disabled={!settings.warn} />
          <Row title="Show in Map Mode and Ride Mode" detail="The Tilt tile over the map." value={settings.show} onChange={setTiltShown} />
          <ThemedText type="small" themeColor="textSecondary">
            Every vehicle tips at a different angle. These are reminders, not a promise you won’t roll. On a motorcycle, turn Warn Me off: leaning into turns is normal.
          </ThemedText>
        </View>

        <View style={[styles.card, sideBySide && { flex: 1 }]}>
          <View style={styles.cardHead}>
            <Icon name="warning" size={20} color={RideColors.red} />
            <Text style={styles.cardTitle}>Crash Alert</Text>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            In Ride Mode, a hard hit or a rollover followed by a stop starts a 30 second countdown. If you don’t tap I’m OK, your group gets an EMERGENCY alert with your location. A dropped phone doesn’t set it off.
          </ThemedText>
          <View accessibilityRole="radiogroup" style={{ gap: Spacing.one, opacity: crash.enabled ? 1 : 0.5 }}>
            <Text style={styles.rowTitle}>Sensitivity</Text>
            {CRASH_SENSITIVITIES.map((o) => (
              <Sensitivity key={o.value} {...o} on={crash.sensitivity === o.value} disabled={!crash.enabled} onPress={(v) => setCrashSettings({ ...crash, sensitivity: v })} />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Crash Alert tells your group only. It doesn’t call 911 or emergency services. It works while Ride Mode is open, and with no signal the alert sends as soon as your phone reconnects.
          </ThemedText>
        </View>
      </View>
    </Screen>
  );
}

/** The big Crash Alert switch at the top of the screen: one tap on or off, synced to your other devices. */
function CrashToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Crash Alert"
      accessibilityHint={on ? 'Turns Crash Alert off' : 'Turns Crash Alert on'}
      style={({ pressed }) => [styles.toggle, on ? styles.toggleOn : styles.toggleOff, pressed && { opacity: 0.85 }]}>
      <View style={[styles.toggleIcon, { backgroundColor: on ? RideColors.red : Colors.backgroundSelected }]}>
        <Icon name="warning" size={22} color={on ? '#FFFFFF' : Colors.textSecondary} strokeWidth={2.3} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleTitle}>Crash Alert {on ? 'On' : 'Off'}</Text>
        <Text style={styles.rowDetail}>
          {on ? 'Watching for a crash while Ride Mode is open.' : 'Your group won’t be told automatically if you crash.'}
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={onChange}
        accessibilityElementsHidden
        importantForAccessibility="no"
        trackColor={{ true: RideColors.red, false: Colors.backgroundSelected }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}

function Row({ title, detail, value, onChange, disabled }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Limit({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const step = (d: number) => onChange(clampLimit(value + d, value));
  return (
    <View
      style={[styles.row, disabled && { opacity: 0.5 }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: TILT_LIMIT_MIN, max: TILT_LIMIT_MAX, now: value, text: `${value} degrees` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => !disabled && step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Text style={[styles.rowTitle, { flex: 1 }]}>{label}</Text>
      <Pressable disabled={disabled || value <= TILT_LIMIT_MIN} onPress={() => step(-1)} style={styles.stepBtn} hitSlop={6} accessibilityLabel={`Lower ${label}`}>
        <Icon name="minus" size={20} color={Colors.text} />
      </Pressable>
      <Text style={styles.limitValue}>{value}°</Text>
      <Pressable disabled={disabled || value >= TILT_LIMIT_MAX} onPress={() => step(1)} style={styles.stepBtn} hitSlop={6} accessibilityLabel={`Raise ${label}`}>
        <Icon name="plus" size={20} color={Colors.text} />
      </Pressable>
    </View>
  );
}

function Sensitivity({ value, label, detail, on, disabled, onPress }: { value: CrashSensitivity; label: string; detail: string; on: boolean; disabled: boolean; onPress: (v: CrashSensitivity) => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={`${label}. ${detail}`}
      disabled={disabled}
      onPress={() => onPress(value)}
      style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  notice: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: RideColors.yellow, padding: Spacing.three, gap: 4 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, borderWidth: 2, width: '100%', maxWidth: 640, alignSelf: 'center' },
  toggleOn: { backgroundColor: Colors.backgroundElement, borderColor: RideColors.red },
  toggleOff: { backgroundColor: Colors.backgroundElement, borderColor: Colors.border },
  toggleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 24 },
  dials: { alignItems: 'center', gap: Spacing.four, paddingTop: Spacing.two },
  dialsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: Spacing.two, width: '100%', maxWidth: 520, alignSelf: 'center' },
  link: { color: Colors.sky, fontFamily: font(700) },
  cards: { gap: Spacing.three },
  cardsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  card: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.three },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowTitle: { color: Colors.text, fontFamily: font(600), fontSize: 16, lineHeight: 21 },
  rowDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  limitValue: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.control, borderWidth: 2, borderColor: 'transparent' },
  optionOn: { borderColor: Colors.sky },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.sky },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.sky },
}));
