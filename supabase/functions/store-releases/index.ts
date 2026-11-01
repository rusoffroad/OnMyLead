// Store rollouts for the owner-only Admin Dashboard's Releases page (onmylead.com/admin/releases):
// see where the newest Google Play and App Store releases are, and stop or restart them when an
// update turns out to be broken.
//
// Neither store can put an older version back on riders' phones. What each store does allow:
//   Google Play: halt a release (no new installs or updates get it; the release before it keeps
//     serving everyone else), resume it, widen a staged rollout, or release it to everyone.
//   App Store: pause a 7-day phased release (up to 30 days in total; riders can still update by
//     hand from the store), resume it, or release it to everyone. Phased release must be switched
//     on before the version goes live (asc_phased_on).
//
// Every call must come from a dashboard admin signed in with an authenticator code (admin_session,
// as admin-api checks). Every change is written to the Audit Log through admin_log_release()
// (migration 20261101300000) with the admin's own session BEFORE the store is asked (no entry,
// no change), then again with the store's answer. Nothing here runs on a schedule: each change
// is one click, after a confirmation, on the Releases page.
//
// POST { action, ...args } with the user's Authorization header. Actions:
//   status                                        both stores' newest releases and what can be done
//   play_halt | play_resume | play_complete       { versionCode }
//   play_rollout                                  { versionCode, fraction } (0.01 to 0.5)
//   asc_pause | asc_resume | asc_complete         { versionId }
//   asc_phased_on                                 { versionId } for a version not yet released
//
// Deploy:  supabase functions deploy store-releases   (JWT verification stays on)
// Secrets (already used by other functions; nothing new):
//   PLAY_SERVICE_ACCOUNT_JSON  the Play service account (play-verify). For the buttons it also needs
//                              "Release to production, exclude devices, and use Play App Signing"
//                              for OnMyLead in Play Console > Users and permissions.
//   PLAY_PACKAGE_NAME          optional, default com.rusoffroad.onmylead.app
//   ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY   the App Store Connect API key (admin-integrations,
//                              store-downloads, store-reviews); App Manager or Admin role.
//   ASC_BUNDLE_ID              optional, default com.rusoffroad.onmylead.app
//   ADMIN_ORIGINS              optional extra origins allowed to call it (default https://onmylead.com)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

import { accessToken, PACKAGE_NAME, playConfigured } from '../_shared/google-play.ts';
import {
  type AscAction, changePlayTrack, nextPhasedState, type PlayAction, type PlayTrack, ReleaseProblem, ROLLOUT_STEPS,
} from '../_shared/store-releases.ts';

const env = (k: string, fallback = '') => Deno.env.get(k) || fallback;
const ORIGINS = new Set(['https://onmylead.com', 'https://www.onmylead.com', ...env('ADMIN_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)]);

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://onmylead.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

class Problem extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  });
  const { data: session, error: sessionError } = await caller.rpc('admin_session');
  if (sessionError || !session?.is_admin) return reply({ error: 'admin only' }, 403);
  if (session.aal !== 'aal2') return reply({ error: 'admin needs two-factor sign-in' }, 403);

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  const action = String(input?.action ?? '');
  // The owner's optional note, kept with the Audit Log entry.
  const note = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 500) || null : null;
  try {
    if (action === 'status') return reply(await status());
    if (action === 'play_halt' || action === 'play_resume' || action === 'play_rollout' || action === 'play_complete') {
      return reply(await playChange(caller, action, String(input.versionCode ?? ''), input.fraction, note));
    }
    if (action === 'asc_pause' || action === 'asc_resume' || action === 'asc_complete') {
      return reply(await ascChange(caller, action, String(input.versionId ?? ''), note));
    }
    if (action === 'asc_phased_on') return reply(await ascPhasedOn(caller, String(input.versionId ?? ''), note));
    return reply({ error: 'unknown action' }, 400);
  } catch (e) {
    if (e instanceof ReleaseProblem) return reply({ error: e.message }, 409);
    if (e instanceof Problem) return reply({ error: e.message }, e.status);
    return reply({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

async function audit(db: SupabaseClient, action: string, target: string, before: unknown, after: unknown) {
  const { error } = await db.rpc('admin_log_release', { p_action: action, p_target_id: target, p_before: before ?? null, p_after: after ?? null });
  if (error) throw new Problem(`Could not write the Audit Log, so nothing was changed: ${error.message}`, 500);
}

/** Logs the attempt, does it, then logs the answer. A failure is logged and reported. */
async function logged<T>(db: SupabaseClient, action: string, target: string, before: unknown, after: unknown, run: () => Promise<T>, note: string | null): Promise<T> {
  await audit(db, action, target, before, { ...(after as object), reason: note });
  try {
    const result = await run();
    await audit(db, `${action}.done`, target, null, result as unknown).catch(() => {});
    return result;
  } catch (e) {
    await audit(db, `${action}.failed`, target, null, { error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    throw e;
  }
}

async function part<T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> {
  try {
    return { data: await fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const ascConfigured = () => !!(env('ASC_ISSUER_ID') && env('ASC_KEY_ID') && env('ASC_PRIVATE_KEY'));

async function status() {
  const [play, apple] = await Promise.all([
    playConfigured() ? part(playStatus) : Promise.resolve({ error: 'not_configured' }),
    ascConfigured() ? part(ascStatus) : Promise.resolve({ error: 'not_configured' }),
  ]);
  return { checked_at: new Date().toISOString(), rollout_steps: ROLLOUT_STEPS, play, apple };
}

// ---------------------------------------------------------------------------
// Google Play (Android Publisher API v3, edits)
// ---------------------------------------------------------------------------
const PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

async function play(path: string, init: RequestInit = {}) {
  const res = await fetch(`${PLAY}/${encodeURIComponent(PACKAGE_NAME)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  // deno-lint-ignore no-explicit-any
  const body: any = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const why = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403) throw new Problem(`Google Play refused: ${why}. The Play service account needs the "Release to production" permission for OnMyLead.`, 502);
    throw new Problem(`Google Play: ${why}`, 502);
  }
  return body;
}

/** Reads inside a throwaway Play "edit" (the only way the API shows a track), then deletes it. */
async function readEdit<T>(fn: (editId: string) => Promise<T>): Promise<T> {
  const edit = await play('/edits', { method: 'POST', body: '{}' });
  const id = String(edit?.id ?? '');
  if (!id) throw new Problem('Google Play did not open an edit.', 502);
  try {
    return await fn(id);
  } finally {
    await play(`/edits/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

const trackView = (t: PlayTrack) => ({
  releases: (t.releases ?? []).map((r) => ({
    name: r.name ?? null,
    versionCodes: r.versionCodes ?? [],
    status: r.status ?? null,
    userFraction: typeof r.userFraction === 'number' ? r.userFraction : null,
  })),
});

function playStatus() {
  return readEdit(async (id) => {
    const t: PlayTrack = await play(`/edits/${id}/tracks/production`);
    return { package: PACKAGE_NAME, ...trackView(t) };
  });
}

async function playChange(db: SupabaseClient, action: PlayAction, versionCode: string, fraction: unknown, note: string | null) {
  if (!playConfigured()) throw new Problem('Google Play is not connected (PLAY_SERVICE_ACCOUNT_JSON).', 409);
  if (!/^\d{1,10}$/.test(versionCode)) throw new Problem('versionCode is required');
  const f = action === 'play_rollout' ? Number(fraction) : undefined;
  if (action === 'play_rollout' && !ROLLOUT_STEPS.includes(f as number)) throw new Problem('Pick one of the offered percentages.');
  const edit = await play('/edits', { method: 'POST', body: '{}' });
  const id = String(edit?.id ?? '');
  if (!id) throw new Problem('Google Play did not open an edit.', 502);
  let committed = false;
  try {
    const before: PlayTrack = await play(`/edits/${id}/tracks/production`);
    const after = changePlayTrack(before, action, versionCode, f); // refuses in plain words first
    const result = await logged(db, `release.${action}`, `play:${versionCode}`, trackView(before), trackView(after), async () => {
      await play(`/edits/${id}/tracks/production`, { method: 'PUT', body: JSON.stringify(after) });
      await play(`/edits/${id}:commit`, { method: 'POST' });
      committed = true;
      return trackView(after);
    }, note);
    return result;
  } finally {
    if (!committed) await play(`/edits/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// App Store Connect API (appStoreVersions, appStoreVersionPhasedReleases)
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

async function asc(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await ascJwt()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  // deno-lint-ignore no-explicit-any
  const body: any = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail ?? body?.errors?.[0]?.title ?? `HTTP ${res.status}`;
    throw new Problem(`App Store Connect: ${detail}`, 502);
  }
  return body;
}

async function ascAppId(): Promise<string> {
  const bundle = env('ASC_BUNDLE_ID', 'com.rusoffroad.onmylead.app');
  const apps = await asc(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundle)}&limit=1`);
  const id = apps?.data?.[0]?.id;
  if (!id) throw new Problem(`App Store Connect has no app with bundle ID ${bundle}.`, 502);
  return String(id);
}

// deno-lint-ignore no-explicit-any
const phasedView = (p: any) => p ? ({
  id: String(p.id),
  state: p.attributes?.phasedReleaseState ?? null,
  startDate: p.attributes?.startDate ?? null,
  totalPauseDuration: p.attributes?.totalPauseDuration ?? null,
  currentDayNumber: p.attributes?.currentDayNumber ?? null,
}) : null;

async function phasedFor(versionId: string) {
  const r = await asc(`/v1/appStoreVersions/${encodeURIComponent(versionId)}/appStoreVersionPhasedRelease`).catch((e) => {
    if (e instanceof Problem && /not found|404/i.test(e.message)) return { data: null };
    throw e;
  });
  return phasedView(r?.data);
}

async function ascStatus() {
  const appId = await ascAppId();
  const r = await asc(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`);
  // deno-lint-ignore no-explicit-any
  const versions = ((r?.data ?? []) as any[])
    .sort((a, b) => String(b.attributes?.createdDate ?? '').localeCompare(String(a.attributes?.createdDate ?? '')))
    .slice(0, 3);
  return {
    appId,
    versions: await Promise.all(versions.map(async (v) => ({
      id: String(v.id),
      version: v.attributes?.versionString ?? null,
      state: v.attributes?.appVersionState ?? v.attributes?.appStoreState ?? null,
      releaseType: v.attributes?.releaseType ?? null,
      created: v.attributes?.createdDate ?? null,
      phased: await phasedFor(String(v.id)).catch(() => null),
    }))),
  };
}

async function ascChange(db: SupabaseClient, action: AscAction, versionId: string, note: string | null) {
  if (!ascConfigured()) throw new Problem('App Store Connect is not connected (ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY).', 409);
  if (!/^[\w-]{1,64}$/.test(versionId)) throw new Problem('versionId is required');
  const phased = await phasedFor(versionId);
  if (!phased) throw new ReleaseProblem("This version has no phased release, so it's already going to everyone.");
  const next = nextPhasedState(String(phased.state), action); // refuses in plain words first
  return await logged(db, `release.${action}`, `asc:${versionId}`, phased, { state: next }, async () => {
    const r = await asc(`/v1/appStoreVersionPhasedReleases/${encodeURIComponent(phased.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'appStoreVersionPhasedReleases', id: phased.id, attributes: { phasedReleaseState: next } } }),
    });
    return phasedView(r?.data);
  }, note);
}

async function ascPhasedOn(db: SupabaseClient, versionId: string, note: string | null) {
  if (!ascConfigured()) throw new Problem('App Store Connect is not connected (ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY).', 409);
  if (!/^[\w-]{1,64}$/.test(versionId)) throw new Problem('versionId is required');
  const v = await asc(`/v1/appStoreVersions/${encodeURIComponent(versionId)}`);
  const state = String(v?.data?.attributes?.appVersionState ?? v?.data?.attributes?.appStoreState ?? '');
  if (['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE'].includes(state)) {
    throw new ReleaseProblem('This version is already live, so phased release can only be set before it goes out.');
  }
  if (await phasedFor(versionId)) throw new ReleaseProblem('Phased release is already on for this version.');
  return await logged(db, 'release.asc_phased_on', `asc:${versionId}`, { state }, { phased: 'INACTIVE' }, async () => {
    const r = await asc('/v1/appStoreVersionPhasedReleases', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appStoreVersionPhasedReleases',
          attributes: { phasedReleaseState: 'INACTIVE' },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } },
        },
      }),
    });
    return phasedView(r?.data);
  }, note);
}
