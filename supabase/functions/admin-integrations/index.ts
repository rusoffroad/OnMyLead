// Outside services for the owner-only Admin Dashboard (onmylead.com/admin): crash numbers from
// Sentry, Apple offer codes from App Store Connect, and a quick check that the backend answers.
// The keys stay here as Supabase secrets; the dashboard only ever sees the results.
//
// Every call must come from a signed-in admin with an authenticator session: the caller's JWT is
// passed to admin_analytics_ping(), which runs require_admin() in the database. Changes in App
// Store Connect and code downloads are written to the audit log through admin_log_integration().
//
// POST { action, ...args } with the user's Authorization header. Actions:
//   status                 which integrations are set up, and backend / website reachability
//   sentry_summary         { period?: '24h' | '7d' | '14d' | '30d' } crashes, errors, users, versions
//   asc_offer_codes        offer code campaigns for every OnMyLead Pro subscription
//   asc_generate_codes     { offerCodeId, numberOfCodes, expirationDate } new one-time codes
//   asc_code_values        { oneTimeUseCodesId } the codes of one batch, as CSV text
//
// Deploy:  supabase functions deploy admin-integrations
// Secrets: SENTRY_AUTH_TOKEN   Sentry auth token with org:read, project:read, event:read
//          SENTRY_ORG          rus-offroad (default)
//          SENTRY_PROJECT      react-native (default)
//          ASC_ISSUER_ID       App Store Connect API issuer id
//          ASC_KEY_ID          App Store Connect API key id
//          ASC_PRIVATE_KEY     contents of the AuthKey_<id>.p8 file
//          ASC_BUNDLE_ID       com.rusoffroad.onmylead.app (default)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

const env = (k: string, fallback = '') => Deno.env.get(k) || fallback;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class Problem extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { error: denied } = await db.rpc('admin_analytics_ping');
  if (denied) {
    const mfa = /two-factor/i.test(denied.message);
    return json({ error: mfa ? 'mfa_required' : 'not_admin', message: denied.message }, 403);
  }

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  try {
    switch (input?.action) {
      case 'status':
        return json(await status());
      case 'sentry_summary':
        return json(await sentrySummary(String(input.period ?? '14d')));
      case 'asc_offer_codes':
        return json(await offerCodes());
      case 'asc_generate_codes':
        return json(await generateCodes(db, input));
      case 'asc_code_values':
        return json(await codeValues(db, input));
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    if (e instanceof Problem) return json({ error: e.code, message: e.message }, e.status);
    return json({ error: 'failed', message: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
async function timed(url: string, init?: RequestInit) {
  const started = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    await res.body?.cancel();
    return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { ok: false, status: null, ms: Math.round(performance.now() - started), error: e instanceof Error ? e.message : String(e) };
  }
}

async function status() {
  const base = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  const [authApi, restApi, website] = await Promise.all([
    timed(`${base}/auth/v1/health`, { headers: { apikey: anon } }),
    timed(`${base}/rest/v1/`, { headers: { apikey: anon } }),
    timed('https://onmylead.com/'),
  ]);
  return {
    checked_at: new Date().toISOString(),
    configured: {
      sentry: !!env('SENTRY_AUTH_TOKEN'),
      app_store_connect: !!(env('ASC_ISSUER_ID') && env('ASC_KEY_ID') && env('ASC_PRIVATE_KEY')),
    },
    services: { auth: authApi, api: restApi, website },
  };
}

// ---------------------------------------------------------------------------
// Sentry
// ---------------------------------------------------------------------------
const SENTRY_PERIODS = new Set(['24h', '7d', '14d', '30d']);

async function sentry(path: string) {
  const res = await fetch(`https://sentry.io/api/0/${path}`, {
    headers: { Authorization: `Bearer ${env('SENTRY_AUTH_TOKEN')}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Problem('sentry_error', `Sentry answered ${res.status} for ${path.split('?')[0]}`, 502);
  return res.json();
}

/** Each part is fetched on its own, so one Sentry hiccup leaves the rest of the page filled in. */
async function part<T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> {
  try {
    return { data: await fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function sentrySummary(period: string) {
  if (!env('SENTRY_AUTH_TOKEN')) throw new Problem('not_configured', 'SENTRY_AUTH_TOKEN is not set', 409);
  if (!SENTRY_PERIODS.has(period)) throw new Problem('bad_period', 'period must be 24h, 7d, 14d or 30d');
  const org = env('SENTRY_ORG', 'rus-offroad');
  const slug = env('SENTRY_PROJECT', 'react-native');
  const project = await sentry(`projects/${org}/${slug}/`);
  const pid = project.id;
  const interval = period === '24h' ? '1h' : '1d';
  const q = (o: Record<string, string | string[]>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) p.append(k, x);
    return p.toString();
  };

  const [sessions, issues, errors, releases] = await Promise.all([
    // Crash-free sessions and users, from release health.
    part(async () => {
      const r = await sentry(`organizations/${org}/sessions/?${q({
        project: pid, statsPeriod: period, interval, groupBy: 'session.status',
        field: ['sum(session)', 'count_unique(user)'],
      })}`);
      const totals: Record<string, { sessions: number; users: number }> = {};
      // deno-lint-ignore no-explicit-any
      for (const g of r.groups ?? []) totals[g.by['session.status']] = { sessions: g.totals['sum(session)'] ?? 0, users: g.totals['count_unique(user)'] ?? 0 };
      const all = Object.values(totals).reduce((a, t) => a + t.sessions, 0);
      const crashed = totals.crashed?.sessions ?? 0;
      return { sessions: all, crashed, crash_free_rate: all ? 1 - crashed / all : null, crashed_users: totals.crashed?.users ?? 0 };
    }),
    // Unresolved issues, most frequent first.
    part(async () => {
      const r = await sentry(`projects/${org}/${slug}/issues/?${q({ statsPeriod: period === '30d' ? '14d' : period, query: 'is:unresolved', sort: 'freq', limit: '10' })}`);
      // deno-lint-ignore no-explicit-any
      return (r as any[]).map((i) => ({
        id: i.id, title: i.title, culprit: i.culprit, level: i.level, count: Number(i.count ?? 0),
        users: Number(i.userCount ?? 0), first_seen: i.firstSeen, last_seen: i.lastSeen, link: i.permalink,
      }));
    }),
    // Error events over time.
    part(async () => {
      const r = await sentry(`organizations/${org}/events-stats/?${q({
        project: pid, statsPeriod: period, interval, yAxis: 'count()', query: 'event.type:error',
      })}`);
      // deno-lint-ignore no-explicit-any
      return (r.data ?? []).map(([t, v]: [number, { count: number }[]]) => ({ t: new Date(t * 1000).toISOString(), v: v?.[0]?.count ?? 0 }));
    }),
    // Errors and affected users per app version.
    part(async () => {
      const r = await sentry(`organizations/${org}/events/?${q({
        project: pid, statsPeriod: period, query: 'event.type:error', sort: '-count()', per_page: '10',
        field: ['release', 'count()', 'count_unique(user)'],
      })}`);
      // deno-lint-ignore no-explicit-any
      return (r.data ?? []).map((row: any) => ({ release: row.release || 'Unknown', errors: row['count()'] ?? 0, users: row['count_unique(user)'] ?? 0 }));
    }),
  ]);

  return { period, project: { slug, link: `https://${org}.sentry.io/projects/${slug}/` }, sessions, issues, errors, releases };
}

// ---------------------------------------------------------------------------
// App Store Connect (offer codes)
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

async function asc(path: string, init: RequestInit = {}, as: 'json' | 'text' = 'json') {
  if (!(env('ASC_ISSUER_ID') && env('ASC_KEY_ID') && env('ASC_PRIVATE_KEY'))) {
    throw new Problem('not_configured', 'App Store Connect API key is not set', 409);
  }
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await ascJwt()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    const body: any = await res.json().catch(() => null);
    const detail = body?.errors?.[0]?.detail ?? body?.errors?.[0]?.title ?? `HTTP ${res.status}`;
    throw new Problem('asc_error', `App Store Connect: ${detail}`, 502);
  }
  return as === 'text' ? res.text() : res.json();
}

async function offerCodes() {
  const bundle = env('ASC_BUNDLE_ID', 'com.rusoffroad.onmylead.app');
  const apps = await asc(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundle)}&limit=1`);
  const app = apps.data?.[0];
  if (!app) return { app: null, subscriptions: [] };
  const groups = await asc(`/v1/apps/${app.id}/subscriptionGroups?limit=20`);
  const subscriptions = [];
  for (const g of groups.data ?? []) {
    const subs = await asc(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=20`);
    for (const s of subs.data ?? []) {
      const offers = await asc(`/v1/subscriptions/${s.id}/offerCodes?limit=50`);
      const campaigns = [];
      for (const o of offers.data ?? []) {
        const [oneTime, custom] = await Promise.all([
          asc(`/v1/subscriptionOfferCodes/${o.id}/oneTimeUseCodes?limit=50`).catch(() => ({ data: [] })),
          asc(`/v1/subscriptionOfferCodes/${o.id}/customCodes?limit=50`).catch(() => ({ data: [] })),
        ]);
        campaigns.push({
          id: o.id,
          name: o.attributes?.name,
          active: o.attributes?.active ?? null,
          eligibility: o.attributes?.customerEligibilities ?? [],
          offerEligibility: o.attributes?.offerEligibility ?? null,
          mode: o.attributes?.offerMode ?? null,
          duration: o.attributes?.duration ?? null,
          periods: o.attributes?.numberOfPeriods ?? null,
          totalCodes: o.attributes?.totalNumberOfCodes ?? null,
          // deno-lint-ignore no-explicit-any
          oneTimeBatches: (oneTime.data ?? []).map((b: any) => ({
            id: b.id, codes: b.attributes?.numberOfCodes ?? null, created: b.attributes?.createdDate ?? null,
            expires: b.attributes?.expirationDate ?? null, active: b.attributes?.active ?? null,
          })),
          // deno-lint-ignore no-explicit-any
          customCodes: (custom.data ?? []).map((c: any) => ({
            id: c.id, code: c.attributes?.customCode, limit: c.attributes?.numberOfCodes ?? null,
            created: c.attributes?.createdDate ?? null, expires: c.attributes?.expirationDate ?? null, active: c.attributes?.active ?? null,
          })),
        });
      }
      subscriptions.push({ id: s.id, productId: s.attributes?.productId, name: s.attributes?.name, state: s.attributes?.state, campaigns });
    }
  }
  return { app: { id: app.id, name: app.attributes?.name, bundleId: bundle }, subscriptions };
}

async function audit(db: SupabaseClient, action: string, targetType: string, targetId: string, after: unknown) {
  const { error } = await db.rpc('admin_log_integration', { p_action: action, p_target_type: targetType, p_target_id: targetId, p_after: after });
  if (error) throw new Problem('audit_failed', `Could not write the Audit Log: ${error.message}`, 500);
}

// deno-lint-ignore no-explicit-any
async function generateCodes(db: SupabaseClient, input: any) {
  const offerCodeId = String(input.offerCodeId ?? '');
  const numberOfCodes = Number(input.numberOfCodes);
  const expirationDate = String(input.expirationDate ?? '');
  if (!/^[\w-]+$/.test(offerCodeId)) throw new Problem('bad_input', 'offerCodeId is required');
  if (!Number.isInteger(numberOfCodes) || numberOfCodes < 1 || numberOfCodes > 25000) throw new Problem('bad_input', 'numberOfCodes must be 1 to 25,000');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || new Date(`${expirationDate}T00:00:00Z`) <= new Date()) {
    throw new Problem('bad_input', 'expirationDate must be a future date (YYYY-MM-DD)');
  }
  // Logged before Apple is asked: no audit entry, no codes.
  await audit(db, 'asc.generate_offer_codes', 'offer_code', offerCodeId, { numberOfCodes, expirationDate });
  const made = await asc('/v1/subscriptionOfferCodeOneTimeUseCodes', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'subscriptionOfferCodeOneTimeUseCodes',
        attributes: { numberOfCodes, expirationDate },
        relationships: { offerCode: { data: { type: 'subscriptionOfferCodes', id: offerCodeId } } },
      },
    }),
  });
  return { id: made.data?.id, numberOfCodes, expirationDate };
}

// deno-lint-ignore no-explicit-any
async function codeValues(db: SupabaseClient, input: any) {
  const id = String(input.oneTimeUseCodesId ?? '');
  if (!/^[\w-]+$/.test(id)) throw new Problem('bad_input', 'oneTimeUseCodesId is required');
  // Logged before the codes leave the server: no audit entry, no codes.
  await audit(db, 'asc.download_offer_codes', 'offer_code_batch', id, null);
  const csv = await asc(`/v1/subscriptionOfferCodeOneTimeUseCodes/${id}/values`, { headers: { Accept: 'text/csv' } }, 'text');
  return { id, csv };
}
