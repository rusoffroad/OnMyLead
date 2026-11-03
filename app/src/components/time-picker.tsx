import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { clockParts, fromClockParts, minutesLabel, minutesText, parseTime } from '@/core/time';

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
/** Wide enough for all twelve hours (or minutes) in one row: tablets and the website. */
const ONE_ROW_WIDTH = 560;

type Props = {
  label: string;
  /** The time as the form keeps it ("8:00 am"), or '' when it isn't set. */
  value: string;
  onChange: (text: string) => void;
  /** Can be left empty: shows "Not Set" with an Add button, and a Clear button while picking. */
  optional?: boolean;
  /** Minutes after midnight to start from when an empty time is added. */
  suggest?: number;
  /** A short line under the time, e.g. "30 min after you meet". */
  hint?: string;
  /** Start with the hour and minute tiles showing. */
  startOpen?: boolean;
};

/**
 * A time of day without typing: tap the time, then tap AM or PM, an hour and a minute (5-minute steps).
 * Big tiles that work with gloves on. Same component on iPhone, iPad, Android phones and tablets, and
 * the website, where the tiles are buttons you can reach with Tab and press with Enter or Space.
 */
export function TimePicker({ label, value, onChange, optional, suggest = 8 * 60, hint, startOpen }: Props) {
  const minutes = value ? parseTime(value) : null;
  const [open, setOpen] = useState(!!startOpen);
  const [wide, setWide] = useState(false);
  const parts = minutes == null ? null : clockParts(minutes);

  function set(hour: number, minute: number, pm: boolean) {
    onChange(minutesText(fromClockParts(hour, minute, pm)));
  }

  function toggle() {
    if (!open && minutes == null) onChange(minutesText(suggest));
    setOpen((o) => !o);
  }

  // Anything a tile sets starts from the time shown, or from the suggestion when nothing is set yet.
  const base = parts ?? clockParts(suggest);
  const shown = minutes == null ? 'Not Set' : minutesLabel(minutes);
  const tileBasis = wide ? '7%' : '14%';

  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}. ${open ? 'Done picking' : minutes == null ? 'Add a time' : 'Change the time'}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.picked, { borderColor: open ? Colors.accent : Colors.border, opacity: pressed ? 0.85 : 1 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={[styles.pickedTime, minutes == null && { color: Colors.textSecondary }]} numberOfLines={1}>
            {shown}
          </ThemedText>
          {hint && minutes != null ? (
            <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>{hint}</ThemedText>
          ) : null}
        </View>
        <View style={styles.sideButton}>
          <Icon name="clock" size={20} color={open ? Colors.accent : Colors.text} />
          <ThemedText type="smallBold">{open ? 'Done' : minutes == null ? 'Add' : 'Change'}</ThemedText>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.panel} onLayout={(e) => setWide(e.nativeEvent.layout.width >= ONE_ROW_WIDTH)}>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={`${label}, morning or afternoon`}>
            {[false, true].map((pm) => {
              const on = base.pm === pm && parts != null;
              return (
                <Pressable
                  key={pm ? 'pm' : 'am'}
                  accessibilityRole="radio"
                  accessibilityLabel={pm ? 'PM, afternoon and evening' : 'AM, morning'}
                  accessibilityState={{ selected: on }}
                  onPress={() => set(base.hour, base.minute, pm)}
                  style={({ pressed }) => [styles.segmentButton, on && styles.on, { opacity: pressed ? 0.85 : 1 }]}>
                  <ThemedText style={[styles.segmentText, { color: on ? Colors.onAccent : Colors.text }]}>{pm ? 'PM' : 'AM'}</ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>Hour</ThemedText>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={`${label}, hour`}>
            {HOURS.map((h) => {
              const on = parts?.hour === h;
              return (
                <Pressable
                  key={h}
                  accessibilityRole="radio"
                  accessibilityLabel={`${h} ${base.pm ? 'PM' : 'AM'}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => set(h, base.minute, base.pm)}
                  style={({ pressed }) => [styles.tile, { flexBasis: tileBasis }, on && styles.on, { opacity: pressed ? 0.85 : 1 }]}>
                  <ThemedText style={[styles.tileText, { color: on ? Colors.onAccent : Colors.text }]}>{h}</ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>Minute</ThemedText>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={`${label}, minute`}>
            {MINUTES.map((m) => {
              const on = parts?.minute === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityLabel={`${m} minutes past`}
                  accessibilityState={{ selected: on }}
                  onPress={() => set(base.hour, m, base.pm)}
                  style={({ pressed }) => [styles.tile, { flexBasis: tileBasis }, on && styles.onMinute, { opacity: pressed ? 0.85 : 1 }]}>
                  <ThemedText style={[styles.tileText, { color: on ? Colors.onAccent : Colors.text }]}>
                    :{String(m).padStart(2, '0')}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {optional ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label}`}
              onPress={() => {
                onChange('');
                setOpen(false);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.7 : 1 }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">Clear</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  picked: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 12, paddingHorizontal: Spacing.three,
    borderRadius: Radius.control, borderWidth: 1.5, backgroundColor: Colors.background,
  },
  pickedTime: { fontSize: 26, lineHeight: 30, fontFamily: font(700, 'display') },
  sideButton: { alignItems: 'center', gap: 2, minWidth: 64 },
  panel: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.control, backgroundColor: Colors.background },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentButton: {
    flex: 1, minHeight: 48, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundSelected,
  },
  segmentText: { fontSize: 18, fontFamily: font(700, 'display') },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1, minHeight: 48, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundSelected,
  },
  tileText: { fontSize: 18, fontFamily: font(600) },
  /** Hour and AM/PM in logo red, the minute in logo blue: the two picks read apart at a glance. */
  on: { backgroundColor: Colors.accent },
  onMinute: { backgroundColor: Colors.sky },
  clear: { alignSelf: 'flex-end', paddingVertical: 4 },
}));
