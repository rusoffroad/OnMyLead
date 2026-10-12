// Number, money and date formatting for the Admin Dashboard. Pure, so it is unit tested.
// Dates show in the viewer's local time zone; date ranges sent to the server are UTC timestamps.

const intFmt = new Intl.NumberFormat('en-US');

export function fmtInt(n: number | string | null | undefined): string {
  const v = Number(n);
  return n == null || !Number.isFinite(v) ? '—' : intFmt.format(Math.round(v));
}

/** Apple reports prices in milli-units (4.99 USD = 4990). */
export function fmtMoney(milli: number | string | null | undefined, currency = 'USD'): string {
  const v = Number(milli);
  if (milli == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: v % 1000 === 0 ? 0 : 2 }).format(v / 1000);
}

/** 0.4567 -> "45.7%"; null (nothing to divide) -> "—". */
export function fmtPct(ratio: number | string | null | undefined): string {
  const v = Number(ratio);
  if (ratio == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(v * 100 >= 10 || v === 0 ? 0 : 1)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "just now", "5 min ago", "3 h ago", "4 days ago", then the date. Future times read "in 3 days". */
export function fmtAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = now.getTime() - t;
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const say = (n: number, unit: string) => (future ? `in ${n} ${unit}` : `${n} ${unit} ago`);
  if (s < 60) return future ? 'in a moment' : 'just now';
  if (s < 3600) return say(Math.floor(s / 60), 'min');
  if (s < 86400) return say(Math.floor(s / 3600), 'h');
  const days = Math.floor(s / 86400);
  if (days < 30) return say(days, days === 1 ? 'day' : 'days');
  return fmtDate(iso);
}

/** Whole days until a moment, rounded up (a trial ending in 2 h has 1 day left); 0 once past. */
export function daysLeft(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now.getTime()) / 86_400_000));
}

export type RangePreset = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';
export type DateRange = { from: string; to: string; preset: RangePreset };

/** The window for a preset, ending now (to is exclusive). "all" starts at the app's launch year. */
export function rangeFor(preset: Exclude<RangePreset, 'custom'>, now: Date = new Date()): DateRange {
  const to = new Date(now.getTime() + 60_000);
  const from = new Date(now);
  if (preset === '7d') from.setUTCDate(from.getUTCDate() - 7);
  else if (preset === '30d') from.setUTCDate(from.getUTCDate() - 30);
  else if (preset === '90d') from.setUTCDate(from.getUTCDate() - 90);
  else if (preset === '12m') from.setUTCFullYear(from.getUTCFullYear() - 1);
  else return { from: '2026-01-01T00:00:00.000Z', to: to.toISOString(), preset };
  return { from: from.toISOString(), to: to.toISOString(), preset };
}

/** A custom range from two calendar dates (YYYY-MM-DD, UTC), both days included. */
export function customRange(fromDay: string, toDay: string): DateRange | null {
  const ok = /^\d{4}-\d{2}-\d{2}$/;
  if (!ok.test(fromDay) || !ok.test(toDay)) return null;
  const from = new Date(`${fromDay}T00:00:00.000Z`);
  const to = new Date(`${toDay}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  to.setUTCDate(to.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString(), preset: 'custom' };
}

/** Chart bucket that keeps a range readable: days up to ~3 months, then weeks, then months. */
export function bucketFor(range: DateRange): 'day' | 'week' | 'month' {
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  return days <= 95 ? 'day' : days <= 400 ? 'week' : 'month';
}

/** Readable name for an audit log action such as "user.suspend" or "trial.extend". */
export function actionLabel(action: string): string {
  const known: Record<string, string> = {
    'user.suspend': 'Suspended Account',
    'user.reactivate': 'Reactivated Account',
    'user.delete': 'Deleted Account',
    'user.delete_failed': 'Account Deletion Failed',
    'ride.remove': 'Removed Ride',
    'report.reviewing': 'Started Reviewing Report',
    'report.resolved': 'Resolved Report',
    'report.dismissed': 'Dismissed Report',
    'report.open': 'Reopened Report',
    'feature_plan.set': 'Changed Feature Access',
  };
  if (known[action]) return known[action];
  return action
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
