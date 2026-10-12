import { Children, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';
import { AdminColors, tabular, toneColor, useLayoutSize, type Tone } from './tokens';

/**
 * One number. The figure is set in condensed Barlow like a trail marker; the coloured rule on
 * its left says what kind of number it is (blue for Pro, amber for trials, red for things that
 * need you).
 */
export function StatTile({ label, value, hint, tone = 'neutral', onPress }: { label: string; value: string | number; hint?: string; tone?: Tone; onPress?: () => void }) {
  const body = (
    <View style={[styles.tile, { borderLeftColor: tone === 'neutral' ? AdminColors.line : toneColor(tone) }]}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, tabular]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {hint ? <Text style={styles.hint} numberOfLines={2}>{hint}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ hovered, pressed }) => [{ borderRadius: 14 }, (hovered || pressed) && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

/** Lays tiles out 2, 3 or 4 across depending on the screen. */
export function StatGrid({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const size = useLayoutSize();
  const per = Math.min(max, size === 'phone' ? 2 : size === 'tablet' ? 3 : 4);
  const items = Children.toArray(children);
  return (
    <View style={styles.grid}>
      {items.map((c, i) => (
        <View key={i} style={{ width: `${100 / per}%`, padding: 6 }}>{c}</View>
      ))}
    </View>
  );
}

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneColor(tone);
  return (
    <View style={[styles.badge, { backgroundColor: `${c}22`, borderColor: `${c}55` }]}>
      <Text style={[styles.badgeText, { color: c }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** The tone for an account's plan label. */
export function planTone(label: string): Tone {
  return label === 'Admin' ? 'admin' : label === 'Pro' ? 'pro' : label === 'Pro Trial' ? 'trial' : 'free';
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  tile: {
    backgroundColor: AdminColors.panel, borderRadius: 14, borderWidth: 1, borderColor: AdminColors.line,
    borderLeftWidth: 4, paddingVertical: 14, paddingHorizontal: 16, gap: 2, minHeight: 104,
  },
  label: { fontFamily: font(600), fontSize: 13, color: AdminColors.dim },
  value: { fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 44, color: AdminColors.text },
  hint: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.faint },
  badge: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2 },
  badgeText: { fontFamily: font(700), fontSize: 12.5 },
});
