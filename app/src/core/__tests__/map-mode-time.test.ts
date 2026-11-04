import { describe, expect, it } from 'vitest';

import { mapClockRuns, mapSecondsLeft, mapTimeLeftText, mapTimeUsedUp, parseMapModeTime, UNLIMITED_MAP_TIME } from '../map-mode-time';

describe('Map Mode time on Free', () => {
  it('reads the server answer and treats missing or odd values as unlimited', () => {
    expect(parseMapModeTime(null)).toEqual(UNLIMITED_MAP_TIME);
    expect(parseMapModeTime({ used_seconds: 600, allowance_seconds: 28800, resets_at: '2026-12-01T00:00:00Z' }))
      .toEqual({ usedSeconds: 600, allowanceSeconds: 28800, resetsAt: '2026-12-01T00:00:00Z' });
    expect(parseMapModeTime({ used_seconds: 'x', allowance_seconds: null }).allowanceSeconds).toBeNull();
  });

  it('counts down from 8 hours, including time counted on the phone', () => {
    const t = { usedSeconds: 3600, allowanceSeconds: 8 * 3600, resetsAt: null };
    expect(mapSecondsLeft(t)).toBe(7 * 3600);
    expect(mapSecondsLeft(t, 1800)).toBe(6.5 * 3600);
    expect(mapSecondsLeft({ ...t, usedSeconds: 9 * 3600 })).toBe(0);
    expect(mapTimeUsedUp({ ...t, usedSeconds: 8 * 3600 })).toBe(true);
    expect(mapSecondsLeft(UNLIMITED_MAP_TIME, 99999)).toBeNull();
    expect(mapTimeUsedUp(UNLIMITED_MAP_TIME, 99999)).toBe(false);
  });

  it('never runs on a group ride, in the background or off screen', () => {
    expect(mapClockRuns({ onScreen: true, appActive: true, onGroupRide: false })).toBe(true);
    expect(mapClockRuns({ onScreen: true, appActive: true, onGroupRide: true })).toBe(false);
    expect(mapClockRuns({ onScreen: true, appActive: false, onGroupRide: false })).toBe(false);
    expect(mapClockRuns({ onScreen: false, appActive: true, onGroupRide: false })).toBe(false);
  });

  it('says how much is left in plain words', () => {
    expect(mapTimeLeftText(null)).toBeNull();
    expect(mapTimeLeftText(0)).toBe('No Map Mode Time Left This Month');
    expect(mapTimeLeftText(8 * 3600)).toBe('8 h Left This Month');
    expect(mapTimeLeftText(5 * 3600 + 20 * 60)).toBe('5 h 20 m Left This Month');
    expect(mapTimeLeftText(45 * 60 - 10)).toBe('45 m Left This Month');
    expect(mapTimeLeftText(20)).toBe('1 m Left This Month');
  });
});
