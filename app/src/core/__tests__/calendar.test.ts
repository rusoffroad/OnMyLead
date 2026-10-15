import { describe, expect, it } from 'vitest';

import {
  addDays, atMinutes, canGoToMonth, canRideOn, clampRideDay, daysAwayText, lastRideDay, longDayText, monthGrid, monthText,
  nextWeekday, quickDays, sameDay,
} from '../calendar';

// Thursday, October 15 2026, mid-afternoon.
const TODAY = new Date(2026, 9, 15, 14, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('which days a ride can be set for', () => {
  it('allows today through the same date next year', () => {
    expect(canRideOn(day(2026, 10, 15), TODAY)).toBe(true);
    expect(canRideOn(day(2027, 10, 15), TODAY)).toBe(true);
    expect(canRideOn(day(2027, 3, 6), TODAY)).toBe(true);
  });

  it('refuses past days and days more than a year out', () => {
    expect(canRideOn(day(2026, 10, 14), TODAY)).toBe(false);
    expect(canRideOn(day(2027, 10, 16), TODAY)).toBe(false);
  });

  it('rolls Feb 29 to Feb 28 next year', () => {
    expect(sameDay(lastRideDay(day(2028, 2, 29)), day(2029, 2, 28))).toBe(true);
  });

  it('clamps a copied ride’s old date to today and a far one to the last day', () => {
    expect(sameDay(clampRideDay(day(2026, 6, 1), TODAY), day(2026, 10, 15))).toBe(true);
    expect(sameDay(clampRideDay(day(2028, 1, 1), TODAY), day(2027, 10, 15))).toBe(true);
    expect(sameDay(clampRideDay(day(2026, 12, 25), TODAY), day(2026, 12, 25))).toBe(true);
  });
});

describe('month grid', () => {
  it('lays October 2026 out Sunday first with blanks either side', () => {
    const rows = monthGrid(day(2026, 10, 1));
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.length === 7)).toBe(true);
    // October 1 2026 is a Thursday.
    expect(rows[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(rows[0][4]!.getDate()).toBe(1);
    expect(rows.flat().filter(Boolean)).toHaveLength(31);
    expect(rows[4][6]!.getDate()).toBe(31);
  });

  it('handles a month that fills six rows', () => {
    // August 2026 starts on a Saturday.
    expect(monthGrid(day(2026, 8, 1))).toHaveLength(6);
  });

  it('stops paging at this month and at the last allowed month', () => {
    expect(canGoToMonth(day(2026, 10, 1), -1, TODAY)).toBe(false);
    expect(canGoToMonth(day(2026, 11, 1), -1, TODAY)).toBe(true);
    expect(canGoToMonth(day(2027, 9, 1), 1, TODAY)).toBe(true);
    expect(canGoToMonth(day(2027, 10, 1), 1, TODAY)).toBe(false);
  });
});

describe('quick picks', () => {
  it('offers Today, Tomorrow and the coming weekend', () => {
    const q = quickDays(TODAY);
    expect(q.map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'Sat', 'Sun']);
    expect(sameDay(q[2].day, day(2026, 10, 17))).toBe(true);
    expect(sameDay(q[3].day, day(2026, 10, 18))).toBe(true);
  });

  it('does not repeat a day on Friday or Saturday', () => {
    expect(quickDays(day(2026, 10, 16)).map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'Sun']);
    expect(quickDays(day(2026, 10, 17)).map((x) => x.label)).toEqual(['Today', 'Tomorrow']);
  });

  it('finds the next same weekday for Ride Again, never today', () => {
    expect(sameDay(nextWeekday(TODAY, 6), day(2026, 10, 17))).toBe(true);
    expect(sameDay(nextWeekday(TODAY, 4), day(2026, 10, 22))).toBe(true);
  });
});

describe('labels', () => {
  it('reads like a person would say it', () => {
    expect(longDayText(day(2026, 11, 14), TODAY)).toBe('Saturday, November 14');
    expect(longDayText(day(2027, 3, 6), TODAY)).toBe('Saturday, March 6, 2027');
    expect(monthText(day(2026, 11, 1))).toBe('November 2026');
    expect(daysAwayText(TODAY, TODAY)).toBe('Today');
    expect(daysAwayText(addDays(TODAY, 1), TODAY)).toBe('Tomorrow');
    expect(daysAwayText(addDays(TODAY, 9), TODAY)).toBe('In 9 Days');
    expect(daysAwayText(addDays(TODAY, 30), TODAY)).toBe('In 4 Weeks');
    expect(daysAwayText(addDays(TODAY, 120), TODAY)).toBe('In 4 Months');
    expect(daysAwayText(addDays(TODAY, 365), TODAY)).toBe('In a Year');
  });
});

describe('meet time on the day', () => {
  it('uses the wall clock, so the day the clocks change stays right', () => {
    // November 1 2026: US clocks fall back at 2 am.
    const t = atMinutes(day(2026, 11, 1), 8 * 60)!;
    expect(t.getHours()).toBe(8);
    expect(t.getMinutes()).toBe(0);
    expect(atMinutes(day(2026, 11, 1), null)).toBeNull();
  });
});
