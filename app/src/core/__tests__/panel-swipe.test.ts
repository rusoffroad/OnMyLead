import { describe, expect, it } from 'vitest';

import { isVerticalSwipe, swipeResult } from '../panel-swipe';

describe('Ride Mode panel swipe', () => {
  it('only treats mostly-vertical drags as swipes', () => {
    expect(isVerticalSwipe(0, 4)).toBe(false);
    expect(isVerticalSwipe(2, 20)).toBe(true);
    expect(isVerticalSwipe(30, 20)).toBe(false);
    expect(isVerticalSwipe(0, -20)).toBe(true);
  });

  it('folds an open panel on a swipe down, by distance or speed', () => {
    expect(swipeResult(true, 60, 0.1)).toBe('fold');
    expect(swipeResult(true, 15, 1.2)).toBe('fold');
    expect(swipeResult(true, 15, 0.1)).toBeNull();
    expect(swipeResult(true, -80, -1)).toBeNull();
  });

  it('opens a folded panel on a swipe up, and ignores swipes down', () => {
    expect(swipeResult(false, -60, -0.1)).toBe('open');
    expect(swipeResult(false, -10, -0.9)).toBe('open');
    expect(swipeResult(false, 80, 1)).toBeNull();
  });
});
