// Shared App Store code for appstore-verify and appstore-notifications: Apple signature checks,
// the optional App Store Server API lookup, and writing app_store_subscriptions.
//
// Secrets (supabase secrets set ...):
//   APPSTORE_BUNDLE_ID          com.rusoffroad.onmylead.app (default)
//   APPSTORE_APP_APPLE_ID       the app's numeric Apple ID from App Store Connect (App Information).
//                               Required to accept Production purchases; Sandbox works without it.
//   APPSTORE_ENVIRONMENT        which Apple environments to accept: "Sandbox,Production" (default),
//                               or "Sandbox" to accept test purchases only.
//   APPSTORE_IAP_KEY_ID         optional In-App Purchase key (App Store Connect > Users and Access >
//   APPSTORE_IAP_ISSUER_ID      Integrations > In-App Purchase). With it the functions ask Apple for
//   APPSTORE_IAP_PRIVATE_KEY    the live status (grace period, billing retry) instead of reading it
//                               from the transaction alone. Contents of the .p8 file.
// Apple's root certificates are public and built in (apple-root-certs.ts), so they need no secret.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { certificate, JwsError, verifyAppleJws } from './apple-jws.ts';
import { APPLE_ROOT_CA_G2, APPLE_ROOT_CA_G3 } from './apple-root-certs.ts';
import {
  accountTokenUserId,
  allowedEnvironments,
  type AppleRenewalInfo,
  type AppleTransaction,
  type SubscriptionRow,
} from './appstore-status.ts';

export { JwsError };

const env = (k: string) => Deno.env.get(k) ?? '';

export const BUNDLE_ID = env('APPSTORE_BUNDLE_ID') || 'com.rusoffroad.onmylead.app';
export const ENVIRONMENTS = allowedEnvironments(env('APPSTORE_ENVIRONMENT'));
const APP_APPLE_ID = Number(env('APPSTORE_APP_APPLE_ID')) || undefined;

export const db: SupabaseClient = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

/** A client acting as the caller, so database functions see their auth.uid(). */
export const asUser = (jwt: string) =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

const roots = [APPLE_ROOT_CA_G3, APPLE_ROOT_CA_G2].map((b64) => certificate(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));

export type AppleEnvironment = 'Sandbox' | 'Production';

/** Apple's V2 notification, after its signature has been checked (only the fields used here). */
export type AppleNotification = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    appAppleId?: number;
    environment?: string;
    status?: number;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
  summary?: { bundleId?: string; appAppleId?: number; environment?: string };
};

export type Verifier = {
  environment: AppleEnvironment;
  transaction(jws: string): Promise<AppleTransaction>;
  renewal(jws: string): Promise<AppleRenewalInfo>;
  notification(jws: string): Promise<AppleNotification>;
};

/** Signature checks for one Apple environment, or null when this server doesn't accept it. */
export function verifierFor(environment: unknown): Verifier | null {
  if (environment !== 'Sandbox' && environment !== 'Production') return null;
  if (!ENVIRONMENTS.has(environment)) return null;
  if (environment === 'Production' && !APP_APPLE_ID) return null;
  return {
    environment,
    async transaction(jws) {
      const t = (await verifyAppleJws(jws, roots)) as AppleTransaction;
      if (t.bundleId !== BUNDLE_ID) throw new JwsError('another app');
      if (t.environment !== environment) throw new JwsError('wrong environment');
      return t;
    },
    async renewal(jws) {
      const r = (await verifyAppleJws(jws, roots)) as AppleRenewalInfo & { environment?: string };
      if (r.environment !== environment) throw new JwsError('wrong environment');
      return r;
    },
    async notification(jws) {
      const n = (await verifyAppleJws(jws, roots)) as AppleNotification;
      const about = n.data ?? n.summary;
      if (about?.bundleId !== BUNDLE_ID) throw new JwsError('another app');
      if (environment === 'Production' && about?.appAppleId !== APP_APPLE_ID) throw new JwsError('another app');
      if (about?.environment !== environment) throw new JwsError('wrong environment');
      return n;
    },
  };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A short-lived token for the App Store Server API, signed with the In-App Purchase key. */
async function apiToken(keyId: string, issuerId: string, p8: string): Promise<string> {
  const der = Uint8Array.from(atob(p8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const input = `${enc({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${enc({ iss: issuerId, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: BUNDLE_ID })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Apple's current word on a subscription, from the App Store Server API (Get All Subscription
 * Statuses), verified like any other signed data. Null when no In-App Purchase key is configured
 * or Apple can't be reached, in which case the caller uses the transaction it already verified.
 */
export async function liveStatus(
  originalTransactionId: string,
  verifier: Verifier,
): Promise<{ transaction: AppleTransaction; renewal: AppleRenewalInfo | null; appleStatus: number } | null> {
  const keyId = env('APPSTORE_IAP_KEY_ID');
  const issuerId = env('APPSTORE_IAP_ISSUER_ID');
  const p8 = env('APPSTORE_IAP_PRIVATE_KEY');
  if (!keyId || !issuerId || !p8) return null;
  const host = verifier.environment === 'Production' ? 'api.storekit.itunes.apple.com' : 'api.storekit-sandbox.itunes.apple.com';
  try {
    const res = await fetch(`https://${host}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`, {
      headers: { Authorization: `Bearer ${await apiToken(keyId, issuerId, p8)}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`App Store Server API ${res.status}`);
    const body = await res.json();
    for (const group of body?.data ?? []) {
      for (const last of group?.lastTransactions ?? []) {
        if (last?.originalTransactionId !== originalTransactionId || !last.signedTransactionInfo) continue;
        const transaction = await verifier.transaction(last.signedTransactionInfo);
        const renewal = last.signedRenewalInfo ? await verifier.renewal(last.signedRenewalInfo) : null;
        return { transaction, renewal, appleStatus: Number(last.status) };
      }
    }
  } catch (e) {
    console.error('App Store Server API lookup failed', e instanceof Error ? e.message : e);
  }
  return null;
}

/** True when the id belongs to an OnMyLead account. */
async function isProfile(id: string): Promise<boolean> {
  const { data } = await db.from('profiles').select('id').eq('id', id).maybeSingle();
  return !!data;
}

/**
 * Writes Apple's state for one subscription without letting an older signed message replace a
 * newer one (Apple delivers notifications out of order and retries them). `owner` links the
 * subscription to an account: the app passes the signed-in rider; a notification passes the
 * transaction's appAccountToken, which only fills an empty link.
 */
export async function saveSubscription(
  row: SubscriptionRow,
  owner: { userId: string } | { accountToken: string | undefined },
): Promise<void> {
  const id = row.original_transaction_id;
  const { data: existing, error: readError } = await db
    .from('app_store_subscriptions')
    .select('user_id')
    .eq('original_transaction_id', id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  let userId: string | undefined;
  if ('userId' in owner) userId = owner.userId;
  else if (!existing?.user_id) {
    const fromToken = accountTokenUserId(owner.accountToken);
    if (fromToken && (await isProfile(fromToken))) userId = fromToken;
  }

  if (!existing) {
    const { error } = await db.from('app_store_subscriptions').insert({ ...row, user_id: userId ?? null });
    if (!error) return;
    if (error.code !== '23505') throw new Error(error.message);
    // Another request stored it first; fall through to the guarded update.
  }

  if (userId && userId !== existing?.user_id) {
    const { error } = await db.from('app_store_subscriptions').update({ user_id: userId }).eq('original_transaction_id', id);
    if (error) throw new Error(error.message);
  }
  let update = db.from('app_store_subscriptions').update(row).eq('original_transaction_id', id);
  if (row.last_signed_at) update = update.or(`last_signed_at.is.null,last_signed_at.lte."${row.last_signed_at}"`);
  const { error } = await update;
  if (error) throw new Error(error.message);
}
