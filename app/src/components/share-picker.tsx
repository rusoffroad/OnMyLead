import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateCalendar } from '@/components/date-calendar';
import { Icon } from '@/components/icon';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { atMinutes, sameDateMonthsLater, startOfDay } from '@/core/calendar';
import { minutesUntil, shareEndProblem, shareEndText } from '@/core/sharing';
import { clockText, parseTime } from '@/core/time';
import { ThemedText } from './themed-text';
import { Button, ErrorText, Field } from './ui';

const label = (min: number) => (min < 60 ? `${min} Min` : min === 60 ? '1 Hour' : `${min / 60} Hours`);

/** A sensible end time for a day picked on the calendar: 6 pm, or an hour from now when that's later today. */
function defaultEndTime(day: Date, now: Date): string {
  const sixPm = atMinutes(day, 18 * 60)!;
  if (sixPm.getTime() > now.getTime() + 30 * 60_000) return '6:00 pm';
  const inAnHour = new Date(now.getTime() + 60 * 60_000);
  inAnHour.setMinutes(inAnHour.getMinutes() < 30 ? 30 : 60, 0, 0);
  return clockText(inAnHour);
}

/**
 * How long a share runs: one tap for a few hours, "Until I Turn It Off", or an exact end on a
 * calendar (a day plus a time, up to a year out). Same component on phones, tablets and the website.
 * `onPick` gets minutes from now, or null for "until I turn it off".
 */
export function SharePicker({
  options, openLabel, openHint, onPick, busy,
}: {
  options: (number | null)[];
  openLabel: string;
  /** One line under the open-ended button saying what stops it. */
  openHint: string;
  onPick: (minutes: number | null) => void;
  busy?: boolean;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState('6:00 pm');
  const [error, setError] = useState<string | null>(null);
  const timed = options.filter((o): o is number => o != null);
  const hasOpen = options.includes(null);

  const now = new Date();
  const today = startOfDay(now);
  const minutes = parseTime(time);
  const endAt = day && minutes != null ? atMinutes(day, minutes)!.getTime() : null;
  const problem = shareEndProblem(endAt, now.getTime());

  function pickDay(d: Date) {
    setDay(d);
    setTime(defaultEndTime(d, new Date()));
    setError(null);
  }

  function shareUntil() {
    if (problem || endAt == null) return setError(minutes == null && day ? 'Time looks off. Try "6:00 pm".' : problem);
    onPick(minutesUntil(endAt, new Date().getTime()));
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {timed.map((o) => (
          <Button
            key={o}
            title={label(o)}
            kind="secondary"
            big
            disabled={busy}
            onPress={() => onPick(o)}
            style={{ flexGrow: 1, flexBasis: timed.length > 3 ? '40%' : '28%' }}
          />
        ))}
      </View>

      {hasOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${openLabel}. ${openHint}`}
          accessibilityState={{ disabled: !!busy }}
          disabled={busy}
          onPress={() => onPick(null)}
          style={({ pressed }) => [styles.open, { opacity: busy ? 0.5 : pressed ? 0.85 : 1 }]}>
          <View style={styles.openIcon}>
            <Icon name="locate" size={22} color={Colors.sky} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={styles.openTitle}>{openLabel}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{openHint}</ThemedText>
          </View>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: calendarOpen }}
        onPress={() => setCalendarOpen((o) => !o)}
        style={({ pressed }) => [styles.endRow, { borderColor: calendarOpen ? Colors.accent : Colors.border, opacity: pressed ? 0.85 : 1 }]}>
        <Icon name="calendar" size={20} color={calendarOpen ? Colors.accent : Colors.text} />
        <ThemedText style={[styles.endRowText, { flex: 1 }]}>Pick an End Date</ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">{calendarOpen ? 'Hide' : 'Calendar'}</ThemedText>
      </Pressable>

      {calendarOpen ? (
        <View style={{ gap: Spacing.three }}>
          <DateCalendar
            value={day}
            onChange={pickDay}
            range={{ first: today, last: sameDateMonthsLater(now, 12) }}
            note="Sharing stops on its own at the day and time you pick, up to a year out."
          />
          {day ? (
            <>
              <Field label="Stop Sharing At" value={time} onChangeText={(t) => { setTime(t); setError(null); }} placeholder="6:00 pm" />
              <Button
                title={problem ? 'Share Until Then' : `Share ${capitalize(shareEndText(endAt, now.getTime()))}`}
                big
                disabled={busy}
                onPress={shareUntil}
              />
            </>
          ) : null}
          <ErrorText error={error} />
        </View>
      ) : null}
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  open: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, minHeight: 64,
    borderRadius: Radius.control, borderWidth: 1.5, borderColor: Colors.sky, backgroundColor: 'rgba(59, 134, 247, 0.10)',
  },
  openIcon: { width: 40, height: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59, 134, 247, 0.18)' },
  openTitle: { fontSize: 17, fontFamily: font(700) },
  endRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, minHeight: 52,
    borderRadius: Radius.control, borderWidth: 1.5, backgroundColor: Colors.background,
  },
  endRowText: { fontSize: 16, fontFamily: font(600) },
});
