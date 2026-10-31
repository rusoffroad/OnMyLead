import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  addMonths, canPageMonth, clampToRange, formatTypedDate, inRange, longDayText, monthGrid, monthInRange, monthText,
  parseTypedDate, rangeYears, sameDay, startOfDay, typedDateText, type DayRange,
} from '@/core/calendar';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isWeekend = (col: number) => col === 0 || col === 6;
/** The weekend columns carry a faint blue band: most group rides land there. */
const WEEKEND_BAND = 'rgba(59, 134, 247, 0.09)';

type Props = {
  /** The picked day (any time on it), or null when nothing is picked yet. */
  value: Date | null;
  /** Called with local midnight of the day typed or tapped. Only days inside `range` are ever passed. */
  onChange: (day: Date) => void;
  /** The first and last day that can be picked. */
  range: DayRange;
  /** A line under the grid, e.g. "Pick any day from today up to three years out." */
  note?: string;
};

/**
 * A day picker anyone can use two ways: type the date (MM/DD/YYYY on a number pad, the slashes go in
 * by themselves) or tap it on a month calendar. Tap the month's name to jump straight to another month
 * or year. Same component on iPhone, iPad, Android phones and tablets, and the website. Used by
 * Create a Ride; built to be reused anywhere a day is picked.
 */
export function DateCalendar({ value, onChange, range, note }: Props) {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => addMonths(clampToRange(value ?? today, range), 0));
  const [choosing, setChoosing] = useState(false);
  const [typed, setTyped] = useState(value ? typedDateText(value) : '');
  const [typedError, setTypedError] = useState<string | null>(null);
  // A day tapped on the grid (or picked elsewhere) shows in the box too: adjust during render, not in an effect.
  const [shown, setShown] = useState(value?.getTime() ?? null);
  if ((value?.getTime() ?? null) !== shown) {
    setShown(value?.getTime() ?? null);
    if (value && !sameDay(value, parseTypedDate(typed) ?? new Date(0))) {
      setTyped(typedDateText(value));
      setTypedError(null);
    }
    if (value && !sameDay(addMonths(value, 0), month)) setMonth(addMonths(value, 0));
  }

  const rangeText = `${typedDateText(range.first)} to ${typedDateText(range.last)}`;

  function pick(d: Date) {
    setMonth(addMonths(d, 0));
    setTypedError(null);
    onChange(startOfDay(d));
  }

  /** Checks a date once its year is whole: as soon as four digits are in, or a two-digit year when the box is left. */
  function settle(text: string) {
    const d = parseTypedDate(text);
    if (!d) {
      setTypedError('That date doesn’t exist. Check the month and day.');
      return;
    }
    if (!inRange(d, range)) {
      setTypedError(`Pick a day from ${rangeText}.`);
      setMonth(addMonths(clampToRange(d, range), 0));
      return;
    }
    setTyped(typedDateText(d));
    pick(d);
  }

  function onType(text: string) {
    const next = formatTypedDate(text);
    setTyped(next);
    setTypedError(null);
    if (/\/\d{4}$/.test(next)) settle(next);
  }

  function onLeave() {
    if (typed && !/\/\d{4}$/.test(typed)) {
      if (parseTypedDate(typed)) settle(typed);
      else setTypedError('Type the whole date, like 06/12/2027.');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={{ gap: 6 }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>Type a Date</ThemedText>
        <View style={[styles.typeRow, { borderColor: typedError ? Colors.danger : 'transparent' }]}>
          <Icon name="calendar" size={20} color={Colors.textSecondary} />
          <TextBox
            value={typed}
            onChangeText={onType}
            onBlur={onLeave}
            onSubmitEditing={onLeave}
            placeholder="MM/DD/YYYY"
            placeholderTextColor="#5F7190"
            selectionColor={Colors.sky}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            autoComplete="off"
            selectTextOnFocus
            autoCorrect={false}
            accessibilityLabel="Type a date, month, day, year"
            accessibilityHint={`Any day from ${rangeText}`}
            style={[styles.typeInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          />
        </View>
        {typedError ? (
          <ThemedText type="small" style={{ color: Colors.danger, fontWeight: 600 }} accessibilityLiveRegion="polite">
            {typedError}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.monthRow}>
        <MonthArrow back disabled={choosing || !canPageMonth(month, -1, range)} onPress={() => setMonth(addMonths(month, -1))} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${monthText(month)}. ${choosing ? 'Back to the days' : 'Choose a month or year'}`}
          accessibilityState={{ expanded: choosing }}
          onPress={() => setChoosing((c) => !c)}
          hitSlop={6}
          style={({ pressed }) => [styles.monthButton, choosing && { backgroundColor: Colors.backgroundSelected }, pressed && { opacity: 0.75 }]}>
          <ThemedText style={styles.monthTitle}>{monthText(month)}</ThemedText>
          <View style={{ transform: [{ rotate: choosing ? '-90deg' : '90deg' }] }}>
            <Icon name="chevron" size={18} color={Colors.sky} />
          </View>
        </Pressable>
        <MonthArrow disabled={choosing || !canPageMonth(month, 1, range)} onPress={() => setMonth(addMonths(month, 1))} />
      </View>

      {choosing ? (
        <MonthChooser
          month={month}
          picked={value}
          range={range}
          onChoose={(m) => {
            setMonth(m);
            setChoosing(false);
          }}
        />
      ) : (
        <DayGrid month={month} picked={value} today={today} range={range} onPick={pick} />
      )}

      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{note}</ThemedText>
      ) : null}
    </View>
  );
}

function DayGrid({ month, picked, today, range, onPick }: {
  month: Date;
  picked: Date | null;
  today: Date;
  range: DayRange;
  onPick: (d: Date) => void;
}) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.week}>
        {WEEKDAYS.map((w, col) => (
          <View key={col} style={[styles.cell, isWeekend(col) && styles.band, isWeekend(col) && styles.bandTop]}>
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
            const allowed = inRange(d, range);
            const on = picked ? sameDay(d, picked) : false;
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
    </View>
  );
}

/** Every allowed year as a row of chips, then that year's twelve months: two taps to anywhere in range. */
function MonthChooser({ month, picked, range, onChoose }: {
  month: Date;
  picked: Date | null;
  range: DayRange;
  onChoose: (m: Date) => void;
}) {
  const [year, setYear] = useState(month.getFullYear());
  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.years} accessibilityRole="radiogroup">
        {rangeYears(range).map((y) => {
          const on = y === year;
          return (
            <Pressable
              key={y}
              accessibilityRole="radio"
              accessibilityLabel={String(y)}
              accessibilityState={{ selected: on }}
              onPress={() => setYear(y)}
              style={({ pressed }) => [styles.year, { backgroundColor: on ? Colors.sky : Colors.backgroundSelected, opacity: pressed ? 0.8 : 1 }]}>
              <ThemedText style={[styles.yearText, { color: on ? Colors.onAccent : Colors.text }]}>{y}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.months}>
        {MONTHS.map((name, i) => {
          const m = new Date(year, i, 1);
          const allowed = monthInRange(m, range);
          const current = sameDay(m, month);
          const hasPick = picked ? picked.getFullYear() === year && picked.getMonth() === i : false;
          return (
            <View key={name} style={styles.monthCell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={monthText(m)}
                accessibilityState={{ selected: current, disabled: !allowed }}
                disabled={!allowed}
                onPress={() => onChoose(m)}
                style={({ pressed }) => [
                  styles.monthChip,
                  current && { borderColor: Colors.sky },
                  pressed && { backgroundColor: Colors.backgroundSelected },
                ]}>
                <ThemedText style={[styles.monthChipText, { opacity: allowed ? 1 : 0.3 }]}>{name}</ThemedText>
                {hasPick ? <View style={styles.pickDot} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
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
  wrap: { gap: Spacing.three, alignSelf: 'center', maxWidth: 480, width: '100%' },
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: 14, minHeight: 52,
    borderRadius: Radius.control, borderWidth: 1.5, backgroundColor: Colors.backgroundSelected,
  },
  typeInput: {
    flex: 1, minHeight: 50, color: Colors.text, fontSize: 20, letterSpacing: 1,
    fontFamily: font(600), fontVariant: ['tabular-nums'],
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill },
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
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  year: { borderRadius: Radius.pill, paddingHorizontal: 18, minHeight: 40, justifyContent: 'center' },
  yearText: { fontSize: 16, fontFamily: font(700), fontVariant: ['tabular-nums'] },
  months: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '33.333%', padding: 4 },
  monthChip: {
    minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  monthChipText: { fontSize: 17, fontFamily: font(600) },
  pickDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
});
