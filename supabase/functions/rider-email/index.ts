// Email All Riders (Admin Dashboard > Email Riders) and its unsubscribe link.
//
// POST from the dashboard (the caller must be an admin signed in with an authenticator code; the
// function asks the database with the caller's own token, like admin-api):
//   {"action":"test","subject":"...","body":"..."}   one copy to the admin's own email
//   {"action":"send","subject":"...","body":"...","expect":123}
//       every rider in email_audience() (migration 20261116500000), one email each through Resend.
//       "expect" is the count the admin saw; if the audience changed since, nothing is sent and the
//       new count comes back. The same subject can't go to everyone twice within a day.
// GET or POST ?u=<user id>&t=<signature>: the unsubscribe link (and Gmail's one-click unsubscribe).
//
// Deploy:  supabase functions deploy rider-email --no-verify-jwt   (the unsubscribe link has no
//          sign-in; the dashboard actions check the admin themselves)
// Secrets: RESEND_API_KEY   (already set for ride emails)
//          NEWS_FROM        optional, default "Chris at OnMyLead <chris@onmylead.com>"
//          NEWS_REPLY_TO    optional, default chris@rusoffroad.com
//          ADMIN_ORIGINS    optional, extra origins allowed to call it (default https://onmylead.com)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; the
// service role key also signs the unsubscribe links.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildEmail, checkDraft, checkUnsubscribeToken, type Recipient, unsubscribePage, unsubscribeToken, unsubscribeUrl,
} from '../_shared/rider-email.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const ORIGINS = new Set(['https://onmylead.com', 'https://www.onmylead.com', ...env('ADMIN_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = () => env('SUPABASE_SERVICE_ROLE_KEY');
const FROM = () => env('NEWS_FROM') || 'Chris at OnMyLead <chris@onmylead.com>';
const REPLY_TO = () => env('NEWS_REPLY_TO') || 'chris@rusoffroad.com';

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://onmylead.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

async function unsubscribe(url: URL): Promise<Response> {
  const u = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';
  let ok = UUID.test(u) && (await checkUnsubscribeToken(SECRET(), u, t));
  if (ok) {
    const { data, error } = await service.rpc('email_unsubscribe', { p_user: u });
    ok = !error && data === true;
  }
  return new Response(unsubscribePage(ok), { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function sendBatch(key: string, subject: string, body: string, rows: Recipient[]): Promise<{ sent: number; note?: string }> {
  let sent = 0;
  const base = env('SUPABASE_URL');
  // Resend takes up to 100 emails per batch call.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = await Promise.all(rows.slice(i, i + 100).map(async (r) => ({
      from: FROM(),
      to: [r.email],
      reply_to: REPLY_TO(),
      ...buildEmail(subject, body, r, unsubscribeUrl(base, r.user_id, await unsubscribeToken(SECRET(), r.user_id))),
    })));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(chunk),
    }).catch(() => null);
    if (!res?.ok) return { sent, note: `Resend said ${res?.status ?? 'nothing'}${res ? `: ${(await res.text().catch(() => '')).slice(0, 200)}` : ''}` };
    sent += chunk.length;
  }
  return { sent };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.has('u')) return unsubscribe(url);

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
  const draft = checkDraft(input?.subject, input?.body);
  if (!draft) return reply({ error: 'Subject needs 3 to 150 characters and the message 10 to 10,000.' }, 400);
  const key = env('RESEND_API_KEY');
  if (!key) return reply({ error: 'Email isn’t set up on the server (RESEND_API_KEY).' }, 500);

  let rows: Recipient[];
  if (action === 'test') {
    if (!who.user.email) return reply({ error: 'Your admin account has no email address.' }, 400);
    const first = String(who.user.user_metadata?.full_name ?? who.user.user_metadata?.name ?? '').trim().split(/\s+/)[0] || null;
    rows = [{ user_id: who.user.id, email: who.user.email, first_name: first }];
  } else {
    const { data, error } = await service.rpc('email_audience');
    if (error) return reply({ error: error.message }, 500);
    rows = (data ?? []) as Recipient[];
    if (Number(input?.expect) !== rows.length) return reply({ error: 'changed', audience: rows.length }, 409);
    const { data: recent } = await service.from('email_broadcasts').select('id').eq('test', false).eq('subject', draft.subject)
      .in('status', ['sending', 'sent']).gte('created_at', new Date(Date.now() - 86_400_000).toISOString()).limit(1);
    if (recent?.length) return reply({ error: 'This subject already went to every rider in the last day.' }, 409);
  }

  const { data: log, error: logError } = await service.from('email_broadcasts').insert({
    created_by: who.user.id, subject: draft.subject, body: draft.body, test: action === 'test', recipients: rows.length,
  }).select('id').single();
  if (logError) return reply({ error: logError.message }, 500);

  const result = await sendBatch(key, draft.subject, draft.body, rows);
  await service.from('email_broadcasts').update({
    sent: result.sent, status: result.note ? 'failed' : 'sent', note: result.note ?? null, finished_at: new Date().toISOString(),
  }).eq('id', log.id);
  if (action === 'send') {
    await service.from('admin_audit_log').insert({
      actor_id: who.user.id, action: 'email.all_riders', target_type: 'email', target_id: log.id,
      after: { subject: draft.subject, recipients: rows.length, sent: result.sent },
    });
  }
  return reply({ ok: !result.note, recipients: rows.length, sent: result.sent, note: result.note ?? null, to: action === 'test' ? rows[0].email : undefined });
});
