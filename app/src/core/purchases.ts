// Pure rules behind lib/purchases.ts (StoreKit 2 on Apple devices and Google Play Billing on Android,
// both through expo-iap), kept here so vitest covers them.

import type { Entitlements, Store, StoreSubscription } from './entitlements';
import { PRICES } from './pro';

export const PRODUCTS = {
  monthly: 'com.rusoffroad.onmylead.pro.monthly',
  annual: 'com.rusoffroad.onmylead.pro.annual',
} as const;

export const PRODUCT_IDS: string[] = [PRODUCTS.monthly, PRODUCTS.annual];

/** The Android app's package name, for Google Play's subscription page. */
export const ANDROID_PACKAGE = 'com.rusoffroad.onmylead.app';

export type { Store };

export type ProProduct = { id: string; displayPrice: string; period: 'month' | 'year' };

export type BuyResult = {
  ok: boolean;
  /** ios_only: this device has no store (the website). other_store: Pro is billed by the other store. */
  reason?: 'cancelled' | 'pending' | 'failed' | 'ios_only' | 'other_store';
  /**
   * Set when ok: true once the server has checked the purchase with the store and stored it.
   * false means the store took the payment but the server couldn't confirm it yet (offline, or Pro
   * not switched on yet); the phone keeps the transaction and confirms it on a later launch.
   */
  verified?: boolean;
};

export const periodOf = (id: string): 'month' | 'year' => (id === PRODUCTS.annual ? 'year' : 'month');

/** Monthly first, then annual; anything that isn't a Pro product is dropped. */
export function proProducts(items: { id: string; displayPrice: string }[]): ProProduct[] {
  return PRODUCT_IDS.flatMap((id) => {
    const p = items.find((i) => i.id === id);
    return p ? [{ id, displayPrice: p.displayPrice, period: periodOf(id) }] : [];
  });
}

/** What an expo-iap error code (StoreKit or Play Billing) means for the buyer. */
export function buyFailure(code: string | undefined): BuyResult {
  if (code === 'user-cancelled') return { ok: false, reason: 'cancelled' };
  // Ask to Buy, a bank check, or a Google Play pending payment (cash at a store): the store
  // finishes it later and the purchase arrives on its own.
  if (code === 'pending' || code === 'deferred-payment') return { ok: false, reason: 'pending' };
  return { ok: false, reason: 'failed' };
}

/**
 * What to do with a transaction after asking appstore-verify or play-verify about it.
 * 'verified': stored on the server, finish it with Apple.
 * 'finish':   the server will never accept it (not a Pro product), so finish it anyway.
 * 'keep':     leave it unfinished so the store hands it back on the next launch (offline, signed
 *             out, function not deployed yet, the store's check timed out, and so on). Google
 *             refunds a purchase nobody acknowledges within 3 days; play-verify acknowledges it
 *             as soon as it has stored it.
 */
export function verifyDisposition(httpStatus: number, error: string | undefined): 'verified' | 'finish' | 'keep' {
  if (httpStatus === 200) return 'verified';
  if (httpStatus === 400 && error === 'unknown_product') return 'finish';
  return 'keep';
}

// ---- Two stores, one Pro ----

export const STORE_NAMES: Record<Store, string> = { apple: 'the App Store', google: 'Google Play' };
/** Where each store's subscription settings open on any device. */
export const MANAGE_URLS: Record<Store, string> = {
  apple: 'https://apps.apple.com/account/subscriptions',
  google: `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`,
};

/** The store this device buys through: Apple devices the App Store, Android Google Play, the website none. */
export function deviceStore(os: string): Store | null {
  return os === 'ios' ? 'apple' : os === 'android' ? 'google' : null;
}

/**
 * Why this device must not sell Pro to this rider, or null when it may: a subscription that hasn't
 * ended on the other store (running, in a payment problem, or paused) would bill them twice for
 * the same Pro. A running one on this store is handled by Manage Subscription instead.
 */
export function otherStoreBlock(ent: Entitlements, here: Store): { store: Store; message: string } | null {
  const other = ent.openSubscriptions.find((s) => s.store !== here);
  if (!other) return null;
  const name = STORE_NAMES[other.store];
  const device = other.store === 'apple' ? 'iPhone or iPad' : 'Android phone or tablet';
  if (other.status === 'active' || other.status === 'grace') {
    return {
      store: other.store,
      message: `You already have OnMyLead Pro through ${name}, and it works here too. There’s nothing to buy. To move it to ${STORE_NAMES[here]}, cancel it on your ${device} and subscribe here after it ends.`,
    };
  }
  return {
    store: other.store,
    message: `Your OnMyLead Pro subscription through ${name} is ${other.status === 'paused' ? 'paused' : 'waiting on a payment'}. Resume or fix it on your ${device}, or cancel it there before subscribing here, so you aren’t charged twice.`,
  };
}

/** The subscription Manage Subscription is about: the paid one, else any one still open. */
function managedSubscription(ent: Entitlements): StoreSubscription | null {
  return ent.store ?? ent.openSubscriptions[0] ?? null;
}

/**
 * What Manage Subscription does here: the store's own screen when the subscription is from this
 * device's store (or there is none yet), otherwise the other store's web page and a sentence
 * saying where it is billed.
 */
export function manageTarget(ent: Entitlements, here: Store | null): { kind: 'store' } | { kind: 'web'; store: Store; url: string; message: string } {
  const sub = managedSubscription(ent);
  if (here && (!sub || sub.store === here)) return { kind: 'store' };
  const store: Store = sub?.store ?? 'apple';
  const where = store === 'apple'
    ? 'in Settings > Apple Account > Subscriptions on your iPhone or iPad'
    : 'in the Play Store app on your Android device (Profile > Payments & Subscriptions)';
  return {
    kind: 'web',
    store,
    url: MANAGE_URLS[store],
    message: sub ? `Your Pro subscription is billed by ${STORE_NAMES[store]}. Change or cancel it ${where}.` : 'Subscriptions are bought in the OnMyLead app.',
  };
}

/** What Restore Purchases says afterwards. */
export function restoreMessage(here: Store, restored: number): string {
  if (restored) return 'Your Pro subscription is restored.';
  return here === 'google' ? 'No OnMyLead Pro purchase found for this Google account.' : 'No OnMyLead Pro purchase found for this Apple ID.';
}

/**
 * The Google Play offer to buy for a product: its base plan (no offer id), or the first offer
 * when Google only sent offers. OnMyLead has no introductory offers; promo codes are redeemed
 * in Google Play itself.
 */
export function androidOfferToken(offers: { id?: string | null; basePlanIdAndroid?: string | null; offerTokenAndroid?: string | null }[] | null | undefined): string | null {
  const usable = (offers ?? []).filter((o) => !!o.offerTokenAndroid);
  const base = usable.find((o) => !o.id || o.id === o.basePlanIdAndroid);
  return (base ?? usable[0])?.offerTokenAndroid ?? null;
}

// ---- Subscription terms ----

/** OnMyLead's own Terms of Use, for Google Play subscriptions (Google has no standard one). */
export const SITE_TERMS_URL = 'https://onmylead.com/terms';

/**
 * The subscription terms each store requires next to the Subscribe button: price, auto-renewal,
 * where it is charged and cancelled, and that the free trial never charges.
 */
export function disclosureText(store: 'apple' | 'google' | null | undefined): string {
  const price = `OnMyLead Pro is $${PRICES.monthly} a month or $${PRICES.annual} a year (US prices; other countries are shown in local currency).`;
  const trial = 'The free Pro Trial for new accounts needs no payment and never turns into a paid subscription on its own.';
  if (store === 'google') {
    return `${price} Payment is charged to your Google Play account when you confirm. The subscription renews automatically at the end of each period until you cancel. Cancel anytime in the Play Store app under Profile > Payments & Subscriptions > Subscriptions; Pro stays on until the end of the period you paid for. ${trial}`;
  }
  if (!store) {
    return `${price} Pro is bought in the OnMyLead app, through the app store on your phone, and renews automatically until you cancel it in that store. ${trial}`;
  }
  return `${price} Payment is charged to your Apple ID when you confirm. The subscription renews automatically unless you turn it off at least 24 hours before the end of the current period, and renewal is charged within the 24 hours before the period ends. Manage or cancel anytime in your App Store account settings. ${trial}`;
}
