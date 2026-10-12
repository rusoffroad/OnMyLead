import '@/global.css';

import { Platform } from 'react-native';

/**
 * OnMyLead is always dark: the night navy of the logo, with its red and blue as the accents.
 * One palette for every screen, so nothing flashes white and the app reads the same at dawn or at noon.
 */
export const Colors = {
  /** Page background, the logo's navy lifted a touch so cards can sit on it. */
  background: '#0A1626',
  /** Cards and grouped rows. */
  backgroundElement: '#12223A',
  /** Inputs, selected rows, secondary buttons. */
  backgroundSelected: '#1B2F4C',
  border: '#27406A',
  text: '#F1F4F8',
  textSecondary: '#97A7BE',
  /** Logo red: the one colour that means "do this". */
  accent: '#E5262E',
  onAccent: '#FFFFFF',
  /** Logo blue: links, sharing, information. */
  sky: '#3B86F7',
  danger: '#F03E3E',
} as const;

export type ThemeColor = keyof typeof Colors;

/** Navigation chrome (headers, modals) in the same palette. */
export const NavigationColors = {
  primary: Colors.accent,
  background: Colors.background,
  card: Colors.background,
  text: Colors.text,
  border: Colors.backgroundElement,
  notification: Colors.accent,
};

/**
 * Barlow is drawn from American highway and trail signage; the condensed cut carries titles and
 * numbers, the regular cut carries everything else. Each weight is its own family so iOS, Android
 * and the web all render the same thing (see ThemedText, which maps fontWeight to these).
 */
export const FontFamilies = {
  body: {
    400: 'Barlow_400Regular',
    500: 'Barlow_500Medium',
    600: 'Barlow_600SemiBold',
    700: 'Barlow_700Bold',
    800: 'Barlow_800ExtraBold',
  },
  display: {
    400: 'BarlowCondensed_500Medium',
    500: 'BarlowCondensed_500Medium',
    600: 'BarlowCondensed_600SemiBold',
    700: 'BarlowCondensed_700Bold',
    800: 'BarlowCondensed_800ExtraBold',
  },
} as const;

export type FontWeightKey = keyof typeof FontFamilies.body;

/** The family for a weight, e.g. font(700) or font(800, 'display'). */
export function font(weight: number | string | undefined, cut: 'body' | 'display' = 'body') {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? (cut === 'display' ? 700 : 500) : Number(weight);
  const key = (w >= 800 ? 800 : w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400) as FontWeightKey;
  return FontFamilies[cut][key];
}

export const Fonts = Platform.select({
  ios: { mono: 'ui-monospace' },
  default: { mono: 'monospace' },
  web: { mono: 'var(--font-mono)' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  /** Chips and small controls. */
  pill: 999,
  /** Buttons and inputs. */
  control: 14,
  /** Cards and grouped lists. */
  card: 20,
} as const;

export const MaxContentWidth = 800;

/** Ride Bubble and role colors, tuned to read on the navy. Riders learn them once. */
export const RideColors = {
  green: '#3CC36B',
  yellow: '#FFB020',
  red: '#FF4545',
  unknown: '#7A8AA3',
  leader: '#3B86F7',
  sweep: '#B967F0',
  /** Plain grey, so the leader's logo blue is the only blue dot on the map. */
  rider: '#6E7681',
} as const;
