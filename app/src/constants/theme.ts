import '@/global.css';

import { Appearance as SystemAppearance, Platform, StyleSheet } from 'react-native';

import { buildPalette, parseAppearance, type Appearance, type Palette, type Scheme } from '@/core/appearance';
import { applyMapInk } from '@/core/ink';
import { readAppearanceSync } from '@/lib/appearance-storage';

/*
 * OnMyLead's colours come from the rider's appearance (core/appearance.ts): Dark, Light or Match
 * Phone, a theme, and Color Blind Mode. Dark Night Navy, the night navy of the logo with its red
 * and blue as accents, is the default. The objects below keep their names so every screen reads
 * colours the same way; applyAppearance() refills them and the root layout redraws the app.
 * Styles that use them are made with themedStyles() (below), never a bare StyleSheet.create.
 */

let appearance: Appearance = parseAppearance(readAppearanceSync());
let palette: Palette = buildPalette(appearance, SystemAppearance.getColorScheme());
let version = 0;

export const Colors: Palette['colors'] = { ...palette.colors };

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
  // On the website, letters Barlow doesn't have (Cyrillic, Chinese, Japanese, Korean, Hindi) fall
  // back to the system sans-serif instead of the browser's default serif. The phones do this alone.
  return Platform.OS === 'web' ? `${FontFamilies[cut][key]}, system-ui, sans-serif` : FontFamilies[cut][key];
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

/**
 * Panels and buttons that float over a live map (Ride Mode, Map Mode): glass in the theme's card
 * colour with a hairline edge, so the map shows through at the edges and every control reads as one family. Red stays for
 * Regroup and Emergency only.
 */
export const Glass: Palette['glass'] = { ...palette.glass };

/** Text on the dark name tags drawn on the map itself (rider names, waypoints): the map is the same in every theme. */
export const MapLabelText = '#F1F4F8';

/** The surface of a floating glass control. */
export const GlassSurface = { backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge };

/**
 * Ride Bubble and role colors, tuned to read on the map. Riders learn them once. Color Blind Mode
 * swaps them for the Okabe-Ito set (core/appearance.ts RIDE_INK_CB). `rider` stays plain grey, so
 * the leader's logo blue is the only blue dot on the map.
 */
export const RideColors: Palette['ride'] = { ...palette.ride };

applyMapInk(palette.map, palette.scheme);

/** The rider's current choice and the scheme being drawn. */
export const currentAppearance = () => appearance;
export const currentScheme = (): Scheme => palette.scheme;
/** Scroll bars that show on the current scheme. */
export const scrollIndicator = () => (palette.scheme === 'light' ? 'black' : 'white');
/** Color Blind Mode: statuses also show a symbol (core/appearance.ts statusSymbol). */
export const colorBlindOn = () => appearance.colorBlind;
/** Goes up by one on every change; the root layout keys the app on it to redraw everything. */
export const themeVersion = () => version;

/** Refills every colour object from a new choice. Returns true when anything visible changed. */
export function applyAppearance(next: Appearance, system: string | null | undefined): boolean {
  const p = buildPalette(next, system);
  appearance = next;
  if (JSON.stringify(p) === JSON.stringify(palette)) return false;
  palette = p;
  Object.assign(Colors, p.colors);
  Object.assign(NavigationColors, {
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    border: Colors.backgroundElement,
    notification: Colors.accent,
  });
  Object.assign(Glass, p.glass);
  Object.assign(GlassSurface, { backgroundColor: Glass.panel, borderColor: Glass.edge });
  Object.assign(RideColors, p.ride);
  applyMapInk(p.map, p.scheme);
  version += 1;
  return true;
}

/**
 * StyleSheet.create for styles that use theme colours. Write it exactly like StyleSheet.create,
 * with the object inside a function: `const styles = themedStyles(() => ({ card: {...} }))`.
 * The styles are built on first use and rebuilt after the theme changes; `styles.card` reads the
 * same as before everywhere else.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  make: () => T & StyleSheet.NamedStyles<T>,
): T {
  let built: T | null = null;
  let at = -1;
  const get = (): T => {
    if (!built || at !== version) {
      built = StyleSheet.create(make());
      at = version;
    }
    return built;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (get() as Record<string | symbol, unknown>)[key],
    has: (_t, key) => key in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
