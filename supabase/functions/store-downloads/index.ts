// App downloads for the Admin Dashboard's Growth page (onmylead.com/admin/growth): reads the App
// Store's daily sales reports and Google Play's installs reports into store_downloads
// (migration 20261030000000_admin_growth.sql). The page calls it when the numbers are more than a
// few hours old; nothing runs on a timer.
//
// Every call must come from a signed-in admin with an authenticator session: the caller's JWT is
// passed to admin_analytics_ping(), which runs require_admin() in the database.
//
// POST { action } with the user's Authorization header. Actions:
//   status     which stores are set up
//   refresh    { force?: boolean } read new days from each store that is set up (at most once an
//              hour per store unless force)
//
// Deploy:  supabase functions deploy store-downloads
// Secrets: ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY   App Store Connect API key (the same key as
//                                                       admin-integrations) with the Sales role
//          ASC_VENDOR_NUMBER     Payments and Financial Reports > vendor number (8 digits)
//          ASC_APP_ID            optional, default 6822352321 (OnMyLead's Apple ID)
//          PLAY_SERVICE_ACCOUNT_JSON   the Play service account (same as play-verify); in Play
//                                      Console it also needs "View app information and download
//                                      bulk reports"
//          PLAY_REPORTS_BUCKET   pubsite_prod_rev_<number> (Play Console > Download reports >
//                                Copy Cloud Storage URI, without gs://)
//          PLAY_PACKAGE_NAME     optional, default com.rusoffroad.onmylead.app
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

import {
  appleDaysToFetch, decodeReport, parseAppleSales, parsePlayInstalls, playInstallsObject, type DownloadRow,
} from '../_shared/store-reports.ts';

const env = (k: string, fallback = '') => Deno.env.get(k) || fallback;

const APP_ID = env('ASC_APP_ID', '6822352321');
const PACKAGE = env('PLAY_PACKAGE_NAME', 'com.rusoffroad.onmylead.app');
// The first day either store could have a download (iPhone 1.0 was submitted 2026-10-13).
const START = '2026-10-13';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Store = 'apple' | 'google';

const configured = () => ({
  apple: !!(env('ASC_ISSUER_ID') && env('ASC_KEY_ID') && env('ASC_PRIVATE_KEY') && env('ASC_VENDOR_NUMBER')),
  google: !!(playAccount() && env('PLAY_REPORTS_BUCKET')),
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
      const results: Record<Store, unknown> = { apple: 'not_configured', google: 'not_configured' };
      await Promise.all((['apple', 'google'] as Store[]).filter((s) => on[s]).map(async (s) => {
        results[s] = await refresh(s, input.force === true);
      }));
      return json({ configured: on, results });
    }
    default:
      return json({ error: 'unknown_action' }, 400);
  }
});

async function refresh(store: Store, force: boolean) {
  const { data: last } = await service.from('store_download_imports').select('checked_at').eq('store', store).maybeSingle();
  if (!force && last?.checked_at && Date.now() - Date.parse(last.checked_at) < 60 * 60 * 1000) return 'recent';
  const checkedAt = new Date().toISOString();
  try {
    const { rows, days } = store === 'apple' ? await readApple() : await readGoogle();
    if (rows.length) {
      const { error } = await service.from('store_downloads').upsert(rows.map((r) => ({ ...r, imported_at: checkedAt })), { onConflict: 'store,day,device' });
      if (error) throw new Error(error.message);
    }
    if (days.length) {
      const { error } = await service.from('store_download_days').upsert(days.map((day) => ({ store, day })), { onConflict: 'store,day' });
      if (error) throw new Error(error.message);
    }
    const latest = rows.map((r) => r.day).sort().at(-1) ?? null;
    const { data: prev } = await service.from('store_download_imports').select('latest_day').eq('store', store).maybeSingle();
    await service.from('store_download_imports').upsert({
      store, checked_at: checkedAt, ok_at: checkedAt, error: null,
      latest_day: [prev?.latest_day ?? null, latest].filter(Boolean).sort().at(-1) ?? null,
    });
    return { ok: true, rows: rows.length, days: days.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await service.from('store_download_imports').upsert({ store, checked_at: checkedAt, error: message.slice(0, 500) });
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// App Store: Sales and Trends daily summary
// ---------------------------------------------------------------------------
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

async function readApple(): Promise<{ rows: DownloadRow[]; days: string[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: done } = await service.from('store_download_days').select('day').eq('store', 'apple').gte('day', START);
  const todo = appleDaysToFetch(today, START, new Set((done ?? []).map((d: { day: string }) => d.day)));
  const rows: DownloadRow[] = [];
  const days: string[] = [];
  for (const day of todo) {
    const q = new URLSearchParams({
      'filter[frequency]': 'DAILY', 'filter[reportType]': 'SALES', 'filter[reportSubType]': 'SUMMARY',
      'filter[vendorNumber]': env('ASC_VENDOR_NUMBER'), 'filter[reportDate]': day, 'filter[version]': '1_1',
    });
    const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${q}`, {
      headers: { Authorization: `Bearer ${await ascJwt()}`, Accept: 'application/a-gzip' },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) {
      // No report: either nothing sold that day, or Apple hasn't published it yet. Count the
      // day as read only once it is old enough that the report would be out.
      await res.body?.cancel();
      if (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) >= 3 * 86_400_000) days.push(day);
      continue;
    }
    if (!res.ok) {
      // deno-lint-ignore no-explicit-any
      const body: any = await res.json().catch(() => null);
      throw new Error(`App Store Connect: ${body?.errors?.[0]?.detail ?? `HTTP ${res.status}`}`);
    }
    const tsv = await new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).text();
    rows.push(...parseAppleSales(tsv, APP_ID));
    days.push(day);
  }
  return { rows, days };
}

// ---------------------------------------------------------------------------
// Google Play: installs reports in the Play Console's Cloud Storage bucket
// ---------------------------------------------------------------------------
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

async function storageToken(): Promise<string> {
  const sa = playAccount()!;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_only', aud: tokenUri, iat, exp: iat + 3600,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.access_token !== 'string') throw new Error(`Google sign-in failed (${res.status})`);
  return body.access_token;
}

async function readGoogle(): Promise<{ rows: DownloadRow[]; days: string[] }> {
  const token = await storageToken();
  const bucket = env('PLAY_REPORTS_BUCKET').replace(/^gs:\/\//, '').replace(/\/.*$/, '');
  // This month and last month: Google rewrites the current month's file every day.
  const now = new Date();
  const months = [0, 1].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }).filter((m) => m >= START.slice(0, 7).replace('-', ''));
  const rows: DownloadRow[] = [];
  for (const month of months) {
    const object = encodeURIComponent(playInstallsObject(PACKAGE, month));
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) {
      await res.body?.cancel();
      continue; // no installs report for that month yet
    }
    if (res.status === 403) {
      await res.body?.cancel();
      throw new Error('Google Play: the service account may not download reports (Play Console > Users and permissions)');
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Google Play reports: HTTP ${res.status}`);
    }
    rows.push(...parsePlayInstalls(decodeReport(new Uint8Array(await res.arrayBuffer())), PACKAGE));
  }
  return { rows: rows.filter((r) => r.day >= START), days: [] };
}
