import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { ReactNode, useContext, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, type PressableProps, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { font, MaxContentWidth, Radius, scrollIndicator, Spacing, themedStyles } from '@/constants/theme';
import { READABLE_WIDTH } from '@/core/layout';
import { useTheme } from '@/hooks/use-theme';
import type { FeatureKey } from '@/core/entitlements';
import { Icon } from './icon';
import { keyboardScroll, TextBox } from './keyboard';
import { ProTag } from './pro-tag';
import { ThemedText } from './themed-text';
import { t, tx } from '@/lib/i18n';

/**
 * A page. `width` caps how wide its content gets on a tablet or a wide window: 'page' (the default,
 * 800), 'readable' (640, for forms and reading) or 'wide' (1200, for screens that lay out their own
 * columns).
 */
export function Screen({
  children, scroll = true, top, width = 'page',
}: { children: ReactNode; scroll?: boolean; top?: boolean; width?: 'page' | 'readable' | 'wide' }) {
  const theme = useTheme();
  const inner = <View style={[styles.content, { maxWidth: SCREEN_WIDTHS[width] }]}>{children}</View>;
  // On a tab, the bottom tab bar already sits over the home indicator, so the page doesn't pad for
  // it twice. The tablet rail sits at the side (no height), so there the page pads for itself.
  const inTabs = !!useContext(BottomTabBarHeightContext);
  const edges = [...(top ? (['top'] as const) : []), ...(inTabs ? [] : (['bottom'] as const))];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.background }}>
      {scroll ? (
        <ScrollView
          // Keep the field being typed in above the keyboard, and let a drag or a tap on empty space put the keyboard away.
          automaticallyAdjustKeyboardInsets
          {...keyboardScroll}
          indicatorStyle={scrollIndicator()} contentContainerStyle={{ paddingBottom: Spacing.five }}>
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const SCREEN_WIDTHS = { page: MaxContentWidth, readable: READABLE_WIDTH, wide: 1200 } as const;

type ButtonProps = PressableProps & {
  title: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  big?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** A Pro-only action: shows the Pro tag beside the title for Free riders. The press handler still calls requirePro(). */
  pro?: FeatureKey;
};

export function Button({ title, kind = 'primary', big, loading, disabled, style, pro, ...rest }: ButtonProps) {
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
      ) : pro ? (
        <View style={styles.buttonRow}>
          <Text style={[styles.buttonText, big && styles.buttonTextBig, { color: fg, flexShrink: 1 }]}>{tx(title)}</Text>
          <ProTag feature={pro} />
        </View>
      ) : (
        <Text style={[styles.buttonText, big && styles.buttonTextBig, { color: fg }]}>{tx(title)}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, onFocus, onBlur, placeholder, trailing, ...rest }: TextInputProps & { label: string; hint?: string; trailing?: ReactNode }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{label}</ThemedText>
      <View>
      <TextBox
        placeholder={tx(placeholder)}
        placeholderTextColor="#5F7190"
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
          trailing ? { paddingRight: 52 } : null,
          style,
        ]}
        {...rest}
      />
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {hint ? <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText> : null}
    </View>
  );
}

/**
 * A password box with an eye button that shows or hides what was typed (sign-in, create account,
 * set a new password). Hidden by default; the choice resets each time the screen opens.
 */
export function PasswordField(props: Omit<TextInputProps, 'secureTextEntry'> & { label: string; hint?: string }) {
  const theme = useTheme();
  const [shown, setShown] = useState(false);
  const label = shown ? t('Hide Password') : t('Show Password');
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ checked: shown }}
          hitSlop={4}
          onPress={() => setShown((v) => !v)}
          style={({ pressed }) => [styles.eye, pressed && { opacity: 0.6 }]}>
          <Icon name={shown ? 'eyeOff' : 'eye'} size={22} color={theme.textSecondary} />
        </Pressable>
      }
    />
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
      <Text style={[styles.tagText, { color: solid ? '#fff' : color }]}>{tx(label)}</Text>
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
      <Text style={[styles.chipText, { color: on ? theme.onAccent : theme.text }]}>{tx(label)}</Text>
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
          <Chip key={String(o.value)} role="radio" label={t(o.label)} on={o.value === value} onPress={() => onChange(o.value)} />
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
            <Text style={[styles.chipText, { color: on ? theme.text : theme.textSecondary }]}>{tx(o.label)}</Text>
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

const styles = themedStyles(() => ({
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  button: { minHeight: 52, borderRadius: Radius.control, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  buttonBig: { minHeight: 68, borderRadius: 18 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 17, fontFamily: font(600), textAlign: 'center' },
  buttonTextBig: { fontSize: 21, fontFamily: font(700, 'display'), letterSpacing: 0.2 },
  trailing: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  eye: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
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
}));
