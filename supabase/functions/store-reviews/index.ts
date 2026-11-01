// Ratings and reviews for the Admin Dashboard's Reviews page (onmylead.com/admin/reviews): reads
// the App Store's and Google Play's reviews into store_reviews (migration
// 20261101000000_store_reviews.sql) and posts replies. The page calls it when the list is more
// than a few hours old; nothing runs on a timer.
//
// Every call must come from a signed-in admin with an authenticator session: the caller's JWT is
// passed to admin_analytics_ping(), which runs require_admin() in the database. A reply is
// recorded through admin_review_replied() as that admin, so it is in the audit log.
//
// POST { action } with the user's Authorization header. Actions:
//   status     which stores are set up
//   refresh    { force?: boolean } read each store that is set up (at most every 15 minutes per
//              store unless force)
//   reply      { store, review_id, text } post (or replace) the public reply to one review
//
// Deploy:  supabase functions deploy store-reviews
// Secrets: ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY   App Store Connect API key (the same key as
//                                                       store-downloads and admin-integrations);
//                                                       reading and replying needs the Admin,
//                                                       App Manager or Customer Support role
//          ASC_APP_ID            optional, default 6822352321 (OnMyLead's Apple ID)
//          PLAY_SERVICE_ACCOUNT_JSON   the Play service account (same as play-verify); in Play
//                                      Console it also needs "Reply to reviews"
//          PLAY_REPORTS_BUCKET   optional (same as store-downloads): older Play reviews and
//                                star-only ratings from the monthly reviews reports
//          PLAY_PACKAGE_NAME     optional, default com.rusoffroad.onmylead.app
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

import { decodeReport } from '../_shared/store-reports.ts';
import {
  mergeReviews, monthsSince, parseAppleReviews, parsePlayReviews, parsePlayReviewsCsv, playReviewsObject, REPLY_LIMIT,
  type ReviewRow, type StoreKey,
} from '../_shared/store-reviews.ts';

const env = (k: string, fallback = '') => Deno.env.get(k) || fallback;

const APP_ID = env('ASC_APP_ID', '6822352321');
const PACKAGE = env('PLAY_PACKAGE_NAME', 'com.rusoffroad.onmylead.app');
// The first month either store could have a review.
const START = '2026-10-01';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const configured = () => ({
  apple: !!(env('ASC_ISSUER_ID') && env('ASC_KEY_ID') && env('ASC_PRIVATE_KEY')),
  google: !!playAccount(),
  google_history: !!(playAccount() && env('PLAY_REPORTS_BUCKET')),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { error: denied } = await db.rpc('admin_analytics_ping');
  if (denied) {
    const mfa = /two-factor/i.test(denied.message);
    return json({ error: mfa ? 'mfa_required' : 'not_admin', message: denied.message }, 403);
  }

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  switch (input?.action) {
    case 'status':
      return json({ configured: configured() });
    case 'refresh': {
      const on = configured();
      const results: Record<StoreKey, unknown> = { apple: 'not_configured', google: 'not_configured' };
      await Promise.all((['apple', 'google'] as StoreKey[]).filter((s) => on[s]).map(async (s) => {
        results[s] = await refresh(s, input.force === true);
      }));
      return json({ configured: on, results });
    }
    case 'reply':
      return await reply(db, input);
    default:
      return json({ error: 'unknown_action' }, 400);
  }
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
async function refresh(store: StoreKey, force: boolean) {
  const { data: last } = await service.from('store_review_imports').select('checked_at').eq('store', store).maybeSingle();
  if (!force && last?.checked_at && Date.now() - Date.parse(last.checked_at) < 15 * 60 * 1000) return 'recent';
  const checkedAt = new Date().toISOString();
  try {
    const read = store === 'apple' ? await readApple() : await readGoogle();
    const ids = [...new Set(read.map((r) => r.review_id))];
    const saved: ReviewRow[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await service.from('store_reviews').select('*').eq('store', store).in('review_id', ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      saved.push(...(data ?? []).map(({ imported_at: _, ...r }: any) => r as ReviewRow));
    }
    const changed = mergeReviews(saved, read);
    for (let i = 0; i < changed.length; i += 200) {
      const { error } = await service.from('store_reviews')
        .upsert(changed.slice(i, i + 200).map((r) => ({ ...r, imported_at: checkedAt })), { onConflict: 'store,review_id' });
      if (error) throw new Error(error.message);
    }
    await service.from('store_review_imports').upsert({ store, checked_at: checkedAt, ok_at: checkedAt, error: null });
    return { ok: true, read: read.length, changed: changed.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await service.from('store_review_imports').upsert({ store, checked_at: checkedAt, error: message.slice(0, 500) });
    return { ok: false, error: message };
  }
}

// --- App Store ---------------------------------------------------------------
let ascToken: { value: string; until: number } | null = null;

async function ascJwt() {
  if (ascToken && ascToken.until > Date.now() + 60_000) return ascToken.value;
  const key = await importPKCS8(env('ASC_PRIVATE_KEY').replace(/\\n/g, '\n'), 'ES256');
  const now = Math.floor(Date.now() / 1000);
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' })
    .setIssuer(env('ASC_ISSUER_ID'))
    .setAudience('appstoreconnect-v1')
    .setIssuedAt(now)
    .setExpirationTime(now + 15 * 60)
    .sign(key);
  ascToken = { value, until: (now + 15 * 60) * 1000 };
  return value;
}

async function ascError(res: Response) {
  // deno-lint-ignore no-explicit-any
  const body: any = await res.json().catch(() => null);
  if (res.status === 401) return new Error('App Store Connect refused the API key (check ASC_ISSUER_ID, ASC_KEY_ID and ASC_PRIVATE_KEY)');
  if (res.status === 403) return new Error('App Store Connect: the API key needs the Admin, App Manager or Customer Support role');
  return new Error(`App Store Connect: ${body?.errors?.[0]?.detail ?? `HTTP ${res.status}`}`);
}

async function readApple(): Promise<ReviewRow[]> {
  const rows: ReviewRow[] = [];
  let url: string | null = `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(APP_ID)}/customerReviews?` +
    new URLSearchParams({ limit: '200', sort: '-createdDate', include: 'response' });
  for (let page = 0; url && page < 10; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${await ascJwt()}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw await ascError(res);
    const parsed = parseAppleReviews(await res.json());
    rows.push(...parsed.rows);
    url = parsed.next;
  }
  return rows;
}

// --- Google Play ---------------------------------------------------------------
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function playAccount(): ServiceAccount | null {
  try {
    const sa = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON'));
    return sa?.client_email && sa?.private_key ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));
const tokens = new Map<string, { token: string; until: number }>();

async function googleToken(scope: string): Promise<string> {
  const hit = tokens.get(scope);
  if (hit && hit.until > Date.now()) return hit.token;
  const sa = playAccount()!;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({ iss: sa.client_email, scope, aud: tokenUri, iat, exp: iat + 3600 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.access_token !== 'string') throw new Error(`Google sign-in failed (${res.status})`);
  tokens.set(scope, { token: body.access_token, until: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000 });
  return body.access_token;
}

const PUBLISHER = 'https://www.googleapis.com/auth/androidpublisher';
const REVIEWS_API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE)}/reviews`;

async function readGoogle(): Promise<ReviewRow[]> {
  // The monthly reports first (older, may lag), then the live feed, which is newer.
  const rows: ReviewRow[] = [];
  if (env('PLAY_REPORTS_BUCKET')) rows.push(...await readGoogleReports());
  let token: string | null = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ maxResults: '100' });
    if (token) q.set('token', token);
    const res = await fetch(`${REVIEWS_API}?${q}`, { headers: { Authorization: `Bearer ${await googleToken(PUBLISHER)}` }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 403 || res.status === 401) {
      await res.body?.cancel();
      throw new Error('Google Play: the service account needs "Reply to reviews" in Play Console (Users and permissions)');
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Google Play reviews: HTTP ${res.status}`);
    }
    const parsed = parsePlayReviews(await res.json(), PACKAGE);
    rows.push(...parsed.rows);
    token = parsed.next;
    if (!token) break;
  }
  return rows;
}

async function readGoogleReports(): Promise<ReviewRow[]> {
  const token = await googleToken('https://www.googleapis.com/auth/devstorage.read_only');
  const bucket = env('PLAY_REPORTS_BUCKET').replace(/^gs:\/\//, '').replace(/\/.*$/, '');
  const rows: ReviewRow[] = [];
  for (const month of monthsSince(START, new Date()).reverse()) {
    const object = encodeURIComponent(playReviewsObject(PACKAGE, month));
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) {
      await res.body?.cancel();
      continue; // no reviews that month
    }
    if (!res.ok) {
      // The live feed still works without the reports; leave older reviews for next time.
      await res.body?.cancel();
      console.warn(`Google Play reviews report ${month}: HTTP ${res.status}`);
      continue;
    }
    rows.push(...parsePlayReviewsCsv(decodeReport(new Uint8Array(await res.arrayBuffer())), PACKAGE));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Replying
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function reply(db: SupabaseClient, input: any) {
  const store = input?.store as StoreKey;
  const reviewId = typeof input?.review_id === 'string' ? input.review_id : '';
  const body = typeof input?.text === 'string' ? input.text.trim() : '';
  if (store !== 'apple' && store !== 'google') return json({ error: 'bad_store' }, 400);
  if (!reviewId || !body) return json({ error: 'Write a reply first.' }, 400);
  if (body.length > REPLY_LIMIT[store]) return json({ error: `Replies on this store can be at most ${REPLY_LIMIT[store]} characters.` }, 400);
  if (!configured()[store]) return json({ error: 'This store is not connected yet.' }, 400);

  const { data: review } = await service.from('store_reviews').select('review_id, body').eq('store', store).eq('review_id', reviewId).maybeSingle();
  if (!review) return json({ error: 'That review is not in the list. Check the stores again.' }, 404);
  if (store === 'google' && reviewId.startsWith('report:')) {
    return json({ error: 'Google Play only lets you reply to this one in Play Console.' }, 400);
  }

  let state = 'PUBLISHED';
  try {
    if (store === 'apple') {
      const res = await fetch('https://api.appstoreconnect.apple.com/v1/customerReviewResponses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await ascJwt()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'customerReviewResponses',
            attributes: { responseBody: body },
            relationships: { review: { data: { type: 'customerReviews', id: reviewId } } },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw await ascError(res);
      // deno-lint-ignore no-explicit-any
      const doc: any = await res.json().catch(() => null);
      state = doc?.data?.attributes?.state ?? 'PENDING_PUBLISH';
    } else {
      const res = await fetch(`${REVIEWS_API}/${encodeURIComponent(reviewId)}:reply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await googleToken(PUBLISHER)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: body }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        // deno-lint-ignore no-explicit-any
        const err: any = await res.json().catch(() => null);
        throw new Error(res.status === 403
          ? 'Google Play: the service account needs "Reply to reviews" in Play Console'
          : `Google Play: ${err?.error?.message ?? `HTTP ${res.status}`}`);
      }
      await res.body?.cancel();
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  const { error } = await db.rpc('admin_review_replied', { p_store: store, p_review_id: reviewId, p_body: body, p_state: state });
  if (error) return json({ error: `The store has the reply, but saving it here failed: ${error.message}` }, 500);
  return json({ ok: true, state });
}
