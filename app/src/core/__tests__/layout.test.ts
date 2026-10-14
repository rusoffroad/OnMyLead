import { describe, expect, it } from 'vitest';

import { isTabletScreen, mapPanelWidth, sideColumnWidth, sidebarWidth, widthClass } from '../layout';

describe('widthClass', () => {
  it('puts phones, Slide Over and narrow split screens in compact', () => {
    expect(widthClass(320)).toBe('compact'); // iPad Slide Over
    expect(widthClass(393)).toBe('compact'); // iPhone 16
    expect(widthClass(412)).toBe('compact'); // Pixel phone
    expect(widthClass(599)).toBe('compact');
  });
  it('puts small tablets in portrait and iPad split view in medium', () => {
    expect(widthClass(600)).toBe('medium');
    expect(widthClass(744)).toBe('medium'); // iPad mini portrait
    expect(widthClass(800)).toBe('medium'); // Android tablet portrait
    expect(widthClass(820)).toBe('medium'); // iPad Air portrait
    expect(widthClass(839)).toBe('medium');
  });
  it('puts tablets in landscape and big iPads in expanded', () => {
    expect(widthClass(840)).toBe('expanded');
    expect(widthClass(1024)).toBe('expanded'); // iPad Pro 12.9 portrait
    expect(widthClass(1180)).toBe('expanded'); // iPad Air landscape
    expect(widthClass(1280)).toBe('expanded'); // Android tablet landscape
  });
});

describe('isTabletScreen', () => {
  it('goes by the shorter side, so turning the device never changes it', () => {
    expect(isTabletScreen(393, 852)).toBe(false);
    expect(isTabletScreen(852, 393)).toBe(false);
    expect(isTabletScreen(820, 1180)).toBe(true);
    expect(isTabletScreen(1180, 820)).toBe(true);
    expect(isTabletScreen(600, 960)).toBe(true);
  });
});

describe('panel widths', () => {
  it('keeps the map panel to under half the window', () => {
    for (const w of [600, 744, 820, 1024, 1366]) expect(mapPanelWidth(w)).toBeLessThanOrEqual(w * 0.44);
    expect(mapPanelWidth(1366)).toBe(420);
    expect(mapPanelWidth(820)).toBe(360);
  });
  it('always leaves at least a fifth of the map clear between the sidebar and the controls', () => {
    for (const w of [600, 700, 744, 820, 840, 1024, 1180, 1366]) {
      const clear = w - mapPanelWidth(w) - sidebarWidth(w);
      expect(clear).toBeGreaterThanOrEqual(Math.floor(w * 0.2) - 1);
    }
    expect(sidebarWidth(1366)).toBe(320);
  });
  it('gives two-pane screens a side column between 340 and 460', () => {
    expect(sideColumnWidth(600)).toBe(340);
    expect(sideColumnWidth(1024)).toBe(410);
    expect(sideColumnWidth(1366)).toBe(460);
  });
});
