// Google Play Developer API for play-verify and play-notifications: a service-account token,
// reading one subscription purchase, and acknowledging it.
//
// Secrets (supabase secrets set ...; values never go in the repository):
//   PLAY_SERVICE_ACCOUNT_JSON  the Google Cloud service account's JSON key. The account is invited
//                              in Play Console (Users and permissions) with "View financial data"
//                              and "Manage orders and subscriptions" for OnMyLead.
//   PLAY_RTDN_TOKEN            a long random string; the Pub/Sub push subscription's URL ends in
//                              ?token=<it>, so only Google's push reaches play-notifications.
//   PLAY_PACKAGE_NAME          optional, default com.rusoffroad.onmylead.app
//   PLAY_ENVIRONMENT           optional, "Sandbox,Production" (default both); Sandbox is purchases
//                              by Play license testers.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { PLAY_PACKAGE_NAME, allowedPlayEnvironments, type PlayOrder, type PlayRow, type PlaySubscription } from './play-status.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

export const PACKAGE_NAME = env('PLAY_PACKAGE_NAME') || PLAY_PACKAGE_NAME;
export const PLAY_ENVIRONMENTS = allowedPlayEnvironments(env('PLAY_ENVIRONMENT'));

export const db: SupabaseClient = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

/** A client that acts as the signed-in rider, for my_entitlements(). */
export const asUser = (jwt: string) =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

/** Google said the token doesn't exist (wrong app, a made-up token, or one from another project). */
export class PlayNotFound extends Error {}

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function serviceAccount(): ServiceAccount | null {
  try {
    const sa = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON'));
    return sa?.client_email && sa?.private_key ? sa : null;
  } catch {
    return null;
  }
}

export const playConfigured = () => serviceAccount() !== null;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

let cached: { token: string; until: number } | null = null;

/** An OAuth access token for the Android Publisher API, kept until a minute before it ends. */
async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not set');
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: tokenUri,
    iat,
    exp: iat + 3600,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(sa.private_key), new TextEncoder().encode(unsigned)));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.access_token !== 'string') throw new Error(`Google sign-in failed (${res.status})`);
  cached = { token: body.access_token, until: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000 };
  return cached.token;
}

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** Google's current state of one subscription purchase (purchases.subscriptionsv2.get). */
export async function getSubscription(purchaseToken: string): Promise<PlaySubscription> {
  const res = await fetch(`${API}/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 410) throw new PlayNotFound(`Google Play has no such purchase (${res.status})`);
  if (!res.ok) throw new Error(`Google Play API ${res.status}`);
  return (await res.json()) as PlaySubscription;
}

/**
 * Acknowledges a new subscription so Google doesn't refund it after 3 days. The app also
 * acknowledges when it finishes the purchase; whichever is first wins and the other is harmless.
 */
export async function acknowledge(productId: string, purchaseToken: string): Promise<void> {
  const res = await fetch(
    `${API}/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    },
  );
  // 400 is "already acknowledged" (or not acknowledgeable any more); neither needs a retry.
  if (!res.ok && res.status !== 400) throw new Error(`Google Play acknowledge ${res.status}`);
}

/** Stores Google's state (play_save_subscription in migration 20261027000000) and returns the owner. */
export async function savePlay(row: PlayRow, user: string | null, fromApp: boolean, order: PlayOrder | null): Promise<string | null> {
  const { data, error } = await db.rpc('play_save_subscription', { p_row: row, p_user: user, p_from_app: fromApp, p_order: order });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
