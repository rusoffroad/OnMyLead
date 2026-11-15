/**
 * Data for the Admin Dashboard's Usage page and the Overview's Real Use panel: the admin_usage_*
 * functions in migration 20261115100000_rider_usage.sql. Test and admin accounts are left out by
 * the server. Every call is refused unless the caller is an admin with an authenticator session.
 */
import type { UsageDevice } from '@/core/usage';
import { adminRpc } from './admin';

export type UsageTotals = { riders: number; sessions: number; seconds: number };

export type UsageSummary = {
  tracking_since: string | null;
  accounts_total: number; test_accounts: number; riders_total: number; signups: number;
  active_1d: number; active_30d: number;
  rides_created: number; rides_started: number; rides_shared: number;
  app: UsageTotals; map_mode: UsageTotals; ride_mode: UsageTotals;
  by_device: { device: UsageDevice; riders: number }[];
};

export type UsageRider = {
  user_id: string; display_name: string | null; plan: string | null; created_at: string;
  opens: number; app_seconds: number; map_sessions: number; map_seconds: number;
  ride_sessions: number; ride_seconds: number; days: number; last_day: string;
  devices: UsageDevice[]; rides_created: number; rides_shared: number;
};

export type UsagePoint = {
  bucket_start: string; app_riders: number; map_mode_riders: number; ride_mode_riders: number;
  map_mode_minutes: number; ride_mode_minutes: number;
};

export const usageSummary = (from: string | null, to: string | null) =>
  adminRpc<UsageSummary>('admin_usage_summary', { p_from: from, p_to: to });

export const usageRiders = (from: string | null, to: string | null, limit = 100) =>
  adminRpc<UsageRider[]>('admin_usage_riders', { p_from: from, p_to: to, p_limit: limit });

export const usageSeries = (from: string, to: string, bucket: 'day' | 'week' | 'month') =>
  adminRpc<UsagePoint[]>('admin_usage_series', { p_from: from, p_to: to, p_bucket: bucket });
