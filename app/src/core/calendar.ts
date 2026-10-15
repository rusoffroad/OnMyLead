/**
 * The ride date picker's calendar math: which days a ride can be set for, the month grid, the
 * quick picks and the plain-words labels. Pure and in local time, so iPhone, iPad, Android and the
 * website all offer the same days.
 */

/** How far ahead a ride can be scheduled. */
export const MAX_MONTHS_AHEAD = 12;

/** Midnight (local time) of the day `d` falls on. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The day `n` days after `d`, at midnight. Uses the calendar, so a DST change never skips a day. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** The first of the month `n` months after the month `d` is in. */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The last day a ride can be set for: the same date a year from today (Feb 29 rolls to Feb 28). */
export function lastRideDay(today: Date): Date {
  const t = startOfDay(today);
  const y = t.getFullYear() + MAX_MONTHS_AHEAD / 12;
  const lastOfMonth = new Date(y, t.getMonth() + 1, 0).getDate();
  return new Date(y, t.getMonth(), Math.min(t.getDate(), lastOfMonth));
}

/** Today through a year from today: no past dates. */
export function canRideOn(day: Date, today: Date): boolean {
  const d = startOfDay(day).getTime();
  return d >= startOfDay(today).getTime() && d <= lastRideDay(today).getTime();
}

/** Keeps a picked day inside the allowed range (a copied ride's old date becomes today). */
export function clampRideDay(day: Date, today: Date): Date {
  const d = startOfDay(day);
  if (d < startOfDay(today)) return startOfDay(today);
  const last = lastRideDay(today);
  return d > last ? last : d;
}

/**
 * The month as rows of seven, Sunday first. Days from the months either side are null, so the
 * grid has blanks rather than greyed-out neighbours.
 */
export function monthGrid(month: Date): (Date | null)[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let i = 1; i <= days; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));
  while (cells.length % 7) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Whether the month before / after `month` has any day a ride can be set for. */
export function canGoToMonth(month: Date, step: -1 | 1, today: Date): boolean {
  const target = addMonths(month, step);
  if (step < 0) return target.getTime() >= addMonths(today, 0).getTime();
  return target.getTime() <= lastRideDay(today).getTime();
}

/** The first day after `today` that falls on `weekday` (0 = Sunday), one to seven days out. */
export function nextWeekday(today: Date, weekday: number): Date {
  const t = startOfDay(today);
  return addDays(t, ((weekday - t.getDay() + 7) % 7) || 7);
}

export type QuickDay = { day: Date; label: string };

/** The one-tap days above the calendar: Today, Tomorrow, and the coming Saturday and Sunday (Sat, Sun). */
export function quickDays(today: Date): QuickDay[] {
  const t = startOfDay(today);
  const out: QuickDay[] = [{ day: t, label: 'Today' }, { day: addDays(t, 1), label: 'Tomorrow' }];
  for (const [weekday, label] of [[6, 'Sat'], [0, 'Sun']] as const) {
    const d = t.getDay() === weekday ? t : nextWeekday(t, weekday);
    if (!out.some((q) => sameDay(q.day, d))) out.push({ day: d, label });
  }
  return out;
}

/** "Saturday, November 14" (with the year when it isn't this year). */
export function longDayText(day: Date, today: Date): string {
  return day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** "November 2026", the calendar's heading. */
export function monthText(month: Date): string {
  return month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** How far off the day is, in plain words: "Today", "Tomorrow", "In 5 Days", "In 3 Weeks", "In 4 Months". */
export function daysAwayText(day: Date, today: Date): string {
  const n = Math.round((startOfDay(day).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 14) return `In ${n} Days`;
  if (n < 60) return `In ${Math.round(n / 7)} Weeks`;
  const months = Math.round(n / 30.44);
  return months >= 12 ? 'In a Year' : `In ${months} Months`;
}

/** The meet time on that day: `minutes` after midnight, by the wall clock (so DST days stay right). */
export function atMinutes(day: Date, minutes: number | null): Date | null {
  if (minutes == null) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}
