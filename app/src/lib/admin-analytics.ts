/**
 * Data for the Admin Dashboard's Subscriptions, Promo Codes, Analytics, App Health and CSV
 * Exports pages: the admin_* functions in migrations 20261018400000_admin_analytics.sql and
 * 20261027000000_play_billing.sql (both stores), and the
 * admin-integrations edge function (Sentry, App Store Connect). Every call is refused by the
 * server unless the caller is an admin with an authenticator session.
 */
import { Platform } from 'react-native';

import {
  cumulative, exportFileName, joinSeries, milliToMoney, toCsv, type ExportKind, type RevenueRow, type SeriesPoint, type StoreKey,
} from '@/core/admin-analytics';
import { adminFn, adminRpc } from './admin';

export type Env = 'Production' | 'Sandbox';
export type Bucket = 'day' | 'week' | 'month';

export type SubscriptionSummary = {
  environment: Env; users: number; free: number; trial: number; comp: number; paid: number; admin: number; trials_ended: number;
  subscriptions: {
    active: number; monthly: number; annual: number; cancelled: number; grace: number; billing_retry: number;
    expired: number; refunded: number; revoked: number; renewing_7d: number; ending_7d: number;
  };
  mrr: { currency: string; mrr_milli: number; subscriptions: number }[];
  errors_7d: number; last_event_at: string | null;
  /** Per store; missing until the Google Play update is on the server. */
  by_store?: Partial<Record<StoreKey, { paying: number; billing: number; ended: number; mrr: { currency: string; mrr_milli: number; subscriptions: number }[] }>>;
  last_google_event_at?: string | null;
};

export type SubscriptionRow = {
  original_transaction_id: string; user_id: string | null; display_name: string | null; email: string | null;
  product_id: string; plan: string; status: string; auto_renew: boolean | null; expires_at: string | null;
  grace_until: string | null; offer_type: number | null; offer_id: string | null; price_milli: number | null;
  currency: string | null; environment: Env; updated_at: string; first_seen_at: string | null; total: number;
  /** 'apple' or 'google' (for Google Play, original_transaction_id is the purchase token). Missing on older servers: Apple. */
  store?: StoreKey;
};

export type SubscriptionFilter = 'all' | 'paying' | 'cancelled' | 'billing' | 'ended' | 'renewing_soon' | 'offer_code';

export type HistoryRow = { received_at: string; type: string | null; subtype: string | null; error: string | null };
export type ErrorRow = HistoryRow & { original_transaction_id: string | null };

export type CompGrant = {
  id: string; user_id: string; display_name: string | null; email: string | null; starts_at: string;
  ends_at: string | null; revoked_at: string | null; note: string | null; created_at: string; live: boolean;
};
export type Person = { id: string; display_name: string | null; email: string | null; created_at: string };

export type AnalyticsSummary = {
  signups: number; users_total: number; active_users: number; rides_created: number; rides_completed: number;
  rides_cancelled: number; ride_joins: number; messages: number; trials_started: number; trials_converted: number;
  paid_starts: number; top_features: { name: string; count: number; users: number }[];
};

export type ShellMetric = 'signups' | 'rides_created' | 'active_users' | 'trials_started' | 'ride_joins';
export type ExtraMetric = 'rides_completed' | 'messages' | 'paid_starts' | 'trial_conversions' | `feature:${string}`;

export type Cohort = { cohort_start: string; trials: number; running: number; ended: number; converted: number; revoked: number };

export type PromoPerformance = {
  offer_id: string; offer_type: number | null; redemptions: number; paying_now: number; renewed: number; ended: number;
  revenue_milli: number; first_redeemed_at: string | null; last_redeemed_at: string | null;
};
export type Redemption = {
  redeemed_at: string; offer_id: string; offer_type: number | null; product_id: string; status: string;
  user_id: string | null; display_name: string | null; email: string | null;
};

export type ServerHealth = {
  checked_at: string;
  database: { ok: boolean; size_bytes: number };
  push: {
    tokens: number; tokens_ios: number; tokens_android: number; tokens_fresh_30d: number;
    hook: { push_url: boolean; push_secret: boolean } | null;
    calls_24h: { total: number; ok: number; failed: number; last_at: string | null; last_error: string | null } | null;
  };
  subscriptions: { last_event_at: string | null; events_24h: number; errors_24h: number; errors_7d: number };
  google_play?: { last_event_at: string | null; events_24h: number; errors_24h: number; errors_7d: number };
  activity: { active_24h: number; events_24h: number; live_rides: number };
  jobs: { job: string; schedule: string; active: boolean; last_run: string | null; failed_24h: number; last_status: string | null }[] | null;
};

type Check = { ok: boolean; status: number | null; ms: number; error?: string };
export type IntegrationStatus = {
  checked_at: string;
  configured: { sentry: boolean; app_store_connect: boolean };
  services: { auth: Check; api: Check; website: Check };
};

type Part<T> = { data: T } | { error: string };
export type SentrySummary = {
  period: string;
  project: { slug: string; link: string };
  sessions: Part<{ sessions: number; crashed: number; crash_free_rate: number | null; crashed_users: number }>;
  issues: Part<{ id: string; title: string; culprit: string; level: string; count: number; users: number; first_seen: string; last_seen: string; link: string }[]>;
  errors: Part<{ t: string; v: number }[]>;
  releases: Part<{ release: string; errors: number; users: number }[]>;
};

export type OfferCampaign = {
  id: string; name: string; active: boolean | null; eligibility: string[]; offerEligibility: string | null;
  mode: string | null; duration: string | null; periods: number | null; totalCodes: number | null;
  oneTimeBatches: { id: string; codes: number | null; created: string | null; expires: string | null; active: boolean | null }[];
  customCodes: { id: string; code: string; limit: number | null; created: string | null; expires: string | null; active: boolean | null }[];
};
export type OfferCodes = {
  app: { id: string; name: string; bundleId: string } | null;
  subscriptions: { id: string; productId: string; name: string; state: string; campaigns: OfferCampaign[] }[];
};

// ---------------------------------------------------------------------------
export const subscriptionSummary = (env: Env) => adminRpc<SubscriptionSummary>('admin_subscription_summary', { p_env: env });

/** store null is both stores (and the only call a server before the Google Play update understands). */
export const subscriptions = (filter: SubscriptionFilter, q: string, env: Env, page: number, pageSize = 50, store: StoreKey | null = null) =>
  adminRpc<SubscriptionRow[]>('admin_subscriptions', {
    p_filter: filter, p_q: q || null, p_env: env, p_page: page, p_page_size: pageSize, ...(store ? { p_store: store } : {}),
  });

export const subscriptionHistory = (originalTransactionId: string) =>
  adminRpc<HistoryRow[]>('admin_subscription_history', { p_original_transaction_id: originalTransactionId });

export const subscriptionErrors = (days = 30) => adminRpc<ErrorRow[]>('admin_subscription_errors', { p_days: days, p_limit: 100 });

export const compGrants = (includeEnded = false) => adminRpc<CompGrant[]>('admin_comp_grants', { p_include_ended: includeEnded });

export const findPeople = (q: string) => adminRpc<Person[]>('admin_find_people', { p_q: q });

/** The foundation's audited writers (migration 20261018000000_pro_entitlements.sql). */
export const grantComp = (userId: string, endsAt: string | null, note: string) =>
  adminRpc<string>('admin_grant_comp', { p_user: userId, p_ends_at: endsAt, p_note: note || null });
export const revokeGrant = (grantId: string) => adminRpc<void>('admin_revoke_grant', { p_grant: grantId });

export const revenueSeries = (from: string, to: string, bucket: Bucket, env: Env) =>
  adminRpc<RevenueRow[]>('admin_revenue_series', { p_from: from, p_to: to, p_bucket: bucket, p_env: env });

export const analyticsSummary = (from: string, to: string) => adminRpc<AnalyticsSummary>('admin_analytics_summary', { p_from: from, p_to: to });

/** Shell metrics come from admin_timeseries (shell migration, rows {t, v}); the rest from admin_analytics_series. */
export async function series(metric: ShellMetric | ExtraMetric, from: string, to: string, bucket: Bucket): Promise<SeriesPoint[]> {
  const shell: string[] = ['signups', 'rides_created', 'active_users', 'trials_started', 'ride_joins'];
  const args = { p_metric: metric, p_from: from, p_to: to, p_bucket: bucket };
  if (!shell.includes(metric)) return adminRpc<SeriesPoint[]>('admin_analytics_series', args);
  const rows = await adminRpc<{ t: string; v: number }[]>('admin_timeseries', args);
  return (rows ?? []).map((r) => ({ bucket_start: r.t, value: Number(r.v) || 0 }));
}

export const trialCohorts = (from: string, to: string, bucket: Bucket = 'week') =>
  adminRpc<Cohort[]>('admin_trial_cohorts', { p_from: from, p_to: to, p_bucket: bucket });

export const promoPerformance = (env: Env) => adminRpc<PromoPerformance[]>('admin_promo_performance', { p_env: env });
export const promoRedemptions = (q: string, env: Env) =>
  adminRpc<Redemption[]>('admin_promo_redemptions', { p_q: q || null, p_env: env, p_limit: 200 });

export const serverHealth = () => adminRpc<ServerHealth>('admin_health');

export const integrationStatus = () => adminFn<IntegrationStatus>('admin-integrations', 'status');
export const sentrySummary = (period: '24h' | '7d' | '14d' | '30d') => adminFn<SentrySummary>('admin-integrations', 'sentry_summary', { period });
export const offerCodes = () => adminFn<OfferCodes>('admin-integrations', 'asc_offer_codes');
export const generateOfferCodes = (offerCodeId: string, numberOfCodes: number, expirationDate: string) =>
  adminFn<{ id: string }>('admin-integrations', 'asc_generate_codes', { offerCodeId, numberOfCodes, expirationDate });
export const offerCodeValues = (oneTimeUseCodesId: string) =>
  adminFn<{ id: string; csv: string }>('admin-integrations', 'asc_code_values', { oneTimeUseCodesId });

// ---------------------------------------------------------------------------
// CSV exports
// ---------------------------------------------------------------------------

/** Saves a file in the browser. The dashboard is web only. */
export function saveFile(name: string, text: string, type = 'text/csv;charset=utf-8') {
  if (Platform.OS !== 'web' || typeof document === 'undefined') throw new Error('Exports work on onmylead.com/admin');
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Builds one export from the server, records it in the audit log, and returns the file. */
export async function buildExport(kind: ExportKind, from: string, to: string, env: Env = 'Production') {
  let headers: string[];
  let rows: Record<string, unknown>[];
  switch (kind) {
    case 'user_growth': {
      const signups = await series('signups', from, to, 'day');
      const before = (await analyticsSummary('2000-01-01T00:00:00Z', from)).users_total;
      const total = cumulative(signups, before);
      headers = ['date', 'new_accounts', 'total_accounts'];
      rows = signups.map((s, i) => ({ date: s.bucket_start.slice(0, 10), new_accounts: Number(s.value), total_accounts: total[i].value }));
      break;
    }
    case 'revenue': {
      const r = await revenueSeries(from, to, 'day', env);
      headers = ['date', 'currency', 'gross_sales', 'refunds', 'net_sales', 'new_subscriptions', 'renewals', 'refund_count'];
      rows = r
        .filter((x) => x.currency === 'USD' || x.gross_milli || x.refunds_milli)
        .map((x) => ({
          date: x.bucket_start.slice(0, 10), currency: x.currency, gross_sales: milliToMoney(x.gross_milli), refunds: milliToMoney(x.refunds_milli),
          net_sales: milliToMoney(x.gross_milli - x.refunds_milli), new_subscriptions: x.new_subscriptions, renewals: x.renewals, refund_count: x.refunds,
        }));
      break;
    }
    case 'conversion': {
      const [trials, conversions, paid] = await Promise.all([
        series('trials_started', from, to, 'day'), series('trial_conversions', from, to, 'day'), series('paid_starts', from, to, 'day'),
      ]);
      headers = ['date', 'trials_started', 'trials_converted', 'paid_starts'];
      rows = joinSeries({ trials_started: trials, trials_converted: conversions, paid_starts: paid });
      break;
    }
    case 'ride_activity': {
      const [created, completed, joins, messages] = await Promise.all([
        series('rides_created', from, to, 'day'), series('rides_completed', from, to, 'day'),
        series('ride_joins', from, to, 'day'), series('messages', from, to, 'day'),
      ]);
      headers = ['date', 'rides_created', 'rides_completed', 'riders_joined', 'chat_messages'];
      rows = joinSeries({ rides_created: created, rides_completed: completed, riders_joined: joins, chat_messages: messages });
      break;
    }
    case 'trial_performance': {
      const c = await trialCohorts(from, to, 'week');
      headers = ['week_starting', 'trials', 'running', 'ended', 'converted', 'revoked', 'conversion_rate'];
      rows = c.map((x) => ({
        week_starting: x.cohort_start.slice(0, 10), trials: x.trials, running: x.running, ended: x.ended, converted: x.converted,
        revoked: x.revoked, conversion_rate: x.trials ? (x.converted / x.trials).toFixed(4) : '',
      }));
      break;
    }
    case 'promo_performance': {
      const p = await promoPerformance(env);
      headers = ['offer', 'offer_type', 'redemptions', 'paying_now', 'renewed', 'ended', 'estimated_revenue', 'first_redeemed', 'last_redeemed'];
      rows = p.map((x) => ({
        offer: x.offer_id, offer_type: x.offer_type, redemptions: x.redemptions, paying_now: x.paying_now, renewed: x.renewed,
        ended: x.ended, estimated_revenue: milliToMoney(x.revenue_milli), first_redeemed: x.first_redeemed_at, last_redeemed: x.last_redeemed_at,
      }));
      break;
    }
  }
  const csv = toCsv(headers, rows);
  await adminRpc<void>('admin_log_export', { p_kind: kind, p_from: from, p_to: to, p_rows: rows.length });
  return { name: exportFileName(kind, from, to), csv, rows: rows.length };
}
