/**
 * Pure helpers for the Admin Dashboard's money, analytics, health and export pages: labels for
 * Apple's subscription states, revenue series by currency, CSV files, and the promo code steps
 * that can only be done by hand in App Store Connect.
 */

export type BadgeTone = 'neutral' | 'pro' | 'trial' | 'free' | 'admin' | 'ok' | 'warn' | 'danger' | 'muted';

export type SubscriptionStatus = 'active' | 'grace' | 'billing_retry' | 'expired' | 'revoked' | 'refunded';

/** How an Apple subscription reads in the dashboard. A paying subscription with auto-renew off is "Cancelled": it still runs to its end date. */
export function subscriptionBadge(status: string, autoRenew: boolean | null): { label: string; tone: BadgeTone } {
  if ((status === 'active' || status === 'grace') && autoRenew === false) return { label: 'Cancelled', tone: 'warn' };
  switch (status) {
    case 'active': return { label: 'Active', tone: 'ok' };
    case 'grace': return { label: 'Grace Period', tone: 'warn' };
    case 'billing_retry': return { label: 'Billing Retry', tone: 'danger' };
    case 'expired': return { label: 'Expired', tone: 'muted' };
    case 'refunded': return { label: 'Refunded', tone: 'danger' };
    case 'revoked': return { label: 'Revoked', tone: 'danger' };
    default: return { label: status, tone: 'neutral' };
  }
}

export const planLabel = (plan: string) => ({ monthly: 'Monthly', annual: 'Annual' } as Record<string, string>)[plan] ?? 'Other';

/** Apple's offerType on a transaction. */
export function offerTypeLabel(t: number | null | undefined) {
  return ({ 1: 'Introductory Offer', 2: 'Promotional Offer', 3: 'Offer Code', 4: 'Win-Back Offer' } as Record<number, string>)[t ?? 0] ?? 'Offer';
}

/** App Store Connect enums such as ONE_MONTH or FREE_TRIAL as Title Case words. */
export function ascEnumLabel(v: string | null | undefined) {
  if (!v) return '–';
  const small = new Set(['a', 'an', 'the', 'to', 'for', 'by', 'or', 'of']);
  return v.toLowerCase().split('_').map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------
export type RevenueRow = {
  bucket_start: string; currency: string; gross_milli: number; refunds_milli: number;
  new_subscriptions: number; renewals: number; refunds: number;
};

/** One series per currency (net of refunds), and totals per currency. USD first, then by size. */
export function revenueByCurrency(rows: RevenueRow[]) {
  const by = new Map<string, { points: { t: string; v: number }[]; gross: number; refunds: number; net: number; newSubs: number; renewals: number; refundCount: number }>();
  for (const r of rows) {
    const c = by.get(r.currency) ?? { points: [], gross: 0, refunds: 0, net: 0, newSubs: 0, renewals: 0, refundCount: 0 };
    const gross = Number(r.gross_milli) || 0;
    const refunds = Number(r.refunds_milli) || 0;
    c.points.push({ t: r.bucket_start, v: (gross - refunds) / 1000 });
    c.gross += gross;
    c.refunds += refunds;
    c.net += gross - refunds;
    c.newSubs += Number(r.new_subscriptions) || 0;
    c.renewals += Number(r.renewals) || 0;
    c.refundCount += Number(r.refunds) || 0;
    by.set(r.currency, c);
  }
  // A currency with no money in the range only earns a place when it is USD (the home currency).
  return [...by.entries()]
    .filter(([cur, c]) => cur === 'USD' || c.gross || c.refunds)
    .sort(([a, x], [b, y]) => (a === 'USD' ? -1 : b === 'USD' ? 1 : y.net - x.net))
    .map(([currency, c]) => ({ currency, ...c }));
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------
export type SeriesPoint = { bucket_start: string; value: number };

export const toPoints = (rows: SeriesPoint[] | null | undefined) => (rows ?? []).map((r) => ({ t: r.bucket_start, v: Number(r.value) || 0 }));

export const sumPoints = (rows: SeriesPoint[] | null | undefined) => (rows ?? []).reduce((a, r) => a + (Number(r.value) || 0), 0);

/** Several series side by side, one row per bucket, for a CSV. */
export function joinSeries(named: Record<string, SeriesPoint[]>) {
  const keys = Object.keys(named);
  const rows = new Map<string, Record<string, number | string>>();
  for (const k of keys) {
    for (const p of named[k] ?? []) {
      const row = rows.get(p.bucket_start) ?? { date: p.bucket_start.slice(0, 10) };
      row[k] = Number(p.value) || 0;
      rows.set(p.bucket_start, row);
    }
  }
  return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => {
    for (const k of keys) r[k] ??= 0;
    return r;
  });
}

/** A running total, e.g. users to date from signups per day. */
export function cumulative(rows: SeriesPoint[], start = 0) {
  let total = start;
  return rows.map((r) => ({ bucket_start: r.bucket_start, value: (total += Number(r.value) || 0) }));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
export type ExportKind = 'user_growth' | 'revenue' | 'conversion' | 'ride_activity' | 'trial_performance' | 'promo_performance';

export const EXPORTS: { kind: ExportKind; title: string; description: string }[] = [
  { kind: 'user_growth', title: 'User Growth', description: 'New accounts and total accounts per day.' },
  { kind: 'revenue', title: 'Revenue', description: 'Estimated gross sales, refunds, new subscriptions and renewals per day, by currency.' },
  { kind: 'conversion', title: 'Conversion', description: 'Trials started, trials that became paid, and paid starts per day.' },
  { kind: 'ride_activity', title: 'Ride Activity', description: 'Rides created, completed, riders joining and chat messages per day. No locations.' },
  { kind: 'trial_performance', title: 'Trial Performance', description: 'Trials grouped by the week they started: running, ended, converted and revoked.' },
  { kind: 'promo_performance', title: 'Promo Campaign Performance', description: 'Redemptions, paying now, renewals and estimated revenue per offer code.' },
];

/** Column names that would mean a location slipped into an export. */
const LOCATION_KEY = /(^|_)(lat|lng|lon|latitude|longitude|geojson|track|position|meet_area|coords?)($|_)/i;

export function hasLocationColumn(headers: string[]) {
  return headers.some((h) => LOCATION_KEY.test(h));
}

function csvCell(v: unknown) {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  // Spreadsheet formula injection: a cell starting with = + - @ runs as a formula in Excel.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a header row. Refuses any column that looks like a location. */
export function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  if (hasLocationColumn(headers)) throw new Error('Exports never include locations');
  return [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\r\n') + '\r\n';
}

export function exportFileName(kind: ExportKind, from: string, to: string) {
  const day = (iso: string) => iso.slice(0, 10);
  // `to` is exclusive, so the file names the last day it covers.
  const last = new Date(Date.parse(to) - 1).toISOString();
  return `onmylead-${kind.replace(/_/g, '-')}-${day(from)}-to-${day(last)}.csv`;
}

export const milliToMoney = (milli: number) => (Number(milli || 0) / 1000).toFixed(2);

// ---------------------------------------------------------------------------
// Promo codes: what App Store Connect only lets Chris do by hand
// ---------------------------------------------------------------------------
export const PROMO_MANUAL_STEPS: { title: string; detail: string }[] = [
  { title: 'Create the Offer', detail: 'App Store Connect > Apps > OnMyLead > Subscriptions > OnMyLead Pro > pick Monthly or Annual > Offer Codes > Create Offer Code. Choose who can redeem it (new, lapsed or current subscribers), the discount (free, pay up front or pay as you go) and how long it lasts, and set its price in each country.' },
  { title: 'Make Custom Codes', detail: 'A custom code is a word riders type, such as RUSRIDE. Add it on the offer in App Store Connect with its redemption limit and expiry date. The dashboard lists custom codes but does not create them.' },
  { title: 'Make One-Time Codes', detail: 'One-time codes are random codes, each good once. Make them here with Generate Codes (up to 25,000 per batch, with an expiry date) or in App Store Connect, then download the codes as a CSV.' },
  { title: 'Deactivate a Campaign', detail: 'To stop a campaign early, open the offer in App Store Connect and deactivate its codes. Codes already redeemed keep their discount.' },
  { title: 'Share the Codes', detail: 'Riders redeem codes in the app (Profile > Settings > Subscription > Redeem Promo Code) or through the App Store link Apple gives for the offer. Apple shows its own sheet; OnMyLead never sees card details.' },
  { title: 'Wait for Results', detail: 'A redemption shows in Redemption Activity once Apple tells OnMyLead about the purchase. Codes generated in App Store Connect can take up to an hour to appear.' },
];

/** An analytics event name such as ride_poll_vote as a label, e.g. "Ride Poll Vote". */
export function eventLabel(name: string) {
  return ascEnumLabel(name.toUpperCase());
}

/** A Sentry release such as com.rusoffroad.onmylead.app@1.0.0+12 as "1.0.0 (12)". */
export function releaseLabel(release: string) {
  const m = /@([^+@]+)(?:\+(.+))?$/.exec(release);
  return m ? (m[2] ? `${m[1]} (${m[2]})` : m[1]) : release;
}

export function bytesLabel(n: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${units[i]}`;
}
