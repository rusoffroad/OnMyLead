import { describe, expect, it } from 'vitest';

import { DEFAULT_DOT_STYLE, DOT_STYLE_NAME, DOT_STYLES, ownDotBox, ownDotSvg, parseDotStyle } from '../own-dot-art';

describe('own dot art', () => {
  it('defaults to Red, White and Blue, listed first, and keeps a saved Safety Orange', () => {
    expect(DEFAULT_DOT_STYLE).toBe('flag');
    expect(DOT_STYLES[0]).toBe('flag');
    expect(DOT_STYLE_NAME.flag).toBe('Red, White and Blue');
    expect(parseDotStyle(null)).toBe('flag');
    expect(parseDotStyle('nope')).toBe('flag');
    expect(parseDotStyle('orange')).toBe('orange');
    for (const s of DOT_STYLES) expect(parseDotStyle(s)).toBe(s);
    expect(Object.keys(DOT_STYLE_NAME).sort()).toEqual([...DOT_STYLES].sort());
  });
  it('draws every style centred in its box, with a beam only when the direction is known', () => {
    for (const s of DOT_STYLES) {
      const box = ownDotBox(33);
      const moving = ownDotSvg(s, 33, 90, true, 'x');
      expect(moving).toContain(`viewBox="0 0 ${box} ${box}"`);
      expect(moving).toContain('url(#xb)');
      expect(moving).toContain(`rotate(90 ${box / 2} ${box / 2})`);
      const still = ownDotSvg(s, 33, null, false, 'x');
      expect(still).not.toContain('url(#xb)');
      expect(still).not.toContain('rotate(');
      // Every gradient the drawing uses is defined in it.
      for (const svg of [moving, still]) {
        for (const [, ref] of svg.matchAll(/url\(#(\w+)\)/g)) expect(svg).toContain(`id="${ref}"`);
      }
    }
  });
  it('keeps gradient ids apart between dots on one page', () => {
    expect(ownDotSvg('dome', 33, 0, true, 'a')).not.toContain('id="bb"');
    expect(ownDotSvg('dome', 33, 0, true, 'a')).toContain('id="ab"');
  });
});
