import { ReactNode, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { font, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export function Screen({ children, scroll = true, top }: { children: ReactNode; scroll?: boolean; top?: boolean }) {
  const theme = useTheme();
  const inner = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={top ? ['top', 'bottom'] : ['bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" indicatorStyle="white" contentContainerStyle={{ paddingBottom: Spacing.five }}>
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

type ButtonProps = PressableProps & {
  title: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  big?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, kind = 'primary', big, loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const bg = { primary: theme.accent, danger: theme.danger, secondary: theme.backgroundSelected, ghost: 'transparent' }[kind];
  const fg = kind === 'secondary' || kind === 'ghost' ? theme.text : theme.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        kind === 'ghost' && { borderWidth: 1.5, borderColor: theme.border },
        pressed && kind !== 'ghost' && { opacity: 0.85 },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, big && styles.buttonTextBig, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, onFocus, onBlur, ...rest }: TextInputProps & { label: string; hint?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{label}</ThemedText>
      <TextInput
        placeholderTextColor="#5F7190"
        keyboardAppearance="dark"
        selectionColor={theme.sky}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { color: theme.text, borderColor: focused ? theme.sky : 'transparent', backgroundColor: theme.backgroundSelected },
          rest.multiline && { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
      {hint ? <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
}

/** A heading for a block of a screen, with an optional count or action on the right. */
export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header">{title}</ThemedText>
      {right}
    </View>
  );
}

/** Small coloured tag, e.g. Live, Leader, Sweep. */
export function Tag({ label, color, solid }: { label: string; color: string; solid?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: solid ? color : `${color}26` }]}>
      {solid ? <View style={styles.tagDot} /> : null}
      <Text style={[styles.tagText, { color: solid ? '#fff' : color }]}>{label}</Text>
    </View>
  );
}

function Chip({ label, on, onPress, role }: { label: string; on: boolean; onPress: () => void; role: 'radio' | 'checkbox' }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected: on } : { checked: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? theme.accent : theme.backgroundSelected }]}>
      <Text style={[styles.chipText, { color: on ? theme.onAccent : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Single-choice row of chips. */
export function Choice<T extends string | number | null>({
  label, options, value, onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{label}</ThemedText> : null}
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={String(o.value)} role="radio" label={o.label} on={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** Two or three equal options in one track, for switching modes (Sign in / Create account). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: theme.backgroundElement }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: theme.backgroundSelected }]}>
            <Text style={[styles.chipText, { color: on ? theme.text : theme.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Multi-choice chips. */
export function MultiChoice({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{label}</ThemedText>
      <View style={styles.chips}>
        {options.map((o) => {
          const on = value.includes(o);
          return <Chip key={o} role="checkbox" label={o} on={on} onPress={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])} />;
        })}
      </View>
    </View>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  const theme = useTheme();
  if (!error) return null;
  return <ThemedText style={{ color: theme.danger, fontWeight: 600 }} accessibilityLiveRegion="polite">{error}</ThemedText>;
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  button: { minHeight: 52, borderRadius: Radius.control, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  buttonBig: { minHeight: 68, borderRadius: 18 },
  buttonText: { fontSize: 17, fontFamily: font(600), textAlign: 'center' },
  buttonTextBig: { fontSize: 21, fontFamily: font(700, 'display'), letterSpacing: 0.2 },
  input: { minHeight: 52, borderWidth: 1.5, borderRadius: Radius.control, paddingHorizontal: 14, fontSize: 17, fontFamily: font(500) },
  card: { borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.two },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  tagText: { fontSize: 13, fontFamily: font(700) },
  segments: { flexDirection: 'row', borderRadius: Radius.control, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
  chipText: { fontSize: 15, fontFamily: font(600) },
});
