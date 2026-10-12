// Sends the app's push notifications: ride chat, rider status taps (Need help, EMERGENCY and
// the rest) and Ride Mode quick replies (plus a follow-up when one is cancelled), ride changes,
// new riders and roles, ride invites from a riding group and new rides from leaders a rider
// follows. A cancelled or deleted ride also gets an email to everyone who
// was on it.
//
// Called by the database triggers (see migrations 20261012000000_chat_leader_push.sql,
// 20261015000000_notification_settings.sql and 20261017000000_cancel_delete_ride.sql) with an event such as {"type":"status","id":"..."}
// and the shared secret in the x-onmylead-push-secret header. push_batch() in the database
// decides who gets what, applying each rider's notification settings and quiet hours, and
// writes the text; this function only delivers it. Ride invites and followed leaders' new rides
// come from push_batch_social instead (migration 20261017430000_riding_groups.sql). The older
// {"message_id": "..."} body is still accepted. Pro trial reminders ({"type":"trial"}, queued
// hourly by trial_reminder_batch) come from push_batch_account and email_batch_account
// (migration 20261018000000_pro_entitlements.sql). Riding group chat messages
// ({"type":"group_message"}) come from push_batch_group (migration 20261019400000_group_chat.sql).
//
// email_batch() does the same for the emails, which go out through Resend.
//
// iOS goes straight to Apple (APNs) with a token-based key, so no third-party push service is
// involved. Android (FCM) is not wired yet; those tokens are skipped.
//
// Deploy:  supabase functions deploy notify-ride-message --no-verify-jwt
// Secrets: PUSH_WEBHOOK_SECRET   random string, same value as the onmylead_push_secret Vault secret
//          APNS_KEY_ID           10-character Key ID of the APNs auth key (.p8)
//          APNS_TEAM_ID          Apple Developer Team ID
//          APNS_PRIVATE_KEY      contents of the .p8 file
//          APNS_BUNDLE_ID        com.rusoffroad.onmylead.app (default)
//          RESEND_API_KEY        Resend API key; without it no emails are sent
//          EMAIL_FROM            OnMyLead <rides@onmylead.com> (default); the domain must be verified in Resend
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SOCIAL_EVENTS = new Set(['invite', 'leader_ride']);
const ACCOUNT_EVENTS = new Set(['trial']);
const GROUP_EVENTS = new Set(['group_message']);

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Push = {
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  title: string;
  body: string;
  thread_id: string;
  data: Record<string, unknown>;
};

Deno.serve(async (req) => {
  const secret = env('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-onmylead-push-secret') !== secret) return new Response('forbidden', { status: 403 });

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  const event = typeof input?.message_id === 'string' ? { type: 'message', id: input.message_id } : input;
  if (typeof event?.type !== 'string') return new Response('event required', { status: 400 });

  const [push, email] = await Promise.all([sendPushes(event), sendEmails(event)]);
  if ('error' in push) return new Response(push.error, { status: 500 });
  return Response.json({ ...push, ...email });
});

// deno-lint-ignore no-explicit-any
async function sendPushes(event: any): Promise<{ sent: number; removed?: number; note?: string } | { error: string }> {
  const batch = ACCOUNT_EVENTS.has(event.type)
    ? 'push_batch_account'
    : SOCIAL_EVENTS.has(event.type) ? 'push_batch_social' : GROUP_EVENTS.has(event.type) ? 'push_batch_group' : 'push_batch';
  const { data: rows, error } = await db.rpc(batch, { p_event: event });
  if (error) return { error: error.message };

  const ios = ((rows ?? []) as Push[]).filter((r) => r.platform === 'ios');
  if (!ios.length) return { sent: 0 };
  const jwt = await apnsJwt();
  if (!jwt) return { sent: 0, note: 'APNs not configured' };

  const results = await Promise.all(
    ios.map((r) =>
      sendApns(
        r.token,
        {
          aps: { alert: { title: r.title, body: r.body }, sound: 'default', 'thread-id': r.thread_id },
          // expo-notifications exposes this as notification.request.content.data.
          body: r.data,
        },
        jwt,
        typeof r.data?.collapseId === 'string' ? r.data.collapseId : undefined,
      ),
    ),
  );
  const gone = ios.filter((_, i) => results[i] === 'gone').map((r) => r.token);
  if (gone.length) await db.from('push_tokens').delete().in('token', gone);
  // Status taps and quick replies: tell the sender which riders were notified (migration
  // 20261019300000_status_broadcast.sql). Never fails the request.
  if (event.type === 'status' || event.type === 'message') {
    const reached = [...new Set(ios.filter((_, i) => results[i] === 'ok').map((r) => r.user_id))];
    if (reached.length) await db.rpc('record_push_reach', { p_item: event.id, p_users: reached }).then(() => {}, () => {});
  }
  return { sent: results.filter((r) => r === 'ok').length, removed: gone.length };
}

type Email = {
  email: string;
  rider_name: string | null;
  ride_name: string;
  organizer_name: string;
  meet_local: string | null;
  deleted: boolean;
};

type AccountEmail = { email: string; rider_name: string | null; subject: string; body: string; ends_at: string | null };

/** Cancelled and deleted rides, and Pro trial reminders. Never fails the request: push matters more. */
// deno-lint-ignore no-explicit-any
async function sendEmails(event: any): Promise<{ emailed?: number; email_note?: string }> {
  const isCancel = event.type === 'ride_deleted' || (event.type === 'ride' && event.change === 'cancelled');
  const isAccount = ACCOUNT_EVENTS.has(event.type);
  if (!isCancel && !isAccount) return {};
  const key = env('RESEND_API_KEY');
  if (!key) return { emailed: 0, email_note: 'email not configured' };
  const { data, error } = await db.rpc(isAccount ? 'email_batch_account' : 'email_batch', { p_event: event });
  if (error) return { emailed: 0, email_note: error.message };
  const rows = (data ?? []) as (Email | AccountEmail)[];
  if (!rows.length) return { emailed: 0 };
  const from = env('EMAIL_FROM') || 'OnMyLead <rides@onmylead.com>';
  const build = (r: Email | AccountEmail) => (isAccount ? accountEmail(r as AccountEmail) : cancelEmail(r as Email));
  let emailed = 0;
  // Resend takes up to 100 emails per batch call.
  for (let i = 0; i < rows.length; i += 100) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(rows.slice(i, i + 100).map((r) => ({ from, to: [r.email], ...build(r) }))),
    }).catch(() => null);
    if (res?.ok) emailed += Math.min(100, rows.length - i);
    else return { emailed, email_note: `Resend said ${res?.status ?? 'nothing'}` };
  }
  return { emailed };
}

/** The email itself: plain words, dark like the app. */
export function cancelEmail(r: Email): { subject: string; text: string; html: string } {
  const when = r.meet_local ? `, planned for ${r.meet_local}` : '';
  const lines = [
    r.rider_name ? `Hi ${r.rider_name},` : 'Hi,',
    `${r.organizer_name} cancelled ${r.ride_name}${when}.${r.deleted ? ' The ride has been removed from OnMyLead.' : ''}`,
    'You don’t need to do anything. Your other rides are unchanged.',
  ];
  const footer = 'You’re getting this because you were on this ride in OnMyLead. Turn these emails off in the app under Profile, Settings, Notifications.';
  return darkEmail(`${r.ride_name} is cancelled`, `${r.ride_name} is cancelled`, lines, footer);
}

/** A Pro trial reminder. The text comes from the database (trial_notice_text). */
export function accountEmail(r: AccountEmail): { subject: string; text: string; html: string } {
  const ends = r.ends_at ? new Date(r.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
  const lines = [r.rider_name ? `Hi ${r.rider_name},` : 'Hi,', r.body];
  if (ends) lines.push(`Trial end date: ${ends}.`);
  lines.push('No payment information is on file for your trial, and nothing is charged automatically.');
  const footer = 'You’re getting this because you have an OnMyLead account. Turn these emails off in the app under Profile, Settings, Notifications.';
  return darkEmail(r.subject, r.subject, lines, footer);
}

function darkEmail(subject: string, heading: string, lines: string[], footer: string): { subject: string; text: string; html: string } {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><body style="margin:0;background:#0A1626;padding:32px 16px;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#12223A;border-radius:16px;border-top:4px solid #E5262E">
<tr><td style="padding:28px 24px;color:#F1F4F8;font-size:16px;line-height:24px">
<p style="margin:0 0 4px;color:#3B86F7;font-weight:700">OnMyLead</p>
<h1 style="margin:0 0 20px;color:#F1F4F8;font-size:24px;line-height:30px">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0 0"><a href="https://onmylead.com" style="color:#3B86F7;font-weight:700;text-decoration:none">Open OnMyLead</a></p>
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;color:#97A7BE;font-size:12px;line-height:18px">${esc(footer)}</p>
</body></html>`;
  return {
    subject,
    text: `${lines.join('\n\n')}\n\nOpen OnMyLead: https://onmylead.com\n\n${footer}\n`,
    html,
  };
}

const APNS_HOSTS = ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'];

/**
 * Production first; builds installed from Xcode use the sandbox, so a token production rejects
 * as BadDeviceToken is retried there. 'gone' means the app was removed from that phone.
 */
async function sendApns(token: string, payload: unknown, jwt: string, collapseId?: string): Promise<'ok' | 'gone' | 'failed'> {
  for (const host of APNS_HOSTS) {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': env('APNS_BUNDLE_ID') || 'com.rusoffroad.onmylead.app',
        'apns-push-type': 'alert',
        'apns-priority': '10',
        // A later push with the same id (a cancelled status) replaces this one on the lock screen.
        ...(collapseId ? { 'apns-collapse-id': collapseId.slice(0, 64) } : null),
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

let cachedJwt: { token: string; at: number } | null = null;

/**
 * ES256 provider token for APNs, built with Web Crypto. Null when the key isn't configured.
 * Apple wants the same token reused for 20 to 60 minutes, so it is kept for 40.
 */
async function apnsJwt(): Promise<string | null> {
  if (cachedJwt && Date.now() - cachedJwt.at < 40 * 60_000) return cachedJwt.token;
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
  cachedJwt = { token: `${unsigned}.${b64url(sig)}`, at: Date.now() };
  return cachedJwt.token;
}
