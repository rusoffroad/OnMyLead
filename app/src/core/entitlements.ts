/**
 * OnMyLead Pro: what the rider's plan allows, as the server reports it (my_entitlements() in
 * migration 20261018000000_pro_entitlements.sql). The server is the judge; the app only uses
 * this to show the right buttons and the upgrade prompt before a request is refused.
 *
 * Two rules keep riders safe:
 *   * Until the server has the Pro update (switchedOn false), nothing is gated.
 *   * A missing or failed answer never takes Pro away; the last known answer stands.
 * Safety features (Ride Mode, Help, EMERGENCY, Mechanical Issue, sharing, chat, joining) are
 * never in this list.
 */

export type FeatureKey =
  | 'create_ride'
  | 'import_gpx'
  | 'offline_maps'
  | 'saved_groups'
  | 'create_poll'
  | 'ride_history'
  | 'advanced_trip_planning'
  | 'advanced_stats'
  | 'premium_ride_cards';

export const FEATURE_KEYS: FeatureKey[] = [
  'create_ride', 'import_gpx', 'offline_maps', 'saved_groups', 'create_poll', 'ride_history',
  'advanced_trip_planning', 'advanced_stats', 'premium_ride_cards',
];

/** Names for prompts and the comparison table (Title Case). */
export const FEATURE_NAMES: Record<FeatureKey, string> = {
  create_ride: 'Create Rides',
  import_gpx: 'Import GPX Routes',
  offline_maps: 'Download Offline Maps',
  saved_groups: 'Saved Riding Groups',
  create_poll: 'Create Ride Polls',
  ride_history: 'Full Ride History',
  advanced_trip_planning: 'Advanced Trip Planning',
  advanced_stats: 'Advanced Ride Statistics',
  premium_ride_cards: 'Premium Ride Cards',
};

export type AccountType = 'free' | 'pro' | 'admin';
export type ProSource = 'trial' | 'apple' | 'comp' | 'admin' | null;
export type PlanLabel = 'Free' | 'Pro Trial' | 'Pro' | 'Admin';

export type AppleSubscription = {
  productId: string;
  status: 'active' | 'grace' | 'billing_retry' | 'expired' | 'revoked' | 'refunded';
  expiresAt: string | null;
  autoRenew: boolean | null;
  environment: string;
};

export type Entitlements = {
  /** False until the server has the Pro update, or while signed out: gate nothing. */
  switchedOn: boolean;
  accountType: AccountType;
  proSource: ProSource;
  label: PlanLabel;
  /** When the current Pro access ends (trial, complimentary or Apple), if it does. */
  proUntil: string | null;
  trialEndsAt: string | null;
  /** Whole days left in an active trial (1 on the last day), else null. */
  trialDaysLeft: number | null;
  /** This account has had its one trial, active or not. */
  trialUsed: boolean;
  apple: AppleSubscription | null;
  ridesCreatedThisMonth: number;
  /** Rides a Free account may create this UTC month; null is unlimited. */
  rideAllowance: number | null;
  /** How many past rides the history shows; null is all. */
  historyLimit: number | null;
  features: Record<FeatureKey, boolean>;
  /** When this answer came from the server (ms), for the offline cache. */
  fetchedAt: number;
};

const ALL_ON = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>;

/** Before the server has the Pro update, and while signed out: everything works as today. */
export const NOT_SWITCHED_ON: Entitlements = {
  switchedOn: false,
  accountType: 'free',
  proSource: null,
  label: 'Free',
  proUntil: null,
  trialEndsAt: null,
  trialDaysLeft: null,
  trialUsed: false,
  apple: null,
  ridesCreatedThisMonth: 0,
  rideAllowance: null,
  historyLimit: null,
  features: ALL_ON,
  fetchedAt: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days left until an end time, counting a part day as a day; 0 once it has passed. */
export function daysLeft(endsAt: string | null, now = Date.now()): number | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The server's answer, with safe defaults for anything missing or malformed. */
export function parseEntitlements(raw: unknown, now = Date.now()): Entitlements {
  if (!raw || typeof raw !== 'object') return { ...NOT_SWITCHED_ON, fetchedAt: now };
  const r = raw as Record<string, unknown>;
  const accountType: AccountType = r.account_type === 'admin' || r.account_type === 'pro' ? r.account_type : 'free';
  const proSource: ProSource =
    r.pro_source === 'trial' || r.pro_source === 'apple' || r.pro_source === 'comp' || r.pro_source === 'admin' ? r.pro_source : null;
  const isPro = accountType !== 'free';
  const trialEndsAt = str(r.trial_ends_at);
  const rawFeatures = (r.features && typeof r.features === 'object' ? r.features : {}) as Record<string, unknown>;
  // A feature the server doesn't list is not gated (it's free or unknown to this server).
  const features = Object.fromEntries(
    FEATURE_KEYS.map((k) => [k, typeof rawFeatures[k] === 'boolean' ? (rawFeatures[k] as boolean) : true]),
  ) as Record<FeatureKey, boolean>;
  const a = r.apple && typeof r.apple === 'object' ? (r.apple as Record<string, unknown>) : null;
  const apple: AppleSubscription | null = a && typeof a.product_id === 'string'
    ? {
        productId: a.product_id,
        status: (['active', 'grace', 'billing_retry', 'expired', 'revoked', 'refunded'] as const).find((s) => s === a.status) ?? 'expired',
        expiresAt: str(a.expires_at),
        autoRenew: typeof a.auto_renew === 'boolean' ? a.auto_renew : null,
        environment: typeof a.environment === 'string' ? a.environment : 'Production',
      }
    : null;
  return {
    switchedOn: true,
    accountType,
    proSource: isPro ? proSource : null,
    label: planLabel(accountType, proSource),
    proUntil: isPro ? str(r.pro_until) : null,
    trialEndsAt,
    trialDaysLeft: proSource === 'trial' ? daysLeft(trialEndsAt, now) : null,
    trialUsed: r.trial_used === true,
    apple,
    ridesCreatedThisMonth: num(r.rides_created_this_month, 0),
    rideAllowance: isPro ? null : numOrNull(r.ride_allowance),
    historyLimit: isPro ? null : numOrNull(r.history_limit),
    features: isPro ? ALL_ON : features,
    fetchedAt: now,
  };
}

export function planLabel(accountType: AccountType, proSource: ProSource): PlanLabel {
  if (accountType === 'admin') return 'Admin';
  if (accountType === 'free') return 'Free';
  return proSource === 'trial' ? 'Pro Trial' : 'Pro';
}

/**
 * Re-check a cached answer against the clock: a trial or complimentary grant that has ended
 * since the answer was fetched turns Free, the same as the server would say. Apple
 * subscriptions are left to the server (renewals happen without the app).
 */
export function applyClock(e: Entitlements, now = Date.now()): Entitlements {
  if (!e.switchedOn || e.accountType !== 'pro') return e;
  if (e.proSource === 'trial' && e.trialEndsAt) {
    const left = daysLeft(e.trialEndsAt, now);
    if (Date.parse(e.trialEndsAt) > now) return { ...e, trialDaysLeft: left };
  } else if (e.proSource === 'comp' && e.proUntil) {
    if (Date.parse(e.proUntil) > now) return e;
  } else {
    return e;
  }
  // Ended: Free limits apply to new Pro actions; the server confirms on the next refresh.
  return {
    ...e,
    accountType: 'free',
    proSource: null,
    label: 'Free',
    proUntil: null,
    trialDaysLeft: null,
    rideAllowance: 1,
    historyLimit: 5,
    features: { ...ALL_ON, import_gpx: false, offline_maps: false, saved_groups: false, create_poll: false,
      advanced_trip_planning: false, advanced_stats: false, premium_ride_cards: false },
  };
}

/** Can the rider do this now? Always yes until the server has the Pro update. */
export function can(e: Entitlements, feature: FeatureKey): boolean {
  if (!e.switchedOn) return true;
  if (feature === 'create_ride') return e.rideAllowance === null || e.ridesCreatedThisMonth < e.rideAllowance;
  return e.features[feature] !== false;
}

/** "Rides Created This Month: 0 of 1", or null when unlimited. */
export function rideAllowanceText(e: Entitlements): string | null {
  if (!e.switchedOn || e.rideAllowance === null) return null;
  return `Rides Created This Month: ${Math.min(e.ridesCreatedThisMonth, e.rideAllowance)} of ${e.rideAllowance}`;
}

/** "Pro Trial — 12 Days Remaining" while a trial runs. */
export function trialBadgeText(e: Entitlements): string | null {
  if (e.proSource !== 'trial' || e.trialDaysLeft === null) return null;
  return `Pro Trial — ${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? 'Day' : 'Days'} Remaining`;
}

export type ProError =
  | { kind: 'pro_required'; feature: FeatureKey | null }
  | { kind: 'ride_limit'; used: number; allowance: number };

/** The server's refusals (pro_required:<feature>, ride_limit:<used>/<allowance>), or null. */
export function parseProError(message: string | null | undefined): ProError | null {
  if (!message) return null;
  const limit = /ride_limit:(\d+)\/(\d+)/.exec(message);
  if (limit) return { kind: 'ride_limit', used: Number(limit[1]), allowance: Number(limit[2]) };
  const pro = /pro_required:([a-z_]+)/.exec(message);
  if (pro) return { kind: 'pro_required', feature: (FEATURE_KEYS as string[]).includes(pro[1]) ? (pro[1] as FeatureKey) : null };
  return null;
}

/** The server doesn't have my_entitlements yet (the Pro update isn't applied). */
export function isEntitlementsMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /my_entitlements|schema cache|does not exist/i.test(error.message ?? '');
}
