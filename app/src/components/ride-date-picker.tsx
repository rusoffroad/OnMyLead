import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  addMonths, canGoToMonth, canRideOn, daysAwayText, longDayText, monthGrid, monthText, quickDays, sameDay, startOfDay,
} from '@/core/calendar';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isWeekend = (col: number) => col === 0 || col === 6;
/** The weekend columns carry a faint blue band: most group rides land there. */
const WEEKEND_BAND = 'rgba(59, 134, 247, 0.09)';

/**
 * The ride's day: one tap for Today, Tomorrow or the coming weekend, or a month calendar for any
 * day up to a year out. `value` is local midnight in milliseconds. Same component on phones,
 * tablets and the website.
 */
export function RideDatePicker({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const today = startOfDay(new Date());
  const picked = new Date(value);
  const quick = quickDays(today);
  const onQuickDay = quick.some((q) => sameDay(q.day, picked));
  const [open, setOpen] = useState(!onQuickDay);
  const [month, setMonth] = useState(() => addMonths(picked, 0));

  function pick(d: Date) {
    onChange(d.getTime());
    setMonth(addMonths(d, 0));
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {quick.map((q) => {
          const on = sameDay(q.day, picked);
          return (
            <Pressable
              key={q.label}
              accessibilityRole="radio"
              accessibilityLabel={`${q.label}, ${longDayText(q.day, today)}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                pick(q.day);
                setOpen(false);
              }}
              style={[styles.chip, { backgroundColor: on ? Colors.accent : Colors.backgroundSelected }]}>
              <ThemedText style={[styles.chipText, { color: on ? Colors.onAccent : Colors.text }]}>{q.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ride day ${longDayText(picked, today)}. ${open ? 'Hide' : 'Show'} the calendar`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.picked, { borderColor: open ? Colors.accent : Colors.border, opacity: pressed ? 0.85 : 1 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={styles.pickedDay} numberOfLines={1} adjustsFontSizeToFit>
            {longDayText(picked, today)}
          </ThemedText>
          <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>{daysAwayText(picked, today)}</ThemedText>
        </View>
        <View style={styles.calendarButton}>
          <Icon name="calendar" size={20} color={open ? Colors.accent : Colors.text} />
          <ThemedText type="smallBold">{open ? 'Done' : 'Calendar'}</ThemedText>
        </View>
      </Pressable>

      {open ? <MonthCalendar month={month} setMonth={setMonth} picked={picked} today={today} onPick={(d) => { pick(d); setOpen(false); }} /> : null}
    </View>
  );
}

function MonthCalendar({ month, setMonth, picked, today, onPick }: {
  month: Date;
  setMonth: (m: Date) => void;
  picked: Date;
  today: Date;
  onPick: (d: Date) => void;
}) {
  const canBack = canGoToMonth(month, -1, today);
  const canNext = canGoToMonth(month, 1, today);
  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <MonthArrow back disabled={!canBack} onPress={() => setMonth(addMonths(month, -1))} />
        <ThemedText style={styles.monthTitle} accessibilityRole="header">{monthText(month)}</ThemedText>
        <MonthArrow disabled={!canNext} onPress={() => setMonth(addMonths(month, 1))} />
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((w, col) => (
          <View key={col} style={[styles.cell, isWeekend(col) && styles.band, col === 0 && styles.bandTop, col === 6 && styles.bandTop]}>
            <ThemedText
              accessibilityLabel={WEEKDAY_NAMES[col]}
              style={[styles.weekday, { color: isWeekend(col) ? Colors.sky : Colors.textSecondary }]}>
              {w}
            </ThemedText>
          </View>
        ))}
      </View>
      {monthGrid(month).map((row, r, rows) => (
        <View key={r} style={styles.week}>
          {row.map((d, col) => {
            const band = [isWeekend(col) && styles.band, isWeekend(col) && r === rows.length - 1 && styles.bandBottom];
            if (!d) return <View key={col} style={[styles.cell, ...band]} />;
            const allowed = canRideOn(d, today);
            const on = sameDay(d, picked);
            const isToday = sameDay(d, today);
            return (
              <View key={col} style={[styles.cell, ...band]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={longDayText(d, today)}
                  accessibilityState={{ selected: on, disabled: !allowed }}
                  disabled={!allowed}
                  onPress={() => onPick(d)}
                  hitSlop={2}
                  style={({ pressed }) => [
                    styles.day,
                    on && { backgroundColor: Colors.accent },
                    !on && isToday && { borderWidth: 1.5, borderColor: Colors.sky },
                    !on && pressed && { backgroundColor: Colors.backgroundSelected },
                  ]}>
                  <ThemedText
                    style={[
                      styles.dayText,
                      { color: on ? Colors.onAccent : allowed ? Colors.text : Colors.textSecondary, opacity: allowed ? 1 : 0.35 },
                      on && { fontFamily: font(700) },
                    ]}>
                    {d.getDate()}
                  </ThemedText>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Pick any day from today up to a year out.
      </ThemedText>
    </View>
  );
}

function MonthArrow({ back, disabled, onPress }: { back?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={back ? 'Previous Month' : 'Next Month'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.arrow, { opacity: disabled ? 0.25 : pressed ? 0.7 : 1 }]}>
      <View style={back ? { transform: [{ scaleX: -1 }] } : null}>
        <Icon name="chevron" size={22} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
  chipText: { fontSize: 15, fontFamily: font(600) },
  picked: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 12, paddingHorizontal: Spacing.three,
    borderRadius: Radius.control, borderWidth: 1.5, backgroundColor: Colors.background,
  },
  pickedDay: { fontSize: 26, lineHeight: 30, fontFamily: font(700, 'display') },
  calendarButton: { alignItems: 'center', gap: 2, minWidth: 64 },
  calendar: { gap: 2, alignSelf: 'center', maxWidth: 480, width: '100%' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  monthTitle: { fontSize: 22, lineHeight: 26, fontFamily: font(700, 'display') },
  arrow: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  week: { flexDirection: 'row' },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: WEEKEND_BAND },
  bandTop: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  bandBottom: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  weekday: { fontSize: 13, fontFamily: font(700) },
  day: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 17, fontFamily: font(500), fontVariant: ['tabular-nums'] },
});
