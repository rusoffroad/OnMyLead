import { describe, expect, it } from 'vitest';

import { bottomPanelPadding, FULL_MAP_BAR_H, fullMapKey, fullMapPadding, restoreA11yLabel, RESTORE_LABEL, swipeRestores } from '../full-map';

describe('Full Map', () => {
  it('names the bring-back button the same way everywhere', () => {
    expect(RESTORE_LABEL).toBe('Controls');
    expect(restoreA11yLabel()).toBe('Show the controls');
    expect(restoreA11yLabel(1)).toBe('Show the controls and 1 alert waiting');
    expect(restoreA11yLabel(3)).toBe('Show the controls and 3 alerts waiting');
  });

  it('brings the controls back on a swipe up, not a swipe down or a tap', () => {
    expect(swipeRestores(-60, -0.1)).toBe(true);
    expect(swipeRestores(-10, -0.9)).toBe(true);
    expect(swipeRestores(80, 1)).toBe(false);
    expect(swipeRestores(-4, 0)).toBe(false);
  });

  it('keeps only the safe areas and the bar clear when framing the map', () => {
    expect(fullMapPadding(47, 34)).toEqual([71, 24, 34 + FULL_MAP_BAR_H + 24, 24]);
    expect(fullMapPadding(0, 0, 0)).toEqual([24, 24, 24, 24]);
  });

  it('uses Esc to leave and F to enter, but never while typing', () => {
    expect(fullMapKey('Escape', true, false)).toBe('exit');
    expect(fullMapKey('Escape', false, false)).toBeNull();
    expect(fullMapKey('f', false, false)).toBe('enter');
    expect(fullMapKey('F', false, false)).toBe('enter');
    expect(fullMapKey('f', true, false)).toBeNull();
    expect(fullMapKey('f', false, true)).toBeNull();
    expect(fullMapKey('Escape', true, true)).toBeNull();
  });
});

describe("Map Mode's bottom panel padding", () => {
  it('keeps the measured panel clear, so the edge band sits above it', () => {
    expect(bottomPanelPadding(304, false)).toEqual([120, 60, 316, 60]);
    expect(bottomPanelPadding(420, true)[2]).toBe(432);
  });
  it('guesses until the panel is measured', () => {
    expect(bottomPanelPadding(undefined, false)[2]).toBe(200);
    expect(bottomPanelPadding(0, true)[2]).toBe(360);
  });
});
