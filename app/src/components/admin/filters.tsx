import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { font } from '@/constants/theme';
import { customRange, rangeFor, type DateRange, type RangePreset } from '@/core/admin-format';
import { AdminColors } from './tokens';

export type { DateRange, RangePreset };
export { rangeFor };

/** Search field. onChange fires 300 ms after typing stops. */
export function SearchBox({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <View style={[styles.search, focused && { borderColor: AdminColors.blue }]}>
      <Icon name="search" size={18} color={AdminColors.faint} />
      <TextInput
        value={text}
        placeholder={placeholder}
        placeholderTextColor={AdminColors.faint}
        accessibilityLabel={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(t) => {
          setText(t);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(t.trim()), 300);
        }}
        onSubmitEditing={() => onChange(text.trim())}
        style={styles.searchInput}
      />
    </View>
  );
}

/** One choice from a row of chips (filters such as Active, Expiring, Expired). */
export function FilterChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={({ hovered }) => [styles.chip, on ? styles.chipOn : hovered ? { borderColor: AdminColors.dim } : null]}>
            <Text style={[styles.chipText, on && { color: AdminColors.text }]}>
              {o.label}{o.count != null ? `  ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '12m', label: '12 Months' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

/** Preset windows, or two dates (YYYY-MM-DD, both days included, UTC). */
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [custom, setCustom] = useState(value.preset === 'custom');
  const [from, setFrom] = useState(value.from.slice(0, 10));
  const [to, setTo] = useState(new Date(new Date(value.to).getTime() - 86_400_000).toISOString().slice(0, 10));
  const bad = custom && !customRange(from, to);
  return (
    <View style={{ gap: 8, alignItems: 'flex-end' }}>
      <FilterChips
        options={PRESETS}
        value={custom ? 'custom' : value.preset}
        onChange={(p) => {
          if (p === 'custom') return setCustom(true);
          setCustom(false);
          onChange(rangeFor(p));
        }}
      />
      {custom ? (
        <View style={styles.customRow}>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
          <Pressable
            accessibilityRole="button"
            disabled={bad}
            onPress={() => {
              const r = customRange(from, to);
              if (r) onChange(r);
            }}
            style={[styles.apply, bad && { opacity: 0.4 }]}>
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.dateBox}>
      <Text style={styles.dateLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={AdminColors.faint}
        accessibilityLabel={`${label} date`}
        maxLength={10}
        style={styles.dateInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: AdminColors.page, borderRadius: 12,
    borderWidth: 1.5, borderColor: AdminColors.line, paddingHorizontal: 12, minHeight: 44, flexGrow: 1, maxWidth: 420,
  },
  searchInput: { flex: 1, minWidth: 0, fontFamily: font(500), fontSize: 15, color: AdminColors.text, paddingVertical: 10, outlineStyle: 'none' } as object,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: AdminColors.line, paddingHorizontal: 13, paddingVertical: 7 },
  chipOn: { backgroundColor: AdminColors.raised, borderColor: AdminColors.red },
  chipText: { fontFamily: font(600), fontSize: 13.5, color: AdminColors.dim },
  customRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  dateBox: { gap: 3 },
  dateLabel: { fontFamily: font(600), fontSize: 12, color: AdminColors.faint },
  dateInput: {
    fontFamily: font(500), fontSize: 14, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1,
    borderColor: AdminColors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, width: 130,
  },
  apply: { backgroundColor: AdminColors.red, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  applyText: { fontFamily: font(700), fontSize: 14, color: '#FFFFFF' },
});
