// Turns Apple's signed subscription data into one row of app_store_subscriptions.
//
// Pure code with no imports, so the edge functions (Deno) and the app's vitest suite
// (app/src/core/__tests__/appstore-status.test.ts) run the same file. The functions only call
// this after Apple's signature on every input has been verified.

export const PRO_PRODUCT_IDS = ['com.rusoffroad.onmylead.pro.monthly', 'com.rusoffroad.onmylead.pro.annual'];

export type SubscriptionStatus = 'active' | 'grace' | 'billing_retry' | 'expired' | 'revoked' | 'refunded';

/** The fields of Apple's JWSTransactionDecodedPayload this code reads (dates are ms since epoch). */
export type AppleTransaction = {
  originalTransactionId?: string;
  transactionId?: string;
  productId?: string;
  bundleId?: string;
  type?: string;
  appAccountToken?: string;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  offerType?: number;
  offerIdentifier?: string;
  price?: number; // milliunits, e.g. 4990 for 4.99
  currency?: string;
  environment?: string;
  signedDate?: number;
};

/** The fields of Apple's JWSRenewalInfoDecodedPayload this code reads. */
export type AppleRenewalInfo = {
  autoRenewStatus?: number; // 1 = will renew
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  signedDate?: number;
};

/**
 * Apple's own status codes from the App Store Server API's Get All Subscription Statuses:
 * 1 active, 2 expired, 3 billing retry, 4 billing grace period, 5 revoked (Family Sharing).
 */
export type AppleStatusCode = 1 | 2 | 3 | 4 | 5;

export type StatusInput = {
  transaction: AppleTransaction;
  renewal?: AppleRenewalInfo | null;
  appleStatus?: number | null;
  notificationType?: string | null;
  now: number;
};

export function subscriptionStatus({ transaction: t, renewal, appleStatus, notificationType, now }: StatusInput): SubscriptionStatus {
  // A revoked transaction is either refunded or pulled from Family Sharing; both end access.
  if (t.revocationDate) return notificationType === 'REVOKE' || appleStatus === 5 ? 'revoked' : 'refunded';
  switch (appleStatus) {
    case 1: return 'active';
    case 2: return 'expired';
    case 3: return 'billing_retry';
    case 4: return 'grace';
    case 5: return 'revoked';
  }
  if (notificationType === 'REVOKE') return 'revoked';
  if (notificationType === 'REFUND') return 'refunded';
  if (t.expiresDate && t.expiresDate > now) return 'active';
  if (renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > now) return 'grace';
  if (renewal?.isInBillingRetryPeriod) return 'billing_retry';
  return 'expired';
}

export type SubscriptionRow = {
  original_transaction_id: string;
  product_id: string;
  status: SubscriptionStatus;
  expires_at: string | null;
  grace_until: string | null;
  auto_renew: boolean | null;
  offer_type: number | null;
  offer_id: string | null;
  price_milli: number | null;
  currency: string | null;
  environment: string;
  last_signed_at: string | null;
  updated_at: string;
};

const iso = (ms: number | undefined | null) => (ms ? new Date(ms).toISOString() : null);

/** The app_store_subscriptions columns Apple decides (user_id is set separately). */
export function subscriptionRow(input: StatusInput): SubscriptionRow {
  const t = input.transaction;
  const r = input.renewal ?? null;
  if (!t.originalTransactionId || !t.productId || !t.environment) throw new Error('transaction is missing required fields');
  const signed = Math.max(t.signedDate ?? 0, r?.signedDate ?? 0);
  return {
    original_transaction_id: t.originalTransactionId,
    product_id: t.productId,
    status: subscriptionStatus(input),
    expires_at: iso(t.expiresDate),
    grace_until: iso(r?.gracePeriodExpiresDate),
    auto_renew: r ? r.autoRenewStatus === 1 : null,
    offer_type: t.offerType ?? null,
    offer_id: t.offerIdentifier ?? null,
    price_milli: typeof t.price === 'number' ? t.price : null,
    currency: t.currency ?? null,
    environment: t.environment,
    last_signed_at: iso(signed || null),
    updated_at: new Date(input.now).toISOString(),
  };
}

/** Which Apple environments this server accepts, from APPSTORE_ENVIRONMENT ("Sandbox,Production"). */
export function allowedEnvironments(setting: string | null | undefined): Set<string> {
  const names = (setting ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = new Set<string>();
  for (const n of names.length ? names : ['sandbox', 'production']) {
    if (n === 'sandbox') out.add('Sandbox');
    if (n === 'production') out.add('Production');
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The app sets appAccountToken to the Supabase user id; anything else is not a user link. */
export function accountTokenUserId(token: string | null | undefined): string | null {
  return token && UUID.test(token) ? token.toLowerCase() : null;
}

/** Reads a JWS payload without checking it, only to pick which verifier to use. */
export function peekJws(jws: string): Record<string, unknown> | null {
  try {
    const part = jws.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}
