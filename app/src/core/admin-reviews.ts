/**
 * Pure helpers for the Admin Dashboard's Store Reviews page (app/src/app/admin/reviews.tsx):
 * star summaries, who can be replied to, reply length limits and where each review opens in the
 * store's own console. The rows come from admin_reviews() (migration 20261101000000).
 */
import type { StoreKey } from './admin-growth';

export type Review = {
  store: StoreKey; review_id: string; rating: number; title: string | null; body: string | null; author: string | null;
  territory: string | null; language: string | null; app_version: string | null; device: string | null;
  created_at: string; updated_at: string | null; reply_body: string | null; reply_at: string | null;
  reply_state: string | null; link: string | null;
};

export type StoreReviewTotals = {
  checked_at: string | null; ok_at: string | null; error: string | null;
  count: number; average: number | string | null; written: number; unanswered: number;
  recent_count: number; recent_average: number | string | null;
  /** Counts for 5, 4, 3, 2 and 1 stars, in that order. */
  stars: number[] | null;
};

/** Longest reply each store accepts (same as supabase/functions/_shared/store-reviews.ts). */
export const REPLY_LIMIT: Record<StoreKey, number> = { apple: 5970, google: 350 };

export const APPLE_APP_ID = '6822352321';

/** Where the store's own ratings page is, for anything the dashboard can't do. */
export const STORE_CONSOLE: Record<StoreKey, string> = {
  apple: `https://appstoreconnect.apple.com/apps/${APPLE_APP_ID}/distribution/activity/ios/ratingsResponses`,
  google: 'https://play.google.com/console/developers/app/user-feedback/reviews',
};

/** Both stores together: count, average and star counts (5 to 1). */
export function combineTotals(stores: Partial<Record<StoreKey, StoreReviewTotals | null | undefined>>) {
  const list = (['apple', 'google'] as StoreKey[]).map((k) => stores[k]).filter((s): s is StoreReviewTotals => !!s);
  const stars = [0, 0, 0, 0, 0];
  for (const s of list) (s.stars ?? []).forEach((n, i) => { if (i < 5) stars[i] += Number(n) || 0; });
  const count = stars.reduce((a, n) => a + n, 0);
  const sum = stars.reduce((a, n, i) => a + n * (5 - i), 0);
  return {
    count,
    average: count ? sum / count : null,
    stars,
    unanswered: list.reduce((a, s) => a + (Number(s.unanswered) || 0), 0),
    recent: list.reduce((a, s) => a + (Number(s.recent_count) || 0), 0),
  };
}

/** An average to one decimal ("4.6"), or a dash when there are no ratings. */
export function fmtAverage(avg: number | string | null | undefined): string {
  const n = avg == null || avg === '' ? NaN : Number(avg);
  return Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : '–';
}

/** Share of each star count in the total, 0 to 1. */
export const starShares = (stars: number[]) => {
  const total = stars.reduce((a, n) => a + n, 0);
  return stars.map((n) => (total ? n / total : 0));
};

/**
 * Whether the dashboard can post a reply. Both stores only take replies to reviews with text;
 * a Google Play review read only from the monthly report has no id the API knows.
 */
export function canReply(r: Pick<Review, 'store' | 'review_id' | 'body'>): boolean {
  if (!r.body || !r.body.trim()) return false;
  return !(r.store === 'google' && r.review_id.startsWith('report:'));
}

/** What's wrong with a reply before it is sent, or null when it can go. */
export function replyProblem(store: StoreKey, text: string): string | null {
  const t = text.trim();
  if (!t) return 'Write a reply first.';
  if (t.length > REPLY_LIMIT[store]) return `${store === 'google' ? 'Google Play' : 'The App Store'} takes at most ${REPLY_LIMIT[store].toLocaleString('en-US')} characters (${t.length.toLocaleString('en-US')} now).`;
  return null;
}

/** The reply's state as a short label. Apple checks a reply before it shows. */
export function replyStateLabel(state: string | null | undefined): string {
  return state === 'PENDING_PUBLISH' ? 'Waiting for Apple' : 'Published';
}

const COUNTRIES: Record<string, string> = {
  USA: 'United States', CAN: 'Canada', MEX: 'Mexico', GBR: 'United Kingdom', AUS: 'Australia', NZL: 'New Zealand',
  DEU: 'Germany', FRA: 'France', ESP: 'Spain', ITA: 'Italy', NLD: 'Netherlands', IRL: 'Ireland',
};

/** Where the rider is: App Store country (USA) or Google Play language (en_US). */
export function placeLabel(r: Pick<Review, 'territory' | 'language'>): string | null {
  if (r.territory) return COUNTRIES[r.territory] ?? r.territory;
  if (r.language) return r.language.replace('_', '-');
  return null;
}

/** "★★★★☆" for screen readers and plain text. */
export const starText = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)));
