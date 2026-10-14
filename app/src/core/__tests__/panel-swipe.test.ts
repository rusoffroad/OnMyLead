import { describe, expect, it } from 'vitest';

import { isHorizontalSwipe, isVerticalSwipe, swipeResult, swipeResultToward } from '../panel-swipe';

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

describe('Tablet side panels', () => {
  it('only treats mostly-sideways drags as swipes on a sidebar', () => {
    expect(isHorizontalSwipe(4, 0)).toBe(false);
    expect(isHorizontalSwipe(-30, 4)).toBe(true);
    expect(isHorizontalSwipe(20, 30)).toBe(false);
  });
  it('folds the riders sidebar on a swipe left and opens it on a swipe right', () => {
    expect(swipeResultToward('left', true, -60, 0, 0, 0)).toBe('fold');
    expect(swipeResultToward('left', true, 60, 0, 0, 0)).toBeNull();
    expect(swipeResultToward('left', false, 60, 0, 0, 0)).toBe('open');
    expect(swipeResultToward('left', false, 0, 0, 0.9, 0)).toBe('open');
  });
  it('folds a panel hanging from the top on a swipe up', () => {
    expect(swipeResultToward('up', true, 0, -60, 0, 0)).toBe('fold');
    expect(swipeResultToward('up', true, 0, 60, 0, 0)).toBeNull();
    expect(swipeResultToward('up', false, 0, 60, 0, 0)).toBe('open');
  });
  it('keeps the phone sheet folding down', () => {
    expect(swipeResultToward('down', true, 0, 60, 0, 0)).toBe('fold');
    expect(swipeResultToward('down', false, 0, -60, 0, 0)).toBe('open');
  });
});
