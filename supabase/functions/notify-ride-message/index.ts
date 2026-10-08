// Sends a push notification for each new ride chat message.
//
// Called by the ride_messages_notify database trigger (see migration
// 20261012000000_chat_leader_push.sql) with {"message_id": "..."} and the shared secret in
// the x-onmylead-push-secret header. Recipients come from ride_message_recipients(): everyone
// joined on the ride except the sender, or only the leader for leader-only messages.
//
// iOS goes straight to Apple (APNs) with a token-based key, so no third-party push service is
// involved. Android (FCM) is not wired yet; those tokens are skipped.
//
// Deploy:  supabase functions deploy notify-ride-message --no-verify-jwt
// Secrets: PUSH_WEBHOOK_SECRET   random string, same value as the onmylead_push_secret Vault secret
//          APNS_KEY_ID           10-character Key ID of the APNs auth key (.p8)
//          APNS_TEAM_ID          Apple Developer Team ID
//          APNS_PRIVATE_KEY      contents of the .p8 file
//          APNS_BUNDLE_ID        com.rusoffroad.onmylead (default)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Recipient = { user_id: string; token: string; platform: 'ios' | 'android' };

Deno.serve(async (req) => {
  const secret = env('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-onmylead-push-secret') !== secret) return new Response('forbidden', { status: 403 });

  const { message_id } = await req.json().catch(() => ({}));
  if (typeof message_id !== 'string') return new Response('message_id required', { status: 400 });

  const { data: msg, error } = await db
    .from('ride_messages')
    .select('id, ride_id, user_id, kind, audience, body, rides(name, invite_code), profiles(display_name)')
    .eq('id', message_id)
    .maybeSingle();
  if (error || !msg) return new Response('message not found', { status: 404 });

  const { data: recipients, error: rErr } = await db.rpc('ride_message_recipients', { p_message: message_id });
  if (rErr) return new Response(rErr.message, { status: 500 });

  // deno-lint-ignore no-explicit-any
  const ride = (msg as any).rides as { name: string; invite_code: string } | null;
  // deno-lint-ignore no-explicit-any
  const who = ((msg as any).profiles?.display_name as string | undefined)?.trim() || 'A rider';
  const what = msg.kind === 'announcement' ? `Announcement from ${who}` : msg.audience === 'leader' ? `${who} (to you, the leader)` : who;
  const title = ride?.name ? `${what} · ${ride.name}` : what;

  const payload = {
    aps: { alert: { title, body: msg.body }, sound: 'default', 'thread-id': msg.ride_id },
    // expo-notifications exposes this as notification.request.content.data.
    body: { rideId: msg.ride_id, inviteCode: ride?.invite_code ?? null, messageId: msg.id },
  };

  const ios = ((recipients ?? []) as Recipient[]).filter((r) => r.platform === 'ios');
  if (!ios.length) return Response.json({ sent: 0 });
  const jwt = await apnsJwt();
  if (!jwt) return Response.json({ sent: 0, note: 'APNs not configured' });

  const results = await Promise.all(ios.map((r) => sendApns(r.token, payload, jwt)));
  const gone = ios.filter((_, i) => results[i] === 'gone').map((r) => r.token);
  if (gone.length) await db.from('push_tokens').delete().in('token', gone);
  return Response.json({ sent: results.filter((r) => r === 'ok').length, removed: gone.length });
});

const APNS_HOSTS = ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'];

/**
 * Production first; builds installed from Xcode use the sandbox, so a token production rejects
 * as BadDeviceToken is retried there. 'gone' means the app was removed from that phone.
 */
async function sendApns(token: string, payload: unknown, jwt: string): Promise<'ok' | 'gone' | 'failed'> {
  for (const host of APNS_HOSTS) {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': env('APNS_BUNDLE_ID') || 'com.rusoffroad.onmylead',
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
