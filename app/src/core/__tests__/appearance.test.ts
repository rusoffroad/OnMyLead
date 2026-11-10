import { describe, expect, it } from 'vitest';

import {
  buildPalette,
  DEFAULT_APPEARANCE,
  describeAppearance,
  MAP_INK,
  MAP_INK_CB,
  newerAppearance,
  parseAppearance,
  resolveScheme,
  RIDE_INK,
  RIDE_INK_CB,
  SKINS,
  statusSymbol,
  tileEdgeFor,
  type Appearance,
} from '../appearance';
import { contrast, deltaE, hexToRgb, simulate, withAlpha, type Vision } from '../color';

const VISIONS: Vision[] = ['protan', 'deutan', 'tritan'];
const SCHEMES = ['dark', 'light'] as const;

/** The smallest perceptual gap between any two colours, as each colour blind rider sees them. */
function minGap(colors: string[], vision: Vision) {
  let min = Infinity;
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++) min = Math.min(min, deltaE(simulate(colors[i], vision), simulate(colors[j], vision)));
  return min;
}

describe('color maths', () => {
  it('parses hex and builds rgba', () => {
    expect(hexToRgb('#0A1626')).toEqual([10, 22, 38]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(withAlpha('#E5262E', 0.5)).toBe('rgba(229,38,46,0.5)');
    expect(() => hexToRgb('red')).toThrow();
  });

  it('matches the WCAG contrast reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it('simulates colour blindness so red and green collapse for green-weak eyes', () => {
    expect(deltaE(simulate('#3CC36B', 'deutan'), simulate('#FF4545', 'deutan'))).toBeLessThan(deltaE('#3CC36B', '#FF4545') / 2);
    expect(simulate('#FFFFFF', 'tritan')).toBe('#FFFFFF');
  });
});

describe('every theme stays readable', () => {
  for (const skin of SKINS)
    for (const scheme of SCHEMES) {
      const s = skin[scheme];
      it(`${skin.name} ${scheme}: text and secondary text pass WCAG AA on every surface`, () => {
        for (const bg of [s.background, s.backgroundElement, s.backgroundSelected]) {
          expect(contrast(s.text, bg)).toBeGreaterThanOrEqual(7);
          expect(contrast(s.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`${skin.name} ${scheme}: logo red and blue read as buttons and links`, () => {
        const p = buildPalette({ ...DEFAULT_APPEARANCE, skin: skin.id, mode: scheme });
        // White on red is every action button.
        expect(contrast(p.colors.onAccent, p.colors.accent)).toBeGreaterThanOrEqual(4.5);
        // Red and blue as icons and links on the page (3:1 is the bar for icons and large text).
        expect(contrast(p.colors.accent, s.background)).toBeGreaterThanOrEqual(3);
        expect(contrast(p.colors.sky, s.background)).toBeGreaterThanOrEqual(3);
        expect(contrast(p.colors.gold, s.backgroundElement)).toBeGreaterThanOrEqual(3);
        expect(contrast(p.glass.amber, s.backgroundElement)).toBeGreaterThanOrEqual(3);
        // Scout teal: its chips and signs read on cards, and the picture on a sign reads on the teal.
        expect(contrast(p.colors.scout, s.backgroundElement)).toBeGreaterThanOrEqual(3);
        expect(contrast(p.colors.onScout, p.colors.scout)).toBeGreaterThanOrEqual(4.5);
      });
    }

  it('keeps logo red and blue the same family in every theme (never teal)', () => {
    for (const scheme of SCHEMES) {
      const p = buildPalette({ ...DEFAULT_APPEARANCE, mode: scheme });
      const [r, g, b] = hexToRgb(p.colors.accent);
      expect(r).toBeGreaterThan(g * 3);
      expect(r).toBeGreaterThan(b * 3);
      const [sr, sg, sb] = hexToRgb(p.colors.sky);
      expect(sb).toBeGreaterThan(sg);
      expect(sb).toBeGreaterThan(sr * 2);
    }
  });
});

describe('Color Blind Mode', () => {
  const tones = (ink: typeof RIDE_INK) => [ink.green, ink.yellow, ink.red, ink.unknown];

  for (const vision of VISIONS) {
    it(`rider statuses stay clearly apart for ${vision} vision`, () => {
      expect(minGap(tones(RIDE_INK_CB), vision)).toBeGreaterThanOrEqual(20);
      expect(minGap([RIDE_INK_CB.green, RIDE_INK_CB.yellow, RIDE_INK_CB.red, RIDE_INK_CB.sweep], vision)).toBeGreaterThanOrEqual(18);
    });

    it(`trail ratings, pins and the last three Track Line days stay apart for ${vision} vision`, () => {
      const d = MAP_INK_CB.difficulty;
      expect(minGap([d.easy, d.moderate, d.hard, d.extreme], vision)).toBeGreaterThanOrEqual(18);
      const o = MAP_INK_CB.obstacle;
      expect(minGap([o.obstacle, o.hazard, o.water, o.view], vision)).toBeGreaterThanOrEqual(15);
      expect(minGap(MAP_INK_CB.trackDays.slice(0, 3), vision)).toBeGreaterThanOrEqual(20);
    });
  }

  it('is a real improvement: the standard green and red nearly merge for red-green colour blindness', () => {
    expect(minGap([RIDE_INK.green, RIDE_INK.yellow, RIDE_INK.red], 'deutan')).toBeLessThan(minGap([RIDE_INK_CB.green, RIDE_INK_CB.yellow, RIDE_INK_CB.red], 'deutan'));
    expect(MAP_INK.trackDays).toHaveLength(MAP_INK_CB.trackDays.length);
  });

  it('switches the ride and map ink and gives every status a symbol', () => {
    const p = buildPalette({ ...DEFAULT_APPEARANCE, colorBlind: true });
    expect(p.ride).toBe(RIDE_INK_CB);
    expect(p.map).toBe(MAP_INK_CB);
    expect(new Set(['green', 'yellow', 'red', 'unknown'].map((t) => statusSymbol(t as 'green')))).toHaveProperty('size', 4);
  });
});

describe('tile edges (3.0)', () => {
  it('stand clearly off the background in every theme, dark and light', () => {
    for (const skin of SKINS) {
      for (const scheme of ['dark', 'light'] as const) {
        const s = skin[scheme];
        const edge = tileEdgeFor(s, scheme === 'dark');
        // Brighter than the theme's own border, and visible against both the page and the tile.
        expect(contrast(edge, s.background)).toBeGreaterThan(contrast(s.border, s.background));
        expect(contrast(edge, s.background)).toBeGreaterThanOrEqual(1.6);
        expect(contrast(edge, s.backgroundElement)).toBeGreaterThanOrEqual(1.4);
      }
    }
  });
});

describe('appearance choice', () => {
  it('defaults to Dark Night Navy, the look riders already know', () => {
    const p = buildPalette(DEFAULT_APPEARANCE);
    expect(p.scheme).toBe('dark');
    expect(p.colors.background).toBe('#0A1019');
    expect(p.colors.accent).toBe('#E5262E');
    expect(p.colors.sky).toBe('#3B86F7');
    expect(p.glass.panel).toBe('rgba(19,28,41,0.95)');
    expect(p.colors.tileEdge).toBe(tileEdgeFor(p.colors, true));
  });

  it('Match Phone follows the phone and falls back to dark', () => {
    expect(resolveScheme('auto', 'light')).toBe('light');
    expect(resolveScheme('auto', 'dark')).toBe('dark');
    expect(resolveScheme('auto', null)).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });

  it('parses saved and synced values safely', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('not json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ mode: 'neon', skin: 'pink', colorBlind: 'yes' })).toEqual(DEFAULT_APPEARANCE);
    const a = { mode: 'light', skin: 'desert', colorBlind: true, updatedAt: '2026-11-03T16:00:00.000Z' };
    expect(parseAppearance(JSON.stringify(a))).toEqual(a);
    expect(parseAppearance({ ...a, updatedAt: 'yesterday' }).updatedAt).toBeNull();
  });

  it('the newest change wins between devices', () => {
    const older: Appearance = { mode: 'light', skin: 'forest', colorBlind: false, updatedAt: '2026-11-01T00:00:00Z' };
    const newer: Appearance = { mode: 'dark', skin: 'carbon', colorBlind: true, updatedAt: '2026-11-02T00:00:00Z' };
    expect(newerAppearance(older, newer)).toBe(newer);
    expect(newerAppearance(newer, older)).toBe(newer);
    expect(newerAppearance(DEFAULT_APPEARANCE, older)).toBe(older);
    expect(newerAppearance(older, DEFAULT_APPEARANCE)).toBe(older);
  });

  it('describes the choice for the You tab', () => {
    expect(describeAppearance(DEFAULT_APPEARANCE)).toBe('Night Navy, Dark');
    expect(describeAppearance({ mode: 'auto', skin: 'desert', colorBlind: true, updatedAt: null })).toBe('Desert, Match Phone, Color Blind');
  });
});

describe('map ink', () => {
  it('points trail ratings, Track Line days and pins at the chosen ink, and back', async () => {
    const { applyMapInk } = await import('../ink');
    const { difficultyColor } = await import('../nav-trails');
    const { TRACK_DAY_COLORS } = await import('../track-line');
    const { OBSTACLE_INK } = await import('../obstacles');
    applyMapInk(MAP_INK_CB, 'dark');
    expect(difficultyColor('easy')).toBe(MAP_INK_CB.difficulty.easy);
    expect(TRACK_DAY_COLORS[0]).toBe(MAP_INK_CB.trackDays[0]);
    expect(OBSTACLE_INK.hazard).toBe(MAP_INK_CB.obstacle.hazard);
    applyMapInk(MAP_INK, 'light');
    expect(difficultyColor('hard')).toBe('#1A1D22');
    applyMapInk(MAP_INK, 'dark');
    expect(difficultyColor('hard')).toBe('#F2F4F7');
    expect(TRACK_DAY_COLORS).toEqual(MAP_INK.trackDays);
  });
});
