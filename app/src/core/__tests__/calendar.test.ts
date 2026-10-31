import { describe, expect, it } from 'vitest';

import {
  addDays, atMinutes, canGoToMonth, canPageMonth, canRideOn, clampRideDay, clampToRange, daysAwayText, formatTypedDate,
  inRange, lastRideDay, longDayText, monthGrid, monthInRange, monthText, nextWeekday, parseTypedDate, quickDays, rangeYears,
  rideDayRange, sameDateMonthsLater, sameDay, typedDateText,
} from '../calendar';

// Thursday, October 15 2026, mid-afternoon.
const TODAY = new Date(2026, 9, 15, 14, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('which days a ride can be set for', () => {
  it('allows today through the same date three years out, so 2027 and later work', () => {
    expect(canRideOn(day(2026, 10, 15), TODAY)).toBe(true);
    expect(canRideOn(day(2027, 1, 1), TODAY)).toBe(true);
    expect(canRideOn(day(2027, 12, 31), TODAY)).toBe(true);
    expect(canRideOn(day(2028, 6, 10), TODAY)).toBe(true);
    expect(canRideOn(day(2029, 10, 15), TODAY)).toBe(true);
  });

  it('refuses past days and days more than three years out', () => {
    expect(canRideOn(day(2026, 10, 14), TODAY)).toBe(false);
    expect(canRideOn(day(2029, 10, 16), TODAY)).toBe(false);
  });

  it('rolls Feb 29 to Feb 28 and month ends back to the shorter month', () => {
    expect(sameDay(lastRideDay(day(2028, 2, 29)), day(2031, 2, 28))).toBe(true);
    expect(sameDay(sameDateMonthsLater(day(2027, 1, 31), 1), day(2027, 2, 28))).toBe(true);
    expect(sameDay(sameDateMonthsLater(day(2026, 10, 31), 12), day(2027, 10, 31))).toBe(true);
  });

  it('clamps a copied ride’s old date to today and a far one to the last day', () => {
    expect(sameDay(clampRideDay(day(2026, 6, 1), TODAY), day(2026, 10, 15))).toBe(true);
    expect(sameDay(clampRideDay(day(2031, 1, 1), TODAY), day(2029, 10, 15))).toBe(true);
    expect(sameDay(clampRideDay(day(2027, 12, 25), TODAY), day(2027, 12, 25))).toBe(true);
  });
});

describe('any day range (reused by other pickers)', () => {
  const range = { first: day(2026, 10, 31), last: day(2027, 10, 31) };

  it('includes both ends and nothing outside', () => {
    expect(inRange(day(2026, 10, 31), range)).toBe(true);
    expect(inRange(new Date(2027, 9, 31, 23, 59), range)).toBe(true);
    expect(inRange(day(2026, 10, 30), range)).toBe(false);
    expect(inRange(day(2027, 11, 1), range)).toBe(false);
    expect(sameDay(clampToRange(day(2025, 1, 1), range), range.first)).toBe(true);
  });

  it('knows which months and years have pickable days', () => {
    expect(monthInRange(day(2026, 10, 1), range)).toBe(true);
    expect(monthInRange(day(2026, 9, 1), range)).toBe(false);
    expect(monthInRange(day(2027, 10, 1), range)).toBe(true);
    expect(monthInRange(day(2027, 11, 1), range)).toBe(false);
    expect(canPageMonth(day(2026, 10, 1), -1, range)).toBe(false);
    expect(canPageMonth(day(2027, 9, 1), 1, range)).toBe(true);
    expect(rangeYears(rideDayRange(TODAY))).toEqual([2026, 2027, 2028, 2029]);
  });
});

describe('typing a date', () => {
  it('puts the slashes in while digits are typed', () => {
    expect(formatTypedDate('1')).toBe('1');
    expect(formatTypedDate('12')).toBe('12');
    expect(formatTypedDate('122')).toBe('12/2');
    expect(formatTypedDate('1225')).toBe('12/25');
    expect(formatTypedDate('12252027')).toBe('12/25/2027');
    expect(formatTypedDate('12/252')).toBe('12/25/2');
    expect(formatTypedDate('12/25/20279')).toBe('12/25/2027');
  });

  it('keeps slashes someone typed, and backspacing works', () => {
    expect(formatTypedDate('1/5/2027')).toBe('1/5/2027');
    expect(formatTypedDate('12/')).toBe('12/');
    expect(formatTypedDate('12-25-2027')).toBe('12/25/2027');
    expect(formatTypedDate('2027-12-25')).toBe('12/25/2027');
    expect(formatTypedDate('')).toBe('');
  });

  it('reads whole, real dates only', () => {
    expect(sameDay(parseTypedDate('12/25/2027')!, day(2027, 12, 25))).toBe(true);
    expect(sameDay(parseTypedDate('1/5/2028')!, day(2028, 1, 5))).toBe(true);
    expect(sameDay(parseTypedDate('6/12/27')!, day(2027, 6, 12))).toBe(true);
    expect(sameDay(parseTypedDate('2027-03-06')!, day(2027, 3, 6))).toBe(true);
    expect(parseTypedDate('02/30/2027')).toBeNull();
    expect(parseTypedDate('13/01/2027')).toBeNull();
    expect(parseTypedDate('12/25')).toBeNull();
    expect(parseTypedDate('soon')).toBeNull();
  });

  it('writes a day back the way it is typed', () => {
    expect(typedDateText(day(2027, 3, 6))).toBe('03/06/2027');
    expect(formatTypedDate(typedDateText(day(2029, 12, 1)))).toBe('12/01/2029');
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
    expect(canGoToMonth(day(2029, 9, 1), 1, TODAY)).toBe(true);
    expect(canGoToMonth(day(2029, 10, 1), 1, TODAY)).toBe(false);
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
    expect(daysAwayText(addDays(TODAY, 730), TODAY)).toBe('In 2 Years');
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
