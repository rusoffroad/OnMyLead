/**
 * The 2.0 home screen's small rules: the greeting, the ride-count labels on Join and Create, the
 * public-rides distance and the toolkit. Pure, so they're tested without a phone.
 */
import type { Entitlements } from './entitlements';

import { coreLocale, tc } from './i18n';
/** "Good morning" before noon, "Good afternoon" until 5 PM, then "Good evening" (the phone's clock). */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 5 ? tc('Good evening') : h < 12 ? tc('Good morning') : h < 17 ? tc('Good afternoon') : tc('Good evening');
}

/** First word of the ride name, for "Good evening, Chris". Empty when they haven't picked one. */
export function firstName(rideName: string | null | undefined): string {
  const n = (rideName ?? '').trim().split(/\s+/)[0] ?? '';
  return n.length > 24 ? n.slice(0, 24) : n;
}

export type QuotaTone = 'pro' | 'free' | 'out';
export type Quota = { text: string; tone: QuotaTone; upgrade: boolean };

/**
 * The label on Create a Ride: "Unlimited" on Pro (or a trial), "1 Left This Month" on Free, and
 * "None Left This Month" once it's used. Null until the server knows the plan (gate nothing).
 */
export function createQuota(ent: Pick<Entitlements, 'switchedOn' | 'rideAllowance' | 'ridesCreatedThisMonth'>): Quota | null {
  if (!ent.switchedOn) return null;
  if (ent.rideAllowance == null) return { text: tc('Unlimited'), tone: 'pro', upgrade: false };
  const left = Math.max(0, ent.rideAllowance - Math.max(0, ent.ridesCreatedThisMonth));
  return left > 0
    ? { text: tc('{left} Left This Month', { left }), tone: 'free', upgrade: true }
    : { text: tc('None Left This Month'), tone: 'out', upgrade: true };
}

/** Joining is never limited, on any plan. */
export const JOIN_QUOTA: Quota = { text: 'Unlimited', tone: 'pro', upgrade: false };

/** How far Public Rides Near You looks. 0 is Anywhere. */
export const RADIUS_CHOICES = [50, 100, 250, 500, 1000, 0] as const;
export const DEFAULT_RADIUS_MI = 500;
export const MAX_RADIUS_MI = 1000;
export const RADIUS_STORAGE_KEY = 'home.publicRadius.v1';

/** A stored radius, or the default when it's missing or not a choice. */
export function parseRadius(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_MI;
  if (n === 0) return 0;
  if (n < 25 || n > MAX_RADIUS_MI) return DEFAULT_RADIUS_MI;
  return Math.round(n / 25) * 25;
}

/** "500 mi", or "Anywhere" for 0. */
export const radiusLabel = (mi: number) => (mi === 0 ? tc('Anywhere') : tc('{n} mi', { n: mi.toLocaleString(coreLocale()) }));

/** The count on Find a Ride: "12 Within 500 mi", "3 Anywhere", or null when there are none. */
export function findCount(count: number, radiusMi: number): string | null {
  if (count <= 0) return null;
  if (radiusMi !== 0) return tc('{n} Within {distance}', { n: count, distance: radiusLabel(radiusMi) });
  return count === 1 ? tc('1 Coming Up') : tc('{count} Coming Up', { count });
}

/** The toolkit on the home screen: the tools that used to be lost in the You menu. */
export type ToolKey = 'out_riding' | 'friends' | 'garage' | 'trips' | 'maps' | 'starlink' | 'battery' | 'share';
export const TOOLKIT: { key: ToolKey; label: string; href: string }[] = [
  { key: 'out_riding', label: 'Who’s Riding', href: '/out-riding' },
  // Social (2.0): friends, everyone's activity and comments, and your posts. Friends is its own tab there.
  { key: 'friends', label: 'Friends & Social', href: '/social' },
  { key: 'garage', label: 'Garage', href: '/garage' },
  { key: 'trips', label: 'Trip Planner', href: '/trips' },
  { key: 'maps', label: 'Offline Maps', href: '/maps' },
  { key: 'starlink', label: 'Starlink', href: '/starlink' },
  { key: 'battery', label: 'Battery Saver', href: '/battery' },
  { key: 'share', label: 'Share Location', href: '/share' },
];

/** Admin Dashboard switches that hide a tool when off (core/app-settings APP_FLAGS). */
export function toolkitFor(on: { trip_planner: boolean; starlink: boolean }): typeof TOOLKIT {
  return TOOLKIT.filter((t) => (t.key === 'trips' ? on.trip_planner : t.key === 'starlink' ? on.starlink : true));
}

/**
 * Below this window height (points) the home screen drops the greeting line, so Join, Create, Find,
 * Events and Map Mode still fit on one screen on the small iPhones (SE, 667) and small Android
 * phones. The mini (812) and up have room for it. Chris 2026-11-04: "fit ... on one screen without scrolling".
 */
export const SHORT_HOME_HEIGHT = 700;

/** True when the greeting should be left out to keep the home screen's actions on one screen. */
export function shortHome(windowHeight: number): boolean {
  return windowHeight > 0 && windowHeight < SHORT_HOME_HEIGHT;
}
