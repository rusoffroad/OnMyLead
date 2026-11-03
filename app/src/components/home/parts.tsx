import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Colors, font, Radius, Spacing } from '@/constants/theme';

/** The 2.0 home screen's own shades: a deeper card and a hairline, from the approved mock. */
export const Home = {
  panel: '#101E33',
  panel2: '#16273F',
  line: 'rgba(151,167,190,0.16)',
  muted: '#8C9CB3',
  gold: '#E6C27A',
  mint: '#57E3C3',
  ink: '#070F1C',
} as const;

/**
 * A soft vertical (or angled) gradient behind a card. react-native-svg works the same on iPhone,
 * Android and the web, so there's no extra native module.
 */
export function Gradient({ colors, angle = 'down', radius = 0 }: { colors: string[]; angle?: 'down' | 'diagonal'; radius?: number }) {
  const id = `g${colors.join('').replace(/[^a-zA-Z0-9]/g, '')}${angle}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={angle === 'diagonal' ? '1' : '0'} y2="1">
            {colors.map((c, i) => (
              <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A section title with an optional link or chip on the right. */
export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headTitle} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

/** A blue text link at the right of a section title. */
export function HeadLink({ title, onPress, label }: { title: string; onPress: () => void; label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} hitSlop={10} onPress={onPress}>
      {({ pressed }) => <Text style={[styles.link, pressed && { opacity: 0.6 }]}>{title}</Text>}
    </Pressable>
  );
}

/** A small rounded label: plan quotas, distances, counts. */
export function Pill({ text, tone = 'plain', style }: { text: string; tone?: 'plain' | 'gold' | 'onRed' | 'dark' | 'out'; style?: StyleProp<ViewStyle> }) {
  const t = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const PILL = {
  plain: { bg: 'rgba(255,255,255,0.06)', border: Home.line, fg: Colors.text },
  gold: { bg: 'rgba(230,194,122,0.14)', border: 'rgba(230,194,122,0.45)', fg: Home.gold },
  onRed: { bg: 'rgba(0,0,0,0.22)', border: 'rgba(255,255,255,0.28)', fg: '#fff' },
  dark: { bg: 'rgba(7,15,28,0.78)', border: 'transparent', fg: Colors.text },
  out: { bg: 'rgba(240,62,62,0.14)', border: 'rgba(240,62,62,0.45)', fg: '#FF8A8E' },
} as const;

/** A card in the home screen's card language: dark panel, hairline, generous corners. */
export function HomeCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A round initial for a rider or group with no photo. */
export function Initial({ name, size, color = '#2B4C7E' }: { name: string; size: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: font(700, 'display'), fontSize: Math.round(size * 0.42) }}>{(name.trim()[0] ?? 'R').toUpperCase()}</Text>
    </View>
  );
}

/** Steady colours for initials, picked from the rider's id so a rider keeps one. */
const FACE_COLORS = ['#2B4C7E', '#7A2E3A', '#2E6B5A', '#6B4FA0', '#8A5A2B', '#2F5E8C'];
export function faceColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return FACE_COLORS[Math.abs(h) % FACE_COLORS.length];
}

export const homeStyles = StyleSheet.create({
  muted: { color: Home.muted, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  cardTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 21, lineHeight: 23 },
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  headTitle: { color: Colors.text, fontFamily: font(600, 'display'), fontSize: 24, lineHeight: 28, flexShrink: 1 },
  link: { color: Colors.sky, fontFamily: font(600), fontSize: 14 },
  pill: { alignSelf: 'flex-start', borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: font(700), fontSize: 12, lineHeight: 16 },
  card: { borderRadius: 22, backgroundColor: Home.panel, borderWidth: 1, borderColor: Home.line, overflow: 'hidden' },
});
