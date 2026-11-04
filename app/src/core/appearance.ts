// How the app looks for one rider: Dark, Light or Match Phone, a theme (skin), and Color Blind
// Mode. Pure data and rules, shared by iPhone, iPad, Android and the website; constants/theme.ts
// applies the palette and lib/appearance.ts saves the choice (and hands it to account sync).

import { mix, withAlpha } from './color';

export type AppearanceMode = 'dark' | 'light' | 'auto';
export type Scheme = 'dark' | 'light';
export type SkinId = 'navy' | 'carbon' | 'desert' | 'forest';

export type Appearance = {
  mode: AppearanceMode;
  skin: SkinId;
  colorBlind: boolean;
  /** When the rider last changed it (ISO), so the newest choice wins between devices. */
  updatedAt: string | null;
};

/** Dark Night Navy, the look OnMyLead has always had, stays the default. */
export const DEFAULT_APPEARANCE: Appearance = { mode: 'dark', skin: 'navy', colorBlind: false, updatedAt: null };

export const MODES: { value: AppearanceMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Match Phone' },
];

/** The six surface colours a theme sets. Logo red and blue are the same in every theme. */
export type Surfaces = {
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  border: string;
  text: string;
  textSecondary: string;
};

export type Skin = { id: SkinId; name: string; blurb: string; dark: Surfaces; light: Surfaces };

export const SKINS: Skin[] = [
  {
    id: 'navy',
    name: 'Night Navy',
    blurb: 'The classic OnMyLead look',
    dark: { background: '#0A1626', backgroundElement: '#12223A', backgroundSelected: '#1B2F4C', border: '#27406A', text: '#F1F4F8', textSecondary: '#97A7BE' },
    light: { background: '#EEF2F7', backgroundElement: '#FFFFFF', backgroundSelected: '#E1E8F2', border: '#C9D4E3', text: '#0A1626', textSecondary: '#4F5F77' },
  },
  {
    id: 'carbon',
    name: 'Carbon',
    blurb: 'True black, easy on the battery',
    dark: { background: '#000000', backgroundElement: '#141416', backgroundSelected: '#1F1F23', border: '#34343B', text: '#F4F4F5', textSecondary: '#A1A1AA' },
    light: { background: '#F2F2F3', backgroundElement: '#FFFFFF', backgroundSelected: '#E6E6E9', border: '#D2D2D7', text: '#111113', textSecondary: '#5A5A64' },
  },
  {
    id: 'desert',
    name: 'Desert',
    blurb: 'Warm sand and dust',
    dark: { background: '#17120C', backgroundElement: '#241C13', backgroundSelected: '#33281B', border: '#4F3E29', text: '#F5EEE3', textSecondary: '#B8A68C' },
    light: { background: '#F6EFE4', backgroundElement: '#FFFBF4', backgroundSelected: '#EDE2D1', border: '#D8C8B0', text: '#2A1F12', textSecondary: '#67553D' },
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Deep pine green',
    dark: { background: '#0C1610', backgroundElement: '#15231A', backgroundSelected: '#1F3326', border: '#31503B', text: '#EEF4EE', textSecondary: '#9DB2A1' },
    light: { background: '#EDF2EA', backgroundElement: '#FFFFFF', backgroundSelected: '#DEE8DA', border: '#C5D3C0', text: '#13241A', textSecondary: '#4A5F50' },
  },
];

export const skinById = (id: SkinId) => SKINS.find((s) => s.id === id) ?? SKINS[0];

/** Brand colours, tuned per scheme so they read on dark and on light surfaces. */
const BRAND: Record<Scheme, { accent: string; sky: string; danger: string; gold: string; amber: string; softRed: string; scout: string; onScout: string }> = {
  dark: { accent: '#E5262E', sky: '#3B86F7', danger: '#F03E3E', gold: '#E6C27A', amber: '#F2B233', softRed: '#FF6B70', scout: '#2EE6C4', onScout: '#06261F' },
  light: { accent: '#D61F27', sky: '#1F6FE5', danger: '#D42A2A', gold: '#8A6512', amber: '#9A6300', softRed: '#C8242B', scout: '#007A68', onScout: '#FFFFFF' },
};

/** Rider status (Ride Bubble), roles and the dots on the map. */
export type RideInk = { green: string; yellow: string; red: string; unknown: string; leader: string; sweep: string; rider: string };

export const RIDE_INK: RideInk = { green: '#3CC36B', yellow: '#FFB020', red: '#FF4545', unknown: '#7A8AA3', leader: '#3B86F7', sweep: '#B967F0', rider: '#6E7681' };

/**
 * Color Blind Mode, built on the Okabe-Ito set: sky blue for OK, yellow for waiting, vermilion for
 * trouble and reddish purple for sweep stay apart for red-weak, green-weak and blue-weak eyes
 * (core/__tests__/appearance.test.ts proves it). Status chips also carry a symbol (statusSymbol).
 */
export const RIDE_INK_CB: RideInk = { green: '#56B4E9', yellow: '#F0E442', red: '#D55E00', unknown: '#8E8E8E', leader: '#3B86F7', sweep: '#CC79A7', rider: '#6E7681' };

/** A symbol for each status so colour is never the only clue (shown in Color Blind Mode). */
export function statusSymbol(tone: 'green' | 'yellow' | 'red' | 'unknown'): string {
  return { green: '✓', yellow: '!', red: '✕', unknown: '?' }[tone];
}

/** Trail ratings, Track Line days and trail pins: the colours the map draws. */
export type MapInk = {
  difficulty: { easy: string; moderate: string; hard: string; extreme: string };
  trackDays: string[];
  obstacle: { obstacle: string; hazard: string; water: string; view: string };
};

export const MAP_INK: MapInk = {
  difficulty: { easy: '#3CC36B', moderate: '#3B86F7', hard: '#F2F4F7', extreme: '#E5262E' },
  trackDays: ['#FF3B44', '#3B86F7', '#E6C27A', '#57E3C3', '#B48CFF', '#FF9F43', '#F1F4F8'],
  obstacle: { obstacle: '#FF9F43', hazard: '#FF4545', water: '#3B86F7', view: '#57E3C3' },
};

export const MAP_INK_CB: MapInk = {
  difficulty: { easy: '#F0E442', moderate: '#3B86F7', hard: '#F2F4F7', extreme: '#D55E00' },
  trackDays: ['#F0E442', '#56B4E9', '#D55E00', '#CC79A7', '#F2F2F2', '#E69F00', '#0072B2'],
  obstacle: { obstacle: '#E69F00', hazard: '#D55E00', water: '#56B4E9', view: '#CC79A7' },
};

export type Palette = {
  scheme: Scheme;
  colors: Surfaces & { textSoft: string; accent: string; onAccent: string; sky: string; danger: string; gold: string; scout: string; onScout: string; scrim: string };
  glass: { panel: string; tile: string; edge: string; redTint: string; redEdge: string; amberTint: string; amber: string; softRed: string };
  ride: RideInk;
  map: MapInk;
};

/** Which scheme to draw, given the rider's mode and the phone's own setting. */
export function resolveScheme(mode: AppearanceMode, system: string | null | undefined): Scheme {
  if (mode === 'auto') return system === 'light' ? 'light' : 'dark';
  return mode;
}

export function buildPalette(a: Appearance, system?: string | null): Palette {
  const scheme = resolveScheme(a.mode, system);
  const s = skinById(a.skin)[scheme];
  const b = BRAND[scheme];
  const dark = scheme === 'dark';
  return {
    scheme,
    colors: { ...s, textSoft: mix(s.text, s.textSecondary, 0.5), accent: b.accent, onAccent: '#FFFFFF', sky: b.sky, danger: b.danger, gold: b.gold, scout: b.scout, onScout: b.onScout, scrim: dark ? 'rgba(3,9,18,0.72)' : 'rgba(10,22,38,0.42)' },
    glass: {
      panel: withAlpha(s.backgroundElement, dark ? 0.95 : 0.96),
      tile: dark ? 'rgba(255,255,255,0.06)' : 'rgba(10,22,38,0.05)',
      edge: withAlpha(s.textSecondary, dark ? 0.18 : 0.28),
      redTint: dark ? 'rgba(229,38,46,0.10)' : 'rgba(214,31,39,0.08)',
      redEdge: dark ? 'rgba(229,38,46,0.42)' : 'rgba(214,31,39,0.38)',
      amberTint: dark ? 'rgba(242,178,51,0.16)' : 'rgba(242,178,51,0.20)',
      amber: b.amber,
      softRed: b.softRed,
    },
    ride: a.colorBlind ? RIDE_INK_CB : RIDE_INK,
    map: a.colorBlind ? MAP_INK_CB : MAP_INK,
  };
}

const isMode = (v: unknown): v is AppearanceMode => v === 'dark' || v === 'light' || v === 'auto';
const isSkin = (v: unknown): v is SkinId => SKINS.some((s) => s.id === v);

/** Reads a saved or synced choice; anything unknown falls back to the default, never throws. */
export function parseAppearance(raw: unknown): Appearance {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return DEFAULT_APPEARANCE;
    }
  }
  if (!v || typeof v !== 'object') return DEFAULT_APPEARANCE;
  const o = v as Record<string, unknown>;
  return {
    mode: isMode(o.mode) ? o.mode : DEFAULT_APPEARANCE.mode,
    skin: isSkin(o.skin) ? o.skin : DEFAULT_APPEARANCE.skin,
    colorBlind: o.colorBlind === true,
    updatedAt: typeof o.updatedAt === 'string' && !Number.isNaN(Date.parse(o.updatedAt)) ? o.updatedAt : null,
  };
}

export const sameAppearance = (a: Appearance, b: Appearance) => a.mode === b.mode && a.skin === b.skin && a.colorBlind === b.colorBlind;

/**
 * Two devices disagree (account sync): the one changed most recently wins. A device that never
 * changed it (updatedAt null) always yields to one that did.
 */
export function newerAppearance(local: Appearance, remote: Appearance): Appearance {
  const t = (a: Appearance) => (a.updatedAt ? Date.parse(a.updatedAt) : -Infinity);
  return t(remote) > t(local) ? remote : local;
}

/** One line for the You tab row, e.g. "Night Navy, Dark" or "Desert, Match Phone, Color Blind". */
export function describeAppearance(a: Appearance, tr: (s: string) => string = (s) => s): string {
  const parts = [skinById(a.skin).name, MODES.find((m) => m.value === a.mode)?.label ?? 'Dark'];
  if (a.colorBlind) parts.push('Color Blind');
  return parts.map(tr).join(', ');
}
