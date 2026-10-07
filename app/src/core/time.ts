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
