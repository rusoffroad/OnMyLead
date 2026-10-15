/**
 * Data for the Admin Dashboard's Growth page (Signups and Downloads): the admin_* functions in
 * migration 20261030000000_admin_growth.sql and the store-downloads edge function. Every call is
 * refused by the server unless the caller is an admin with an authenticator session.
 */
import type { DownloadPoint, StoreDownloads, StoreKey } from '@/core/admin-growth';
import { adminFn, adminRpc } from './admin';

export type Bucket = 'day' | 'week' | 'month';

export type TestAccount = {
  user_id: string; display_name: string | null; email: string | null; created_at: string;
  reason: 'admin' | 'marked'; note: string | null;
};

export type GrowthSummary = {
  accounts_total: number; test_accounts: number; riders_total: number; riders_new: number;
  riders_active_30d: number; riders_with_ride: number; first_rider_at: string | null; last_rider_at: string | null;
  by_method: { method: string; riders: number }[];
  test_list: TestAccount[];
};

export type GrowthPoint = { bucket_start: string; new_riders: number; total_riders: number; new_test_accounts: number };

export type Downloads = {
  stores: Record<StoreKey, StoreDownloads>;
  by_device: { store: StoreKey; device: string; downloads: number }[];
  series: DownloadPoint[];
};

export type StoreConfig = { configured: Record<StoreKey, boolean> };

export const growthSummary = (from: string | null, to: string | null) =>
  adminRpc<GrowthSummary>('admin_growth_summary', { p_from: from, p_to: to });

export const growthSeries = (from: string, to: string, bucket: Bucket) =>
  adminRpc<GrowthPoint[]>('admin_growth_series', { p_from: from, p_to: to, p_bucket: bucket });

export const downloads = (from: string, to: string, bucket: Bucket) =>
  adminRpc<Downloads>('admin_downloads', { p_from: from, p_to: to, p_bucket: bucket });

export const setTestAccount = (userId: string, test: boolean, note?: string) =>
  adminRpc<void>('admin_set_test_account', { p_user: userId, p_test: test, p_note: note ?? null });

/** Which stores have their keys set on the server. */
export const storeStatus = () => adminFn<StoreConfig>('store-downloads', 'status');

/** Reads new days from the stores (the function skips a store read in the last hour unless forced). */
export const refreshDownloads = (force = false) => adminFn<StoreConfig & { results: Record<StoreKey, unknown> }>('store-downloads', 'refresh', { force });
