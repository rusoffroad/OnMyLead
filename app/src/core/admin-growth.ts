/**
 * Pure helpers for the Admin Dashboard's Growth page (app/src/app/admin/growth.tsx): sign-in
 * method names, whether each store's download numbers are connected, and when to read the stores
 * again.
 */

export type StoreKey = 'apple' | 'google';

export type StoreDownloads = {
  checked_at: string | null; ok_at: string | null; latest_day: string | null; error: string | null;
  downloads: number; redownloads: number; updates: number; uninstalls: number | null; all_time: number;
};

const METHODS: Record<string, string> = { email: 'Email Link', apple: 'Sign in with Apple', google: 'Google', facebook: 'Facebook', phone: 'Phone' };

/** How a rider signed up, from Supabase's provider name. */
export const signInMethodLabel = (provider: string | null | undefined) =>
  METHODS[provider ?? 'email'] ?? (provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Email Link');

export const STORE_NAME: Record<StoreKey, string> = { apple: 'App Store', google: 'Google Play' };

export type StoreState = { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted'; connected: boolean };

/**
 * A store is connected once it has been read without an error. Keys not set on the server and
 * never read: "Not Connected Yet". The last read failed: "Problem", with the numbers kept.
 */
export function storeState(info: StoreDownloads | null | undefined, configured: boolean | null): StoreState {
  const failed = !!info?.error && (!info.ok_at || (info.checked_at ?? '') > info.ok_at);
  if (failed) return { label: 'Problem', tone: 'danger', connected: !!info?.ok_at };
  if (info?.ok_at) return { label: 'Connected', tone: 'ok', connected: true };
  if (configured) return { label: 'Waiting for First Report', tone: 'warn', connected: false };
  return { label: 'Not Connected Yet', tone: 'muted', connected: false };
}

/** True when the store numbers were last read more than `hours` ago (or never). */
export function needsRefresh(checkedAt: string | null | undefined, nowMs: number, hours = 6) {
  if (!checkedAt) return true;
  const t = Date.parse(checkedAt);
  return !Number.isFinite(t) || nowMs - t > hours * 3_600_000;
}

export type DownloadPoint = { bucket_start: string; apple: number; google: number };

/** Chart series for downloads per store. */
export function downloadSeries(points: DownloadPoint[] | null | undefined) {
  const rows = points ?? [];
  return {
    apple: rows.map((p) => ({ t: p.bucket_start, v: Number(p.apple) || 0 })),
    google: rows.map((p) => ({ t: p.bucket_start, v: Number(p.google) || 0 })),
  };
}

/** Device names as the page shows them; Google Play doesn't split phones from tablets. */
export function deviceLabel(store: StoreKey, device: string) {
  if (store === 'google') return 'Android (Phones and Tablets)';
  if (device === 'Desktop') return 'Mac';
  return device;
}
