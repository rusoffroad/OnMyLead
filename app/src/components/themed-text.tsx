import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { font, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

const DISPLAY = new Set(['title', 'subtitle', 'heading']);

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const flat = StyleSheet.flatten([{ color: theme[themeColor ?? 'text'] }, styles[type], type === 'linkPrimary' && { color: theme.sky }, style]) as TextStyle;
  return <Text style={withFont(flat, DISPLAY.has(type) ? 'display' : 'body')} {...rest} />;
}

/**
 * Custom fonts ship one file per weight, so a weight is a family. This swaps fontWeight for the
 * matching Barlow family, which renders the same on iOS, Android and the web.
 */
export function withFont(style: TextStyle, cut: 'body' | 'display' = 'body'): TextStyle {
  if (style.fontFamily && !style.fontFamily.startsWith('Barlow')) return style;
  const display = cut === 'display' || style.fontFamily?.startsWith('BarlowCondensed');
  const { fontWeight, ...rest } = style;
  return { ...rest, fontFamily: font(fontWeight, display ? 'display' : 'body') };
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 23, fontWeight: 500 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
  /** Screen titles: condensed, tight, signage-like. */
  title: { fontSize: 44, lineHeight: 44, fontWeight: 800, letterSpacing: -0.5 },
  subtitle: { fontSize: 32, lineHeight: 34, fontWeight: 700, letterSpacing: -0.2 },
  /** Section headings inside a screen. */
  heading: { fontSize: 22, lineHeight: 26, fontWeight: 700 },
  link: { fontSize: 15, lineHeight: 22, fontWeight: 600 },
  linkPrimary: { fontSize: 15, lineHeight: 22, fontWeight: 600 },
  code: { fontFamily: Fonts.mono, fontSize: 12 },
});
