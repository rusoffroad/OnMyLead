import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { DateCalendar } from '@/components/date-calendar';
import { daysAwayText, longDayText, quickDays, rideDayRange, sameDay, startOfDay } from '@/core/calendar';

/**
 * The ride's day: one tap for Today, Tomorrow or the coming weekend, or the calendar (type the date
 * or tap it) for any day up to three years out. `value` is local midnight in milliseconds. Same component on phones,
 * tablets and the website.
 */
export function RideDatePicker({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const today = startOfDay(new Date());
  const picked = new Date(value);
  const quick = quickDays(today);
  const onQuickDay = quick.some((q) => sameDay(q.day, picked));
  const [open, setOpen] = useState(!onQuickDay);

  function pick(d: Date) {
    onChange(d.getTime());
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

      {open ? (
        <DateCalendar
          value={picked}
          range={rideDayRange(today)}
          onChange={(d) => pick(d)}
          note="Pick any day from today up to three years out."
        />
      ) : null}
    </View>
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
});
