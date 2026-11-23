// Push Riders (Admin Dashboard > Push Riders): one push notification to riders' phones.
//
// POST from the dashboard (the caller must be an admin signed in with an authenticator code; the
// function asks the database with the caller's own token, like rider-email):
//   {"action":"test","title":"...","body":"..."}   to the admin's own phones only
//   {"action":"send","title":"...","body":"...","audience":"not_subscribed"|"everyone","expect":123}
//       every phone in push_audience() (migration 20261123200000_push_riders). "expect" is the
//       phone count the admin saw; if it changed, nothing is sent and the new count comes back.
//       The same title can't go to the same audience twice within a day.
// A tap opens the app (data type "promo", url /pro; app builds that don't know it just open).
// Phones Apple or Google say are gone are removed from push_tokens, as notify-ride-message does.
//
// Deploy:  supabase functions deploy rider-push   (JWT verification stays on)
// Secrets: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID (optional),
//          FCM_SERVICE_ACCOUNT   (already set for ride pushes)
//          ADMIN_ORIGINS optional, extra origins allowed to call it (default https://onmylead.com)
import { createClient } from 'npm:@supabase/supabase-js@2';

import { channelFor, fcmAccessToken, readServiceAccount, sendFcm } from '../_shared/fcm.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const ORIGINS = new Set(['https://onmylead.com', 'https://www.onmylead.com', ...env('ADMIN_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)]);
const APNS_HOSTS = ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'];
const AUDIENCES = new Set(['not_subscribed', 'everyone']);

type Phone = { user_id: string; token: string; platform: 'ios' | 'android' };
type Outcome = 'ok' | 'gone' | 'failed';

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://onmylead.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** Title 3 to 80 characters, message 5 to 240, trimmed; null when either is out of range. */
export function checkPush(title: unknown, body: unknown): { title: string; body: string } | null {
  const t = typeof title === 'string' ? title.trim() : '';
  const b = typeof body === 'string' ? body.trim() : '';
  if (t.length < 3 || t.length > 80 || b.length < 5 || b.length > 240) return null;
  return { title: t, body: b };
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
  const { data: who } = await caller.auth.getUser();
  const { data: session, error: sessionError } = await caller.rpc('admin_session');
  if (!who?.user || sessionError || !session?.is_admin) return reply({ error: 'admin only' }, 403);
  if (session.aal !== 'aal2') return reply({ error: 'admin needs two-factor sign-in' }, 403);

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  const action = String(input?.action ?? '');
  if (action !== 'test' && action !== 'send') return reply({ error: 'unknown action' }, 400);
  const draft = checkPush(input?.title, input?.body);
  if (!draft) return reply({ error: 'Title needs 3 to 80 characters and the message 5 to 240.' }, 400);
  const audience = action === 'test' ? 'everyone' : String(input?.audience ?? '');
  if (!AUDIENCES.has(audience)) return reply({ error: 'unknown audience' }, 400);

  let phones: Phone[];
  if (action === 'test') {
    const { data, error } = await service.from('push_tokens').select('user_id, token, platform').eq('user_id', who.user.id);
    if (error) return reply({ error: error.message }, 500);
    phones = (data ?? []) as Phone[];
    if (!phones.length) return reply({ error: 'Your account has no phone signed up for notifications.' }, 400);
  } else {
    const { data, error } = await service.rpc('push_audience', { p_audience: audience });
    if (error) return reply({ error: error.message }, 500);
    phones = (data ?? []) as Phone[];
    if (Number(input?.expect) !== phones.length) return reply({ error: 'changed', recipients: phones.length }, 409);
    const { data: recent } = await service.from('push_broadcasts').select('id').eq('test', false).eq('title', draft.title).eq('audience', audience)
      .in('status', ['sending', 'sent']).gte('created_at', new Date(Date.now() - 86_400_000).toISOString()).limit(1);
    if (recent?.length) return reply({ error: 'This push already went to these riders in the last day.' }, 409);
  }

  const { data: log, error: logError } = await service.from('push_broadcasts').insert({
    created_by: who.user.id, title: draft.title, body: draft.body, audience, test: action === 'test', recipients: phones.length,
  }).select('id').single();
  if (logError) return reply({ error: logError.message }, 500);

  const data = { type: 'promo', url: '/pro', broadcastId: log.id };
  const [ios, android] = await Promise.all([
    sendIos(phones.filter((p) => p.platform === 'ios'), draft, data),
    sendAndroid(phones.filter((p) => p.platform === 'android'), draft, data),
  ]);
  const results = [...ios.results, ...android.results];
  const gone = results.filter((r) => r.outcome === 'gone').map((r) => r.phone.token);
  if (gone.length) await service.from('push_tokens').delete().in('token', gone);
  const sent = results.filter((r) => r.outcome === 'ok').length;
  const note = [ios.note, android.note].filter(Boolean).join('; ') || null;
  await service.from('push_broadcasts').update({
    sent, status: sent === 0 && phones.length > 0 ? 'failed' : 'sent', note, finished_at: new Date().toISOString(),
  }).eq('id', log.id);
  if (action === 'send') {
    await service.from('admin_audit_log').insert({
      actor_id: who.user.id, action: 'push.riders', target_type: 'push', target_id: log.id,
      after: { title: draft.title, audience, recipients: phones.length, sent },
    });
  }
  return reply({ ok: sent > 0, recipients: phones.length, sent, removed: gone.length, note });
});

type Sent = { results: { phone: Phone; outcome: Outcome }[]; note?: string };

async function sendIos(phones: Phone[], p: { title: string; body: string }, data: Record<string, unknown>): Promise<Sent> {
  if (!phones.length) return { results: [] };
  const jwt = await apnsJwt();
  if (!jwt) return { results: [], note: 'APNs not configured' };
  const payload = { aps: { alert: { title: p.title, body: p.body }, sound: 'default', 'thread-id': 'account' }, body: data };
  const outcomes: Outcome[] = [];
  // A few at a time so a big list doesn't open hundreds of connections at once.
  for (let i = 0; i < phones.length; i += 20) {
    outcomes.push(...(await Promise.all(phones.slice(i, i + 20).map((ph) => sendApns(ph.token, payload, jwt)))));
  }
  return { results: phones.map((phone, i) => ({ phone, outcome: outcomes[i] })) };
}

async function sendAndroid(phones: Phone[], p: { title: string; body: string }, data: Record<string, unknown>): Promise<Sent> {
  if (!phones.length) return { results: [] };
  const sa = readServiceAccount(env('FCM_SERVICE_ACCOUNT'));
  if (!sa) return { results: [], note: 'FCM not configured' };
  const access = await fcmAccessToken(sa);
  if (!access) return { results: [], note: 'FCM sign-in failed' };
  const outcomes: Outcome[] = [];
  for (let i = 0; i < phones.length; i += 20) {
    outcomes.push(...(await Promise.all(phones.slice(i, i + 20).map((ph) =>
      sendFcm(sa, access, { token: ph.token, title: p.title, body: p.body, data, channelId: channelFor(data.type) })))));
  }
  return { results: phones.map((phone, i) => ({ phone, outcome: outcomes[i] })) };
}

/** Same as notify-ride-message: production first, then the sandbox for Xcode-installed builds. */
async function sendApns(token: string, payload: unknown, jwt: string): Promise<Outcome> {
  for (const host of APNS_HOSTS) {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': env('APNS_BUNDLE_ID') || 'com.rusoffroad.onmylead.app',
        'apns-push-type': 'alert',
        'apns-priority': '10',
      },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res) return 'failed';
    if (res.ok) return 'ok';
    const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
    if (res.status === 410 || reason === 'Unregistered') return 'gone';
    if (reason !== 'BadDeviceToken') return 'failed';
  }
  return 'gone';
}

async function apnsJwt(): Promise<string | null> {
  const keyId = env('APNS_KEY_ID');
  const teamId = env('APNS_TEAM_ID');
  const pem = env('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !pem) return null;
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'ES256', kid: keyId })}.${enc({ iss: teamId, iat: Math.floor(Date.now() / 1000) })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}
