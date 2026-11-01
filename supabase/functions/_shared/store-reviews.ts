// Reads ratings and reviews from the App Store and Google Play into rows of store_reviews
// (migration 20261101000000_store_reviews.sql) for the Admin Dashboard's Reviews page.
//
// Pure code with no imports, so the store-reviews edge function (Deno) and the app's vitest
// suite (app/src/core/__tests__/store-reviews.test.ts) run the same file.
//
// App Store: App Store Connect API, GET /v1/apps/{id}/customerReviews?include=response (JSON:API,
// the developer response comes in `included`). Every written review is there, all time.
// Google Play: the Play Developer API reviews list (only reviews written or changed in the last
// seven days, with text) and, for history and star-only ratings, the monthly reviews CSV in the
// Play Console's Cloud Storage bucket (UTF-16, review text may span lines).

export type StoreKey = 'apple' | 'google';

export type ReviewRow = {
  store: StoreKey;
  review_id: string;
  rating: number; // 1 to 5
  title: string | null;
  body: string | null;
  author: string | null;
  territory: string | null; // App Store: 3-letter country (USA)
  language: string | null; // Google Play: reviewer language (en_US)
  app_version: string | null;
  device: string | null;
  created_at: string; // ISO
  updated_at: string | null; // ISO; when the rider last changed it
  reply_body: string | null;
  reply_at: string | null;
  reply_state: string | null; // App Store: PUBLISHED or PENDING_PUBLISH; Google Play: PUBLISHED
  link: string | null;
};

/** Longest reply each store accepts. */
export const REPLY_LIMIT: Record<StoreKey, number> = { apple: 5970, google: 350 };

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};

const iso = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const stars = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 5 ? n : null;
};

/** Google's { seconds, nanos } timestamp as ISO. */
export function googleTime(t: { seconds?: string | number; nanos?: number } | null | undefined): string | null {
  if (!t || t.seconds == null) return null;
  const ms = Number(t.seconds) * 1000 + Math.floor((t.nanos ?? 0) / 1e6);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ---------------------------------------------------------------------------
// App Store
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type Json = any;

/** One page of customerReviews (with include=response) as rows, and the next page's URL. */
export function parseAppleReviews(doc: Json): { rows: ReviewRow[]; next: string | null } {
  const responses = new Map<string, Json>();
  for (const inc of doc?.included ?? []) {
    if (inc?.type === 'customerReviewResponses' && inc.id) responses.set(inc.id, inc.attributes ?? {});
  }
  const rows: ReviewRow[] = [];
  for (const r of doc?.data ?? []) {
    const a = r?.attributes ?? {};
    const rating = stars(a.rating);
    const created = iso(a.createdDate);
    if (!r?.id || !rating || !created) continue;
    const respId = r.relationships?.response?.data?.id;
    const resp = respId ? responses.get(respId) : undefined;
    rows.push({
      store: 'apple', review_id: String(r.id), rating,
      title: text(a.title), body: text(a.body), author: text(a.reviewerNickname),
      territory: text(a.territory), language: null, app_version: null, device: null,
      created_at: created, updated_at: created,
      reply_body: text(resp?.responseBody), reply_at: iso(resp?.lastModifiedDate), reply_state: text(resp?.state),
      link: null,
    });
  }
  return { rows, next: text(doc?.links?.next) };
}

// ---------------------------------------------------------------------------
// Google Play: the reviews API
// ---------------------------------------------------------------------------
/** One page of reviews.list as rows, and the next page's token. */
export function parsePlayReviews(doc: Json, packageName: string): { rows: ReviewRow[]; next: string | null } {
  const rows: ReviewRow[] = [];
  for (const r of doc?.reviews ?? []) {
    const comments: Json[] = r?.comments ?? [];
    const user = comments.find((c) => c?.userComment)?.userComment;
    const dev = comments.find((c) => c?.developerComment)?.developerComment;
    const rating = stars(user?.starRating);
    const when = googleTime(user?.lastModified);
    if (!r?.reviewId || !user || !rating || !when) continue;
    const meta = user.deviceMetadata ?? {};
    const device = text([meta.manufacturer, meta.productName].filter(Boolean).join(' ')) ?? text(user.device);
    rows.push({
      store: 'google', review_id: String(r.reviewId), rating,
      title: null, body: text(user.text), author: text(r.authorName),
      territory: null, language: text(user.reviewerLanguage),
      app_version: text(user.appVersionName) ?? (user.appVersionCode ? String(user.appVersionCode) : null),
      device, created_at: when, updated_at: when,
      reply_body: text(dev?.text), reply_at: googleTime(dev?.lastModified), reply_state: dev?.text ? 'PUBLISHED' : null,
      link: playReviewLink(packageName, String(r.reviewId)),
    });
  }
  return { rows, next: text(doc?.tokenPagination?.nextPageToken) };
}

/** Where the review opens in Play Console. */
export const playReviewLink = (packageName: string, reviewId: string) =>
  `https://play.google.com/console/developers/app/user-feedback/review-details?reviewId=${encodeURIComponent(reviewId)}&packageName=${encodeURIComponent(packageName)}`;

// ---------------------------------------------------------------------------
// Google Play: the monthly reviews report
// ---------------------------------------------------------------------------
/** Every record of a CSV file; quoted fields may hold commas, "" and line breaks. */
export function csvRecords(csv: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const s = csv.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((f) => f.trim())) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((f) => f.trim())) out.push(row);
  return out;
}

const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** The review id inside a Play Console review link, if it has one. */
export function reviewIdFromLink(link: string | null | undefined): string | null {
  const m = /[?&]reviewid=([^&#\s]+)/i.exec(link ?? '');
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Rows of one month's Play Console reviews report. Ratings with no text are kept too. */
export function parsePlayReviewsCsv(csv: string, packageName: string): ReviewRow[] {
  const records = csvRecords(csv);
  if (records.length < 2) return [];
  const head = records[0].map(key);
  const col = (...names: string[]) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const cPkg = col('package name'), cStars = col('star rating'), cText = col('review text'), cTitle = col('review title');
  const cSubmitMs = col('review submit millis since epoch'), cSubmit = col('review submit date and time');
  const cUpdMs = col('review last update millis since epoch'), cUpd = col('review last update date and time');
  const cReplyMs = col('developer reply millis since epoch'), cReply = col('developer reply date and time');
  const cReplyText = col('developer reply text'), cLink = col('review link');
  const cLang = col('reviewer language'), cDevice = col('device'), cVersion = col('app version name'), cCode = col('app version code');
  if (cStars < 0 || (cSubmitMs < 0 && cSubmit < 0)) throw new Error('Google Play reviews report is missing columns');
  const at = (f: string[], ms: number, date: number) => {
    const n = ms >= 0 ? Number((f[ms] ?? '').trim()) : NaN;
    if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
    return date >= 0 ? iso((f[date] ?? '').trim().replace(' ', 'T').replace(/ ?UTC$/, 'Z')) : null;
  };
  const rows: ReviewRow[] = [];
  for (const f of records.slice(1)) {
    if (cPkg >= 0 && f[cPkg]?.trim() && f[cPkg].trim() !== packageName) continue;
    const rating = stars(f[cStars]);
    const created = at(f, cSubmitMs, cSubmit);
    if (!rating || !created) continue;
    const link = cLink >= 0 ? text(f[cLink]) : null;
    const device = cDevice >= 0 ? text(f[cDevice]) : null;
    const id = reviewIdFromLink(link) ?? `report:${Date.parse(created)}:${device ?? ''}`;
    const replyBody = cReplyText >= 0 ? text(f[cReplyText]) : null;
    rows.push({
      store: 'google', review_id: id, rating,
      title: cTitle >= 0 ? text(f[cTitle]) : null, body: cText >= 0 ? text(f[cText]) : null, author: null,
      territory: null, language: cLang >= 0 ? text(f[cLang]) : null,
      app_version: (cVersion >= 0 ? text(f[cVersion]) : null) ?? (cCode >= 0 ? text(f[cCode]) : null),
      device, created_at: created, updated_at: at(f, cUpdMs, cUpd) ?? created,
      reply_body: replyBody, reply_at: replyBody ? at(f, cReplyMs, cReply) : null, reply_state: replyBody ? 'PUBLISHED' : null,
      link,
    });
  }
  return rows;
}

/** The Cloud Storage object name of one month's reviews report, e.g. 202611. */
export const playReviewsObject = (packageName: string, yyyymm: string) => `reviews/reviews_${packageName}_${yyyymm}.csv`;

/** YYYYMM months from `start` (YYYY-MM-DD) to the month of `now`, newest first, at most `max`. */
export function monthsSince(start: string, now: Date, max = 24): string[] {
  const out: string[] = [];
  const first = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;
  for (let m = now.getUTCFullYear() * 12 + now.getUTCMonth(); m >= first && out.length < max; m--) {
    out.push(`${Math.floor(m / 12)}${String((m % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------
const later = (a: string | null, b: string | null) => (a ?? '') >= (b ?? '');

/**
 * What to write for one review, given the row already saved (if any) and a newly read one.
 * The App Store list is complete, so it always wins. Google Play comes from two sources that can
 * lag each other (the live feed and the monthly report), so the newer review text and the newer
 * reply each win separately, and a field one source lacks (author, title) is kept.
 * Returns null when nothing changed.
 */
export function mergeReview(saved: ReviewRow | null | undefined, incoming: ReviewRow): ReviewRow | null {
  if (!saved) return incoming;
  let next: ReviewRow;
  if (incoming.store === 'apple') next = incoming;
  else {
    const review = later(incoming.updated_at, saved.updated_at) ? incoming : saved;
    const replyFrom = incoming.reply_body && (!saved.reply_body || later(incoming.reply_at, saved.reply_at)) ? incoming : saved;
    next = {
      ...review,
      title: review.title ?? saved.title ?? incoming.title,
      author: incoming.author ?? saved.author,
      device: review.device ?? saved.device ?? incoming.device,
      language: review.language ?? saved.language ?? incoming.language,
      app_version: review.app_version ?? saved.app_version ?? incoming.app_version,
      created_at: [saved.created_at, incoming.created_at].sort()[0],
      link: incoming.link ?? saved.link,
      reply_body: replyFrom.reply_body, reply_at: replyFrom.reply_at, reply_state: replyFrom.reply_state,
    };
  }
  const fields = Object.keys(next) as (keyof ReviewRow)[];
  return fields.some((f) => (next[f] ?? null) !== (saved[f] ?? null)) ? next : null;
}

/** Merges a batch: the newly read rows (several may share an id) against the saved ones. */
export function mergeReviews(saved: ReviewRow[], incoming: ReviewRow[]): ReviewRow[] {
  const have = new Map(saved.map((r) => [`${r.store}|${r.review_id}`, r]));
  const changed = new Map<string, ReviewRow>();
  for (const r of incoming) {
    const k = `${r.store}|${r.review_id}`;
    const merged = mergeReview(changed.get(k) ?? have.get(k), r);
    if (merged) changed.set(k, merged);
  }
  return [...changed.values()];
}
