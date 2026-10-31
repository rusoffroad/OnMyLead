/**
 * The ride date picker's calendar math: which days a ride can be set for, the month grid, the
 * quick picks and the plain-words labels. Pure and in local time, so iPhone, iPad, Android and the
 * website all offer the same days.
 */

/** How far ahead a ride can be scheduled: three years, so next year's and the year after's rides fit. */
export const MAX_MONTHS_AHEAD = 36;

/** The first and last day a calendar lets you pick, both at local midnight. */
export type DayRange = { first: Date; last: Date };

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

/** The same date `months` months after `d`, at midnight; a day the target month lacks rolls back (Jan 31 + 1 = Feb 28). */
export function sameDateMonthsLater(d: Date, months: number): Date {
  const t = startOfDay(d);
  const lastOfMonth = new Date(t.getFullYear(), t.getMonth() + months + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth() + months, Math.min(t.getDate(), lastOfMonth));
}

/** The last day a ride can be set for: the same date three years from today (Feb 29 rolls to Feb 28). */
export function lastRideDay(today: Date): Date {
  return sameDateMonthsLater(today, MAX_MONTHS_AHEAD);
}

/** The days a ride can be set for: today through three years from today. */
export function rideDayRange(today: Date): DayRange {
  return { first: startOfDay(today), last: lastRideDay(today) };
}

/** Whether `day` falls inside the range (ends included). */
export function inRange(day: Date, range: DayRange): boolean {
  const d = startOfDay(day).getTime();
  return d >= startOfDay(range.first).getTime() && d <= startOfDay(range.last).getTime();
}

/** Moves a day into the range: before it becomes the first day, after it the last. */
export function clampToRange(day: Date, range: DayRange): Date {
  const d = startOfDay(day);
  if (d < startOfDay(range.first)) return startOfDay(range.first);
  return d > startOfDay(range.last) ? startOfDay(range.last) : d;
}

/** Today through three years from today: no past dates. */
export function canRideOn(day: Date, today: Date): boolean {
  return inRange(day, rideDayRange(today));
}

/** Keeps a picked day inside the allowed range (a copied ride's old date becomes today). */
export function clampRideDay(day: Date, today: Date): Date {
  return clampToRange(day, rideDayRange(today));
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

/** Whether any day of `month` falls inside the range. */
export function monthInRange(month: Date, range: DayRange): boolean {
  const first = addMonths(month, 0).getTime();
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getTime();
  return last >= startOfDay(range.first).getTime() && first <= startOfDay(range.last).getTime();
}

/** Whether the month before / after `month` has any day in the range. */
export function canPageMonth(month: Date, step: -1 | 1, range: DayRange): boolean {
  return monthInRange(addMonths(month, step), range);
}

/** Whether the month before / after `month` has any day a ride can be set for. */
export function canGoToMonth(month: Date, step: -1 | 1, today: Date): boolean {
  return canPageMonth(month, step, rideDayRange(today));
}

/** The years the range touches, oldest first: the calendar's year chooser. */
export function rangeYears(range: DayRange): number[] {
  const out: number[] = [];
  for (let y = range.first.getFullYear(); y <= range.last.getFullYear(); y++) out.push(y);
  return out;
}

/** "12/25/2027": how a typed date reads, US order. */
export function typedDateText(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()}`;
}

/**
 * What the date box shows while someone types: digits only, with the slashes put in for them, so a
 * number pad (which has no slash key on Android) is enough. "1225" reads "12/25", "12252027" reads
 * "12/25/2027". Typed slashes are respected, so "1/5/2027" stays as typed. Pasting "2027-12-25" works too.
 */
export function formatTypedDate(text: string): string {
  const iso = text.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[2].padStart(2, '0')}/${iso[3].padStart(2, '0')}/${iso[1]}`;
  const raw = text.split(/[/.\-]/);
  const segs: string[] = [];
  let carry = '';
  for (let i = 0; i < 3; i++) {
    const seg = (carry + (raw[i] ?? '')).replace(/\D/g, '');
    const max = i < 2 ? 2 : 4;
    segs.push(seg.slice(0, max));
    carry = seg.slice(max);
  }
  let out = segs[0];
  if (raw.length > 1 || segs[1]) out += `/${segs[1]}`;
  if (raw.length > 2 || segs[2]) out += `/${segs[2]}`;
  return out;
}

/**
 * The day a typed date names, or null when it isn't a whole, real date yet. Accepts 12/25/2027,
 * 1/5/2027, 12/25/27 (20xx), 12-25-2027, 12.25.2027 and 2027-12-25. February 30 is null, not March 2.
 */
export function parseTypedDate(text: string): Date | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [m, d, y] = [Number(us[1]), Number(us[2]), us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])];
  else return null;
  const out = new Date(y, m - 1, d);
  return out.getFullYear() === y && out.getMonth() === m - 1 && out.getDate() === d ? out : null;
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

/** How far off the day is, in plain words: "Today", "Tomorrow", "In 5 Days", "In 3 Weeks", "In 4 Months", "In 2 Years". */
export function daysAwayText(day: Date, today: Date): string {
  const n = Math.round((startOfDay(day).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 14) return `In ${n} Days`;
  if (n < 60) return `In ${Math.round(n / 7)} Weeks`;
  const months = Math.round(n / 30.44);
  if (months < 12) return `In ${months} Months`;
  return n < 548 ? 'In a Year' : `In ${Math.round(n / 365.25)} Years`;
}

/** The meet time on that day: `minutes` after midnight, by the wall clock (so DST days stay right). */
export function atMinutes(day: Date, minutes: number | null): Date | null {
  if (minutes == null) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}
