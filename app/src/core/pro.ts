/**
 * OnMyLead Pro on the app side: what each plan includes, how a server "Pro required" answer turns
 * into a friendly prompt, and the small rules the Pro screen, Subscription settings and the gates
 * share. Pure, so it is tested without a phone.
 *
 * Plan status itself lives in ./entitlements (the server's my_entitlements()). Until the server
 * has the Pro update, switchedOn is false and nothing is gated.
 */

import { can, trialBadgeText, type Entitlements, type FeatureKey, type ProError } from './entitlements';

/** Free history shows this many past rides. */
export const FREE_HISTORY = 5;

/** The plan line, e.g. "Pro Trial — 12 Days Remaining", "Pro" or "Free". */
export function planHeadline(ent: Entitlements): string {
  return trialBadgeText(ent) ?? ent.label;
}

/** The first day of next UTC month, when the Free allowance resets. */
export function nextReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** A server refusal as a prompt: a Pro feature, or the Free ride limit. */
export type ProBlock = ProError;

/** What the Pro prompt says about each feature: what it does, and what stays free. */
export const FEATURE_INFO: Record<FeatureKey, { title: string; body: string }> = {
  create_ride: {
    title: 'Create More Rides',
    body: 'Free accounts create one ride each month. Pro creates as many as you lead. Joining rides is always free.',
  },
  import_gpx: {
    title: 'Import GPX Routes',
    body: 'Bring in a track from Gaia, onX or any GPX file. Drawing a route on the map stays free.',
  },
  offline_maps: {
    title: 'Offline Maps',
    body: 'Download satellite, topo and trail maps so Ride Mode keeps working with no signal. Maps already on your phone keep working on Free.',
  },
  saved_groups: {
    title: 'Saved Riding Groups',
    body: 'Save your crew, add riders and invite everyone in one tap. Joining a group and getting its ride invites stays free.',
  },
  create_poll: {
    title: 'Ride Polls',
    body: 'Ask the group a quick question in ride chat. Everyone can still vote on polls for free.',
  },
  ride_history: {
    title: 'Full Ride History',
    body: `Free shows your last ${FREE_HISTORY} rides. Pro shows every ride you’ve been on. Nothing is ever deleted.`,
  },
  advanced_trip_planning: {
    title: 'Advanced Trip Planning',
    body: 'Plan several trips at once, start from packing lists, copy trips and link them to rides. One trip and the fuel check stay free.',
  },
  advanced_stats: {
    title: 'Advanced Ride Statistics',
    body: 'Moving time, average and top speed, climbing and the group’s totals after every ride. Distance and time out stay free.',
  },
  premium_ride_cards: {
    title: 'Premium Ride Cards',
    body: 'Share your ride with the Full Stats and Big Number layouts. The standard card stays free.',
  },
};

/** The comparison on the Pro screen. true = included, false = not, a string = the amount. */
export const COMPARISON: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: 'Create Rides', free: '1 a Month', pro: 'Unlimited' },
  { label: 'Join Rides', free: 'Unlimited', pro: 'Unlimited' },
  { label: 'Live Tracking, SOS and Ride Bubble', free: true, pro: true },
  { label: 'Ride Chat and Voting', free: true, pro: true },
  { label: 'Draw Routes and Follow Leaders', free: true, pro: true },
  { label: 'Import GPX Routes', free: false, pro: true },
  { label: 'Offline Maps', free: false, pro: true },
  { label: 'Saved Riding Groups', free: false, pro: true },
  { label: 'Create Ride Polls', free: false, pro: true },
  { label: 'Ride History', free: `Last ${FREE_HISTORY}`, pro: 'All' },
  { label: 'Advanced Trip Planning', free: false, pro: true },
  { label: 'Advanced Ride Statistics', free: false, pro: true },
  { label: 'Premium Ride Cards', free: false, pro: true },
];

export const PRICES = { monthly: 4.99, annual: 29.99 } as const;

/** How much the annual plan saves against twelve monthly payments, rounded (50 for $29.99 vs $4.99). */
export function annualSavingsPercent(monthly: number = PRICES.monthly, annual: number = PRICES.annual): number {
  return Math.round((1 - annual / (monthly * 12)) * 100);
}

/** "$2.50", the annual price spread over twelve months. */
export function annualPerMonth(annual: number = PRICES.annual): string {
  return `$${(Math.ceil((annual / 12) * 100) / 100).toFixed(2)}`;
}

/** Split past rides into the ones shown and how many more Pro would show. */
export function historySplit<T>(items: T[], limit: number | null): { shown: T[]; hidden: number } {
  if (limit == null || items.length <= limit) return { shown: items, hidden: 0 };
  return { shown: items.slice(0, limit), hidden: items.length - limit };
}

/** A trip still counts as active until its last day (end, or start when there's no end) is past. */
export function isActiveTrip(trip: { starts_on: string | null; ends_on: string | null }, today: string): boolean {
  const last = trip.ends_on ?? trip.starts_on;
  return last == null || last >= today;
}

/** Free keeps one active trip; Pro (or unknown status) plans as many as it likes. */
export function canStartTrip(ent: Entitlements, trips: { starts_on: string | null; ends_on: string | null }[], today: string): boolean {
  if (can(ent, 'advanced_trip_planning')) return true;
  return !trips.some((t) => isActiveTrip(t, today));
}

/** "Nov 11, 2026" for trial and renewal dates. */
export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Today in the phone's own calendar, as YYYY-MM-DD (how trip dates are stored). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const REPORT_REASONS = {
  ride: ['Unsafe Plan', 'Spam or Scam', 'Offensive Content', 'Something Else'],
  rider: ['Harassment', 'Unsafe Riding', 'Spam or Scam', 'Fake Account', 'Something Else'],
} as const;

/** Apple's standard licence agreement serves as the Terms of Use for subscriptions. */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://onmylead.com/privacy';
