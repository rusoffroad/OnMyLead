import { describe, expect, it } from 'vitest';

import { compassMargins, COMPASS_DROP, CORNER_GAP } from '../map-corner';

describe('map corner (Map Settings and the compass)', () => {
  const insets = { top: 59, right: 0 };
  it('keeps Mapbox’s own corner when a screen says nothing', () => {
    expect(compassMargins(null, insets, 'ios')).toEqual({ top: 8, right: 8 });
  });
  it('puts the compass level with Map Settings under the top bar on iPhone (margins from the safe area)', () => {
    expect(compassMargins({ top: 59 + 66 }, insets, 'ios')).toEqual({ top: 66 + COMPASS_DROP, right: CORNER_GAP + COMPASS_DROP });
  });
  it('measures from the map’s edges on Android, so the status bar and a side cutout count', () => {
    expect(compassMargins({ top: 24 + 66 }, { top: 24, right: 30 }, 'android')).toEqual({ top: 24 + 66 + COMPASS_DROP, right: 30 + CORNER_GAP + COMPASS_DROP });
  });
  it('moves up with Full Map and never goes above the safe area', () => {
    expect(compassMargins({ top: 59 + 12 }, insets, 'ios').top).toBe(12 + COMPASS_DROP);
    expect(compassMargins({ top: 0 }, insets, 'ios').top).toBe(0);
  });
});
