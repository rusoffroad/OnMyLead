// Android push through Firebase Cloud Messaging (HTTP v1 API), used by notify-ride-message.
//
// Secret (supabase secrets set ...):
//   FCM_SERVICE_ACCOUNT   the whole JSON key of a Firebase service account that may send messages
//                         (Firebase console > Project settings > Service accounts > Generate new
//                         private key). Its project_id picks the Firebase project. Never commit it.
// Without it Android tokens are skipped, as before.
//
// Messages are data-only with high priority, the format expo-notifications reads on Android:
// title, message, body (the app's tap data as JSON), channelId and tag (a later push with the same
// tag replaces this one, like apns-collapse-id). The app shows them itself, so a tap reaches the
// same handler as on iPhone.

export type ServiceAccount = { client_email: string; private_key: string; project_id: string };

export type FcmPush = {
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
  tag?: string;
};

/** The Android notification channel for a push type. The app creates these channels (lib/push.ts). */
export function channelFor(type: unknown): string {
  if (type === 'status' || type === 'cancelled') return 'ride-alerts';
  if (type === 'message' || type === 'group_message') return 'ride-chat';
  return 'ride-updates';
}

/** The FCM v1 request body for one Android push. FCM data values must all be strings. */
export function fcmMessage(p: FcmPush) {
  const data: Record<string, string> = {
    title: p.title,
    message: p.body,
    body: JSON.stringify(p.data ?? {}),
    channelId: p.channelId,
  };
  if (p.tag) data.tag = p.tag.slice(0, 64);
  return { message: { token: p.token, data, android: { priority: 'HIGH' } } };
}

/** Parses FCM_SERVICE_ACCOUNT. Null when it is missing or incomplete. */
export function readServiceAccount(json: string): ServiceAccount | null {
  if (!json.trim()) return null;
  try {
    const sa = JSON.parse(json);
    if (typeof sa?.client_email !== 'string' || typeof sa?.private_key !== 'string' || typeof sa?.project_id !== 'string') return null;
    return { client_email: sa.client_email, private_key: sa.private_key, project_id: sa.project_id };
  } catch {
    return null;
  }
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/** The signed RS256 assertion Google's token endpoint trades for an access token. */
export async function serviceAccountJwt(sa: ServiceAccount, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowS,
    exp: nowS + 3600,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

let cached: { token: string; until: number } | null = null;

/** An OAuth access token for FCM, reused until five minutes before it expires. */
export async function fcmAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (cached && Date.now() < cached.until) return cached.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await serviceAccountJwt(sa) }).toString(),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  cached = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 300) * 1000 };
  return j.access_token;
}

/** What an FCM error means for the token: 'gone' when the app was removed or the token is dead. */
export function fcmOutcome(status: number, error: unknown): 'ok' | 'gone' | 'failed' {
  if (status >= 200 && status < 300) return 'ok';
  // deno-lint-ignore no-explicit-any
  const e = error as any;
  const codes: unknown[] = [e?.error?.status, ...((e?.error?.details ?? []) as { errorCode?: unknown }[]).map((d) => d?.errorCode)];
  if (status === 404 || codes.includes('UNREGISTERED')) return 'gone';
  // A malformed token: retrying never helps.
  if (status === 400 && codes.includes('INVALID_ARGUMENT') && /token/i.test(String(e?.error?.message ?? ''))) return 'gone';
  return 'failed';
}

/** Sends one Android push. */
export async function sendFcm(sa: ServiceAccount, accessToken: string, p: FcmPush): Promise<'ok' | 'gone' | 'failed'> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(fcmMessage(p)),
  }).catch(() => null);
  if (!res) return 'failed';
  return fcmOutcome(res.status, res.ok ? null : await res.json().catch(() => ({})));
}
