/** "8:00", "8 am", "14:30", "2:30 pm" -> minutes after midnight, or null if unreadable. */
export function parseTime(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const suffix = m[3]?.[0];
  if (suffix && (h < 1 || h > 12)) return null;
  if (suffix === 'p' && h < 12) h += 12;
  if (suffix === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** A time of day the way the ride form takes it, e.g. "8:00 am" or "2:30 pm" (parseTime reads it back). */
export function clockText(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** The last time of day the pickers offer: 11:55 pm. */
export const LAST_MINUTE_OF_DAY = 23 * 60 + 55;

/** A time picker's three parts for minutes after midnight: hour 1-12, minute 0-59 and pm. */
export function clockParts(minutes: number): { hour: number; minute: number; pm: boolean } {
  const m = Math.min(Math.max(Math.round(minutes), 0), 24 * 60 - 1);
  const h = Math.floor(m / 60);
  return { hour: h % 12 || 12, minute: m % 60, pm: h >= 12 };
}

/** Hour 1-12, minute and am/pm back to minutes after midnight (12 am is midnight, 12 pm is noon). */
export function fromClockParts(hour: number, minute: number, pm: boolean): number {
  return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

/** Minutes after midnight in the form text the ride form keeps, e.g. 870 -> "2:30 pm". */
export function minutesText(minutes: number): string {
  const { hour, minute, pm } = clockParts(minutes);
  return `${hour}:${String(minute).padStart(2, '0')} ${pm ? 'pm' : 'am'}`;
}

/** The same time for showing big in a picker, e.g. "2:30 PM". */
export const minutesLabel = (minutes: number) => minutesText(minutes).toUpperCase();

/** A time `delta` minutes later (or earlier), rounded to 5 minutes and kept on the same day. */
export function shiftClock(minutes: number, delta: number): number {
  const m = Math.round((minutes + delta) / 5) * 5;
  return Math.min(Math.max(m, 0), LAST_MINUTE_OF_DAY);
}
