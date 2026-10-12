import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import {
  DEFAULT_SETTINGS, formatClock, GROUP_TOPICS, quietLengthHours, quietSegments, REMINDER_OPTIONS, stepClock, TOPIC_GROUPS,
  type NotificationSettings,
} from '@/core/notifications';
import { loadNotificationSettings, saveNotificationSettings } from '@/lib/notification-settings';
import { askPushPermission, openPhoneSettings, pushPermission, syncRideReminders, type PushPermission } from '@/lib/push';
import { useSession } from '@/lib/session';

/** What a rider hears about, and when. Every change saves as soon as it's made. */
export default function NotificationsScreen() {
  const { session, loading } = useSession();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [switchedOn, setSwitchedOn] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  useEffect(() => {
    if (!session) return;
    loadNotificationSettings()
      .then((s) => {
        setSettings(s.settings);
        setSwitchedOn(s.switchedOn);
      })
      .catch((e) => {
        setError((e as Error).message);
        setSwitchedOn(false);
      });
  }, [session]);

  // Coming back from the phone's Settings app: show the new permission straight away.
  const checkPermission = useCallback(() => {
    pushPermission().then(setPermission);
  }, []);
  useEffect(() => {
    checkPermission();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && checkPermission());
    return () => sub.remove();
  }, [checkPermission]);

  const editable = switchedOn === true;

  const change = async (patch: Partial<NotificationSettings>) => {
    if (!editable) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    setError(null);
    try {
      const saved = await saveNotificationSettings(patch);
      setSettings(saved);
      if ('reminder_minutes' in patch) syncRideReminders(saved.reminder_minutes);
    } catch (e) {
      setSettings(before);
      const groupsOff = GROUP_TOPICS.some((k) => k in patch) && /ride_invites|followed_leaders|schema cache/i.test((e as Error).message);
      setError(groupsOff ? 'Ride Invites and Leaders You Follow are not switched on yet. They start working with the next server update.' : `Couldn’t save that. ${(e as Error).message}`);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Notifications' }} />

      {Platform.OS === 'web' ? (
        <Note tone="info" title="Notifications Come to the iPhone App">
          Your choices here apply on your phone too.
        </Note>
      ) : permission === 'denied' ? (
        <Note tone="warn" title="Notifications Are Off for OnMyLead" action={{ title: 'Open iPhone Settings', onPress: openPhoneSettings }}>
          Your phone is blocking them, so nothing below can reach you. Turn on Allow Notifications for OnMyLead.
        </Note>
      ) : permission === 'undetermined' && session ? (
        <Note
          tone="warn"
          title="Let OnMyLead Send Notifications"
          action={{ title: 'Turn On Notifications', onPress: () => askPushPermission(session.user.id).then(setPermission) }}>
          So you hear when someone in your group needs help, even with the phone in your pocket.
        </Note>
      ) : null}

      {switchedOn === false && !error ? (
        <Note tone="info" title="Not Switched On Yet">
          These settings start working with the next server update. Until then, ride chat still pops up while the app is open.
        </Note>
      ) : null}
      <ErrorText error={error} />

      <View style={[styles.always, !editable && styles.dim]} accessible accessibilityLabel="Help and EMERGENCY alerts are always on, even in quiet hours.">
        <View style={styles.sos}>
          <Text style={styles.sosText}>SOS</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowTitle}>Help and EMERGENCY</Text>
          <Text style={styles.rowDetail}>When someone in your group taps Need help or EMERGENCY. Always on, even in quiet hours.</Text>
        </View>
      </View>

      {TOPIC_GROUPS.map((g) => (
        <View key={g.title} style={styles.group}>
          <Text style={styles.groupTitle} accessibilityRole="header">{g.title}</Text>
          <View style={styles.card}>
            {g.topics.map((t, i) => (
              <ToggleRow
                key={t.key}
                first={i === 0}
                title={t.title}
                detail={t.detail}
                value={settings[t.key]}
                disabled={!editable}
                onChange={(v) => change({ [t.key]: v })}
              />
            ))}
            {g.title === 'Before the Ride' ? (
              <ToggleRow
                title="Email When a Ride Is Cancelled"
                detail="An email if a ride you joined is cancelled or removed, as well as the notification."
                value={settings.ride_emails}
                disabled={!editable}
                onChange={(v) => change({ ride_emails: v })}
              />
            ) : null}
            {g.title === 'Ride Chat' ? (
              <ToggleRow
                title="Show Message Text"
                detail="Off keeps messages off your lock screen. You’ll see who wrote, not what."
                value={settings.previews}
                disabled={!editable}
                onChange={(v) => change({ previews: v })}
              />
            ) : null}
          </View>
          {g.title === 'Before the Ride' ? (
            <View style={[styles.reminder, !editable && styles.dim]} pointerEvents={editable ? 'auto' : 'none'}>
              <Text style={styles.rowTitle}>Ride reminder</Text>
              <Text style={styles.rowDetail}>A heads-up before each ride you’ve joined, with the meeting spot.</Text>
              <Choice options={REMINDER_OPTIONS} value={settings.reminder_minutes} onChange={(v) => change({ reminder_minutes: v })} />
            </View>
          ) : null}
        </View>
      ))}

      <QuietHours settings={settings} disabled={!editable} onChange={change} />
    </Screen>
  );
}

function ToggleRow({
  title, detail, value, onChange, disabled, first,
}: { title: string; detail: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; first?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityHint={detail}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, !first && styles.rowRule, disabled && styles.dim]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: Colors.accent, false: Colors.backgroundSelected }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.backgroundSelected}
        {...(Platform.OS === 'web' ? { activeThumbColor: Colors.text } : {})}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

const STARS = [0.04, 0.11, 0.19, 0.27, 0.36, 0.63, 0.71, 0.8, 0.88, 0.95];

/**
 * Quiet hours as a strip of the whole day, midnight to midnight, with the quiet stretch drawn as
 * night sky. Start and end move in half hours.
 */
function QuietHours({
  settings, disabled, onChange,
}: { settings: NotificationSettings; disabled: boolean; onChange: (p: Partial<NotificationSettings>) => void }) {
  const on = settings.quiet_hours;
  const segments = quietSegments(settings.quiet_start, settings.quiet_end);
  const hours = quietLengthHours(settings.quiet_start, settings.quiet_end);
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">Quiet hours</Text>
      <View style={[styles.card, { paddingBottom: on ? Spacing.three : 0 }]}>
        <ToggleRow
          first
          title="Silence Overnight"
          detail={on ? `Silent for ${hours % 1 ? hours.toFixed(1) : hours} hours a day. Help alerts still come through.` : 'Hold everything but help alerts overnight.'}
          value={on}
          disabled={disabled}
          onChange={(v) => onChange({ quiet_hours: v })}
        />
        {on ? (
          <View style={[styles.quiet, disabled && styles.dim]} pointerEvents={disabled ? 'none' : 'auto'}>
            <View
              style={styles.strip}
              accessible
              accessibilityLabel={`Quiet from ${formatClock(settings.quiet_start)} until ${formatClock(settings.quiet_end)}`}>
              {segments.map(([a, b]) => (
                <View key={a} style={[styles.night, { left: `${a * 100}%`, width: `${(b - a) * 100}%` }]}>
                  {STARS.filter((x) => x >= a && x <= b).map((x) => (
                    <View key={x} style={[styles.star, { left: `${((x - a) / (b - a)) * 100}%`, top: x * 37 % 14 + 5 }]} />
                  ))}
                </View>
              ))}
            </View>
            <View style={styles.ticks}>
              {['12 AM', '6 AM', 'Noon', '6 PM', '12 AM'].map((t, i) => (
                <Text key={i} style={styles.tick}>{t}</Text>
              ))}
            </View>
            <View style={styles.clocks}>
              <Clock label="From" minutes={settings.quiet_start} onStep={(d) => onChange({ quiet_start: stepClock(settings.quiet_start, d) })} />
              <Clock label="Until" minutes={settings.quiet_end} onStep={(d) => onChange({ quiet_end: stepClock(settings.quiet_end, d) })} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Clock({ label, minutes, onStep }: { label: string; minutes: number; onStep: (d: 1 | -1) => void }) {
  return (
    <View style={styles.clock}>
      <Text style={styles.clockLabel}>{label}</Text>
      <View style={styles.clockRow}>
        <StepButton sign="−" label={`${label} half an hour earlier`} onPress={() => onStep(-1)} />
        <Text style={styles.clockTime} accessibilityLiveRegion="polite">{formatClock(minutes)}</Text>
        <StepButton sign="+" label={`${label} half an hour later`} onPress={() => onStep(1)} />
      </View>
    </View>
  );
}

function StepButton({ sign, label, onPress }: { sign: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: Colors.border }]}>
      <Text style={styles.stepText}>{sign}</Text>
    </Pressable>
  );
}

function Note({
  tone, title, children, action,
}: { tone: 'info' | 'warn'; title: string; children: string; action?: { title: string; onPress: () => void } }) {
  return (
    <View style={[styles.note, { borderLeftColor: tone === 'warn' ? RideColors.yellow : Colors.sky }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{children}</ThemedText>
      {action ? <Button title={action.title} onPress={action.onPress} style={{ marginTop: Spacing.two }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.5 },
  note: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, padding: Spacing.three, gap: 4 },
  always: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three,
    borderRadius: Radius.card, borderWidth: 1.5, borderColor: 'rgba(255,69,69,0.55)', backgroundColor: 'rgba(255,69,69,0.08)',
  },
  sos: { width: 52, height: 52, borderRadius: 26, backgroundColor: RideColors.red, alignItems: 'center', justifyContent: 'center' },
  sosText: { color: '#fff', fontFamily: font(800, 'display'), fontSize: 19, letterSpacing: 0.5 },
  group: { gap: Spacing.two },
  groupTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26, marginTop: Spacing.two },
  card: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 14 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowTitle: { color: Colors.text, fontFamily: font(600), fontSize: 17, lineHeight: 22 },
  rowDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  reminder: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: 6 },
  quiet: { paddingHorizontal: Spacing.three, gap: 6 },
  strip: { height: 28, borderRadius: 8, backgroundColor: Colors.backgroundSelected, overflow: 'hidden' },
  night: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#03080F' },
  star: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#C9D6EA' },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 11 },
  clocks: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  clock: { flex: 1, gap: 4 },
  clockLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, padding: 4 },
  clockTime: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 24, lineHeight: 28, flexShrink: 1, textAlign: 'center' },
  step: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: Colors.text, fontFamily: font(600), fontSize: 24, lineHeight: 26 },
});
