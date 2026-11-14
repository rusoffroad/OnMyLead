import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { DateCalendar } from '@/components/date-calendar';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { daysAwayText, longDayText, rideDayRange, startOfDay } from '@/core/calendar';
import { nearestQuickTime, quickTimes } from '@/core/quick-ride';
import { minutesLabel, minutesText, parseTime } from '@/core/time';
import { t } from '@/lib/i18n';

const ROW = 52;
const LIST_HEIGHT = ROW * 6;
const TIMES = quickTimes();

/**
 * Create a Ride's day and time: two plain fields side by side. Tap the day and a calendar opens;
 * tap the time and a list of times opens (quarter hours, already scrolled to the one picked).
 * Picking closes it. Same fields on iPhone, iPad, Android phones and tablets, and the website.
 * `day` is local midnight in milliseconds, `time` the form's text ("8:00 am").
 */
export function WhenFields({ day, onDay, time, onTime }: { day: number; onDay: (day: number) => void; time: string; onTime: (text: string) => void }) {
  const [open, setOpen] = useState<'day' | 'time' | null>(null);
  const list = useRef<ScrollView>(null);
  const today = startOfDay(new Date());
  const picked = new Date(day);
  const minutes = parseTime(time);
  const marked = minutes == null ? null : nearestQuickTime(minutes);
  const near = Math.round((startOfDay(picked).getTime() - today.getTime()) / 86_400_000) <= 1;
  const dayTitle = near ? daysAwayText(picked, today) : picked.toLocaleDateString(undefined, { weekday: 'long' });
  const dayDetail = picked.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(picked.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) });

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>{t('Day')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Day')}: ${longDayText(picked, today)}. ${t('Calendar')}`}
          onPress={() => setOpen('day')}
          style={({ pressed }) => [styles.field, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{dayTitle}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{dayDetail}</ThemedText>
          </View>
          <Icon name="calendar" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.cell}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>{t('Meet At')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Meet At')}: ${minutes == null ? t('Not Set') : minutesLabel(minutes)}. ${t('Change the time')}`}
          onPress={() => setOpen('time')}
          style={({ pressed }) => [styles.field, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{minutes == null ? t('Not Set') : minutesLabel(minutes)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{t('Change')}</ThemedText>
          </View>
          <Icon name="clock" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <BottomSheet visible={open === 'day'} onClose={() => setOpen(null)} title={t('Day')}>
        <DateCalendar
          value={picked}
          range={rideDayRange(today)}
          onChange={(d) => {
            onDay(d.getTime());
            setOpen(null);
          }}
          note={t('Pick any day from today up to three years out.')}
        />
      </BottomSheet>

      <BottomSheet visible={open === 'time'} onClose={() => setOpen(null)} title={t('Meet At')}>
        <ScrollView
          ref={list}
          nestedScrollEnabled
          style={{ height: LIST_HEIGHT }}
          accessibilityRole="radiogroup"
          // Opens with the picked time (or 8:00 am) a couple of rows from the top.
          onLayout={() => list.current?.scrollTo({ y: Math.max(0, TIMES.indexOf(marked ?? 8 * 60) - 2) * ROW, animated: false })}>
          {TIMES.map((m) => {
            const on = m === marked;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onTime(minutesText(m));
                  setOpen(null);
                }}
                style={({ pressed }) => [styles.time, on && { backgroundColor: Colors.accent }, pressed && { opacity: 0.8 }]}>
                <ThemedText style={[styles.timeText, on && { color: Colors.onAccent }]}>{minutesLabel(m)}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1, gap: 6, minWidth: 0 },
  label: { fontWeight: 600 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 64, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: Radius.control, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.backgroundElement,
  },
  value: { fontSize: 22, lineHeight: 26, fontFamily: font(700, 'display') },
  time: { height: ROW - 4, marginBottom: 4, paddingHorizontal: Spacing.three, borderRadius: Radius.control, justifyContent: 'center' },
  timeText: { fontSize: 18, fontFamily: font(600), fontVariant: ['tabular-nums'] },
}));
