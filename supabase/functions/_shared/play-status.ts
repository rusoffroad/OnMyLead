// Turns Google Play's answer about a subscription (purchases.subscriptionsv2.get) into one row of
// play_subscriptions and the order it was charged for, and reads Real-time Developer Notifications.
//
// Pure code with no imports, so the edge functions (Deno) and the app's vitest suite
// (app/src/core/__tests__/play-status.test.ts) run the same file. The functions only call this
// with what the Google Play Developer API itself returned; a notification's own contents are never
// trusted beyond the purchase token it names.

export const PLAY_PRODUCT_IDS = ['com.rusoffroad.onmylead.pro.monthly', 'com.rusoffroad.onmylead.pro.annual'];
export const PLAY_PACKAGE_NAME = 'com.rusoffroad.onmylead.app';

export type PlayStatus = 'active' | 'grace' | 'billing_retry' | 'paused' | 'pending' | 'expired' | 'revoked' | 'refunded';

/** Google's Money: whole units as a string, plus nanos (billionths). */
export type PlayMoney = { currencyCode?: string; units?: string | number; nanos?: number };

/** The fields of SubscriptionPurchaseLineItem this code reads. */
export type PlayLineItem = {
  productId?: string;
  expiryTime?: string;
  autoRenewingPlan?: { autoRenewEnabled?: boolean; recurringPrice?: PlayMoney };
  offerDetails?: { basePlanId?: string; offerId?: string; offerTags?: string[] };
  latestSuccessfulOrderId?: string;
  offerPhase?: { freeTrial?: object; introductoryPrice?: object; basePrice?: object; prorationPeriod?: object };
};

/** The fields of SubscriptionPurchaseV2 this code reads. */
export type PlaySubscription = {
  subscriptionState?: string;
  startTime?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  lineItems?: PlayLineItem[];
  testPurchase?: object;
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  signupPromotion?: { oneTimeCode?: object; vanityCode?: { promotionCode?: string } };
  regionCode?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * While Google is retrying a payment in the grace period the rider keeps Pro. Google sends
 * SUBSCRIPTION_ON_HOLD when the grace period ends, and every check asks Google again, so a short
 * window past the line item's end is enough: Play's shortest grace period is 3 days.
 */
export const GRACE_FALLBACK_MS = 3 * DAY_MS;

const ms = (t: string | undefined | null) => {
  const v = t ? Date.parse(t) : NaN;
  return Number.isFinite(v) ? v : null;
};
const iso = (v: number | null) => (v === null ? null : new Date(v).toISOString());

/** The line item for one of our products, the one that runs longest if there are several. */
export function proLineItem(sub: PlaySubscription): PlayLineItem | null {
  const ours = (sub.lineItems ?? []).filter((l) => l.productId && PLAY_PRODUCT_IDS.includes(l.productId));
  if (!ours.length) return null;
  return ours.reduce((a, b) => ((ms(b.expiryTime) ?? 0) > (ms(a.expiryTime) ?? 0) ? b : a));
}

/** Google's subscriptionState as one of our statuses. */
export function playStatus(sub: PlaySubscription, now: number): PlayStatus {
  const expiry = ms(proLineItem(sub)?.expiryTime);
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'active';
    // Cancelled means auto-renew is off: Pro runs to the end of the period it was paid for.
    case 'SUBSCRIPTION_STATE_CANCELED':
      return expiry !== null && expiry > now ? 'active' : 'expired';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'grace';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'billing_retry';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'pending';
    case 'SUBSCRIPTION_STATE_EXPIRED':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      return 'expired';
    default:
      return expiry !== null && expiry > now ? 'active' : 'expired';
  }
}

/** Money in thousandths (4.99 is 4990), the unit app_store_subscriptions uses. */
export function moneyMilli(m: PlayMoney | undefined | null): number | null {
  if (!m || (m.units === undefined && m.nanos === undefined)) return null;
  const units = Number(m.units ?? 0);
  if (!Number.isFinite(units)) return null;
  return units * 1000 + Math.round((m.nanos ?? 0) / 1_000_000);
}

/** The code a rider typed when a Google Play promo code started this subscription. */
export function promoCode(sub: PlaySubscription): string | null {
  const p = sub.signupPromotion;
  if (!p) return null;
  return p.vanityCode?.promotionCode || (p.oneTimeCode ? 'One-Time Code' : null);
}

export type PlayRow = {
  purchase_token: string;
  product_id: string;
  base_plan_id: string | null;
  status: PlayStatus;
  expires_at: string | null;
  grace_until: string | null;
  auto_renew: boolean | null;
  offer_type: number | null;
  offer_id: string | null;
  price_milli: number | null;
  currency: string | null;
  environment: 'Sandbox' | 'Production';
  linked_purchase_token: string | null;
  latest_order_id: string | null;
  acknowledged: boolean;
  started_at: string | null;
};

/** The play_subscriptions columns Google decides (the owner is set by play_save_subscription). */
export function playRow(purchaseToken: string, sub: PlaySubscription, now: number): PlayRow {
  const item = proLineItem(sub);
  if (!item?.productId) throw new Error('not an OnMyLead Pro subscription');
  const status = playStatus(sub, now);
  const expiry = ms(item.expiryTime);
  const promo = promoCode(sub);
  return {
    purchase_token: purchaseToken,
    product_id: item.productId,
    base_plan_id: item.offerDetails?.basePlanId ?? null,
    status,
    expires_at: iso(expiry),
    grace_until: status === 'grace' ? iso(Math.max(expiry ?? 0, now + GRACE_FALLBACK_MS)) : null,
    auto_renew: item.autoRenewingPlan ? item.autoRenewingPlan.autoRenewEnabled === true : null,
    // 3 is Apple's number for an offer code; Google Play promo codes are the same thing.
    offer_type: promo ? 3 : item.offerDetails?.offerId ? 1 : null,
    offer_id: promo ?? item.offerDetails?.offerId ?? null,
    price_milli: moneyMilli(item.autoRenewingPlan?.recurringPrice),
    currency: item.autoRenewingPlan?.recurringPrice?.currencyCode ?? null,
    environment: sub.testPurchase ? 'Sandbox' : 'Production',
    linked_purchase_token: sub.linkedPurchaseToken ?? null,
    latest_order_id: item.latestSuccessfulOrderId ?? sub.latestOrderId ?? null,
    acknowledged: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    started_at: sub.startTime ?? null,
  };
}

export type PlayOrder = { order_id: string; kind: 'purchase' | 'renewal'; price_milli: number; currency: string; charged_at: string };

/**
 * The latest order Google charged, for revenue. Renewal orders are the first order's id with
 * "..0", "..1" and so on after it. A free trial phase is charged nothing. Pending and on-hold
 * subscriptions have no new charge to count.
 */
export function playOrder(sub: PlaySubscription, now: number): PlayOrder | null {
  const item = proLineItem(sub);
  const orderId = item?.latestSuccessfulOrderId ?? sub.latestOrderId;
  if (!item || !orderId) return null;
  if (sub.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') return null;
  const kind = /\.\.\d+$/.test(orderId) ? 'renewal' : 'purchase';
  const free = !!item.offerPhase?.freeTrial;
  return {
    order_id: orderId,
    kind,
    price_milli: free ? 0 : moneyMilli(item.autoRenewingPlan?.recurringPrice) ?? 0,
    currency: item.autoRenewingPlan?.recurringPrice?.currencyCode ?? 'USD',
    charged_at: new Date(kind === 'purchase' ? ms(sub.startTime) ?? now : now).toISOString(),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The app sets obfuscatedAccountId to the Supabase user id; anything else is not a user link. */
export function accountUserId(sub: PlaySubscription): string | null {
  const id = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

/** Which Play environments this server accepts, from PLAY_ENVIRONMENT ("Sandbox,Production"). */
export function allowedPlayEnvironments(setting: string | null | undefined): Set<'Sandbox' | 'Production'> {
  const names = (setting ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = new Set<'Sandbox' | 'Production'>();
  for (const n of names.length ? names : ['sandbox', 'production']) {
    if (n === 'sandbox') out.add('Sandbox');
    if (n === 'production') out.add('Production');
  }
  return out;
}

/** Google's subscription notification types, by number. */
export const PLAY_NOTIFICATION_TYPES: Record<number, string> = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
  17: 'SUBSCRIPTION_ITEMS_CHANGED',
  18: 'SUBSCRIPTION_CANCELLATION_SCHEDULED',
  19: 'SUBSCRIPTION_PRICE_CHANGE_UPDATED',
  20: 'SUBSCRIPTION_PENDING_PURCHASE_CANCELED',
  22: 'SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED',
};

export type Rtdn =
  | { kind: 'subscription'; messageId: string; packageName: string; eventTime: number | null; notificationType: number; type: string; purchaseToken: string; productId: string | null }
  | { kind: 'voided'; messageId: string; packageName: string; eventTime: number | null; purchaseToken: string; orderId: string; productType: number | null; refundType: number | null }
  | { kind: 'test' | 'other'; messageId: string; packageName: string; eventTime: number | null };

function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** A Pub/Sub push body ({ message: { data, messageId } }) as a developer notification, or null. */
export function parseRtdn(body: unknown): Rtdn | null {
  // deno-lint-ignore no-explicit-any
  const message = (body as any)?.message;
  const messageId = typeof message?.messageId === 'string' ? message.messageId : typeof message?.message_id === 'string' ? message.message_id : null;
  if (!messageId || typeof message?.data !== 'string') return null;
  // deno-lint-ignore no-explicit-any
  let n: any;
  try {
    n = JSON.parse(decodeBase64(message.data));
  } catch {
    return null;
  }
  if (!n || typeof n !== 'object' || typeof n.packageName !== 'string') return null;
  const base = { messageId, packageName: n.packageName as string, eventTime: Number(n.eventTimeMillis) || null };
  const s = n.subscriptionNotification;
  if (s && typeof s.purchaseToken === 'string') {
    const notificationType = Number(s.notificationType);
    return {
      ...base, kind: 'subscription', notificationType,
      type: PLAY_NOTIFICATION_TYPES[notificationType] ?? `SUBSCRIPTION_${notificationType}`,
      purchaseToken: s.purchaseToken, productId: typeof s.subscriptionId === 'string' ? s.subscriptionId : null,
    };
  }
  const v = n.voidedPurchaseNotification;
  if (v && typeof v.purchaseToken === 'string' && typeof v.orderId === 'string') {
    return {
      ...base, kind: 'voided', purchaseToken: v.purchaseToken, orderId: v.orderId,
      productType: Number(v.productType) || null, refundType: Number(v.refundType) || null,
    };
  }
  return { ...base, kind: n.testNotification ? 'test' : 'other' };
}
