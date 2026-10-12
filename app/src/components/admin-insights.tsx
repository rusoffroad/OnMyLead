/**
 * Small pieces shared by the Admin Dashboard's money, analytics and health pages. The page frame,
 * tables, tiles and charts come from the shell's components in components/admin.
 */
import { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge, type Tone } from '@/components/admin';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { AdminError } from '@/lib/admin';

/**
 * Everyone, split by what they have right now: one bar, sized by headcount. The plan colours
 * match the badges used across the dashboard.
 */
export function PlanBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <View style={{ gap: Spacing.three }}>
      <View style={[styles.bar, { backgroundColor: Colors.backgroundSelected }]} accessibilityLabel={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {total
          ? parts.filter((p) => p.value > 0).map((p) => <View key={p.label} style={{ flex: p.value, backgroundColor: p.color }} />)
          : null}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.swatch, { backgroundColor: p.color }]} />
              <ThemedText type="small" themeColor="textSecondary">{p.label}</ThemedText>
            </View>
            <Text style={styles.count}>{p.value.toLocaleString('en-US')}</Text>
            <ThemedText type="small" themeColor="textSecondary">{total ? `${Math.round((p.value / total) * 100)}%` : '–'}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** What went wrong loading a block, in words that say what to do about it. */
export function LoadError({ error, what }: { error: AdminError | Error | null; what: string }) {
  if (!error) return null;
  const code = error instanceof AdminError ? error.code : 'failed';
  const text = {
    not_switched_on: `${what} is not switched on yet. It appears once the admin analytics database update is applied.`,
    mfa_required: 'Sign in again with your authenticator code to see this.',
    not_admin: 'This account is not an Admin.',
    failed: `${what} could not load: ${error.message}`,
  }[code];
  return <Notice tone={code === 'not_switched_on' ? 'muted' : 'danger'} text={text} />;
}

/** A one-line note inside a panel: setup needed, nothing yet, or a problem. */
export function Notice({ text, tone = 'muted', action }: { text: string; tone?: Tone; action?: ReactNode }) {
  const color = tone === 'danger' ? Colors.danger : tone === 'warn' ? '#FFB020' : Colors.textSecondary;
  return (
    <View style={[styles.notice, { borderColor: tone === 'muted' ? Colors.backgroundSelected : color }]}>
      <ThemedText type="small" style={{ color, flex: 1 }}>{text}</ThemedText>
      {action}
    </View>
  );
}

/** Label and value on one line, for short facts in a panel. */
export function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <View style={styles.fact}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      {tone ? <StatusBadge label={String(value)} tone={tone} /> : typeof value === 'string' || typeof value === 'number'
        ? <ThemedText type="smallBold">{value}</ThemedText> : value}
    </View>
  );
}

export function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(href)}>
      <ThemedText type="linkPrimary">{label}</ThemedText>
    </Pressable>
  );
}

/** A small text button for actions inside a table row or panel header. */
export function TextButton({ label, onPress, tone = 'sky', disabled }: { label: string; onPress: () => void; tone?: 'sky' | 'danger'; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} hitSlop={8} style={{ opacity: disabled ? 0.4 : 1 }}>
      <ThemedText type="link" style={{ color: tone === 'danger' ? Colors.danger : Colors.sky }}>{label}</ThemedText>
    </Pressable>
  );
}

/** A rider's name with their email under it. */
export function Who({ name, email }: { name: string | null; email: string | null }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <ThemedText type="smallBold" numberOfLines={1}>{name || 'No Name'}</ThemedText>
      {email ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{email}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 18, borderRadius: Radius.pill, overflow: 'hidden', flexDirection: 'row', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  legendItem: { minWidth: 96, gap: 0 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  count: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 30, lineHeight: 34 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.control, padding: Spacing.three },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, paddingVertical: 4 },
});
