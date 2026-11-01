import { describe, expect, it } from 'vitest';

import { clockParts, fromClockParts, minutesLabel, minutesText, parseTime, shiftClock } from '../time';

describe('time picker parts', () => {
  it('splits and joins every 5-minute time of day', () => {
    for (let m = 0; m < 24 * 60; m += 5) {
      const { hour, minute, pm } = clockParts(m);
      expect(hour).toBeGreaterThanOrEqual(1);
      expect(hour).toBeLessThanOrEqual(12);
      expect(fromClockParts(hour, minute, pm)).toBe(m);
      expect(parseTime(minutesText(m))).toBe(m);
    }
  });

  it('handles midnight and noon', () => {
    expect(clockParts(0)).toEqual({ hour: 12, minute: 0, pm: false });
    expect(clockParts(720)).toEqual({ hour: 12, minute: 0, pm: true });
    expect(fromClockParts(12, 0, false)).toBe(0);
    expect(fromClockParts(12, 30, true)).toBe(750);
  });

  it('writes the text the ride form already reads', () => {
    expect(minutesText(480)).toBe('8:00 am');
    expect(minutesText(870)).toBe('2:30 pm');
    expect(minutesLabel(870)).toBe('2:30 PM');
  });

  it('keeps an odd minute from an older ride', () => {
    expect(clockParts(487)).toEqual({ hour: 8, minute: 7, pm: false });
  });

  it('shifts a suggestion without leaving the day', () => {
    expect(shiftClock(480, 30)).toBe(510);
    expect(shiftClock(487, 30)).toBe(515);
    expect(shiftClock(22 * 60, 8 * 60)).toBe(23 * 60 + 55);
    expect(shiftClock(10, -60)).toBe(0);
  });
});
