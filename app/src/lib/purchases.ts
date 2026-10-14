// OnMyLead Pro through the device's own store, both via expo-iap: StoreKit 2 on iPhone and iPad,
// Google Play Billing on Android phones and tablets. The phone never decides who has Pro: every
// purchase goes to the store's verify edge function (appstore-verify checks Apple's signature,
// play-verify asks the Google Play Developer API) which stores the subscription; the store's
// server notifications keep it current after that. Pro bought on one store works on every device.
// The screens and buttons that call these live in the Pro screen and Profile > Subscription.
import {
  deepLinkToSubscriptions,
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  openRedeemOfferCode,
  presentCodeRedemptionSheetIOS,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  showManageSubscriptionsIOS,
  type Purchase,
} from 'expo-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import {
  ANDROID_PACKAGE,
  androidOfferToken,
  buyFailure,
  PRODUCT_IDS,
  PRODUCTS,
  proProducts,
  verifyDisposition,
  type BuyResult,
  type ProProduct,
} from '@/core/purchases';
import { refreshEntitlements } from './entitlements';
import { supabase } from './supabase';

export { PRODUCTS };
export type { BuyResult, ProProduct };

const android = Platform.OS === 'android';

let connecting: Promise<boolean> | null = null;
/** Opens the store connection once per launch. */
function connect(): Promise<boolean> {
  connecting ??= initConnection().then(
    () => true,
    (e) => {
      console.warn('store unavailable', e);
      connecting = null;
      return false;
    },
  );
  return connecting;
}

type Verified = (result: { status: string; productId: string; expiresAt: string | null; entitlements: unknown }) => void;
const verifiedListeners = new Set<Verified>();

/**
 * Called whenever the server confirms a purchase, renewal, restore or offer-code redemption,
 * including ones that arrive in the background, so the caller can refresh entitlements.
 */
export function onPurchaseVerified(listener: Verified): () => void {
  verifiedListeners.add(listener);
  return () => verifiedListeners.delete(listener);
}

const settling = new Map<string, Promise<boolean>>();
/**
 * Sends one purchase to the server and finishes it with the store once it's stored (on Android,
 * finishing acknowledges it; play-verify also acknowledges it on the server). Resolves true when
 * the server verified it. The same purchase can arrive from the purchase call and the update
 * listener at once; it is only sent once.
 */
function settle(purchase: Purchase): Promise<boolean> {
  const key = purchase.id || purchase.purchaseToken || '';
  const running = settling.get(key);
  if (running) return running;
  const job = (async () => {
    if (!PRODUCT_IDS.includes(purchase.productId) || !purchase.purchaseToken) return false;
    // A Google Play payment that hasn't gone through yet (cash at a store, a bank check) arrives
    // again once it has; there's nothing to verify before then.
    if (android && purchase.purchaseState === 'pending') return false;
    const { data, error } = android
      ? await supabase.functions.invoke('play-verify', { body: { purchaseToken: purchase.purchaseToken, productId: purchase.productId } })
      : await supabase.functions.invoke('appstore-verify', { body: { signedTransaction: purchase.purchaseToken } });
    let status = 200;
    let code: string | undefined;
    if (error) {
      status = error instanceof FunctionsHttpError ? error.context.status : 0;
      code = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => null))?.error : undefined;
    }
    const disposition = verifyDisposition(status, code);
    if (disposition !== 'keep') await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
    if (disposition === 'verified') {
      refreshEntitlements().catch(() => {});
      verifiedListeners.forEach((l) => l(data));
    }
    return disposition === 'verified';
  })().finally(() => settling.delete(key));
  settling.set(key, job);
  return job;
}

let listening = false;
/**
 * Starts listening for purchases the store delivers on its own: renewals, offer and promo codes
 * redeemed in the store, Ask to Buy approvals and Google Play pending payments that went through,
 * and anything left unfinished from an earlier launch. Safe to call more than once.
 */
export async function startPurchaseUpdates(): Promise<void> {
  if (listening || !(await connect())) return;
  listening = true;
  purchaseUpdatedListener((p) => {
    settle(p).catch((e) => console.warn('purchase not verified yet', e));
  });
  // Google Play doesn't hand back unfinished purchases on its own; look for any not yet
  // acknowledged (bought while offline, or the app closed first) and send them now.
  if (android) {
    getAvailablePurchases()
      .then((owned) => owned.filter((p) => PRODUCT_IDS.includes(p.productId) && 'isAcknowledgedAndroid' in p && p.isAcknowledgedAndroid === false))
      .then((left) => Promise.all(left.map((p) => settle(p).catch(() => false))))
      .catch(() => {});
  }
}

/** Google Play's offer token for each product, needed to buy it. */
const offerTokens = new Map<string, string>();

export async function loadProducts(): Promise<ProProduct[]> {
  if (!(await connect())) return [];
  try {
    const items = await fetchProducts({ skus: PRODUCT_IDS, type: 'subs' });
    for (const item of (items ?? []) as { id: string; subscriptionOffers?: Parameters<typeof androidOfferToken>[0] }[]) {
      const token = androidOfferToken(item.subscriptionOffers);
      if (token) offerTokens.set(item.id, token);
    }
    return proProducts((items ?? []) as { id: string; displayPrice: string }[]);
  } catch (e) {
    console.warn('could not load Pro products', e);
    return [];
  }
}

export async function buy(id: string): Promise<BuyResult> {
  if (!PRODUCT_IDS.includes(id)) return { ok: false, reason: 'failed' };
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId || !(await connect())) return { ok: false, reason: 'failed' };
  await startPurchaseUpdates();
  if (android && !offerTokens.has(id)) await loadProducts();
  const offerToken = offerTokens.get(id);
  if (android && !offerToken) return { ok: false, reason: 'failed' };
  let result: Purchase | Purchase[] | null;
  try {
    result = await requestPurchase({
      type: 'subs',
      request: {
        // Ties the subscription to this OnMyLead account: Apple puts it in every signed
        // transaction, Google returns it as the purchase's obfuscated account id.
        apple: { sku: id, appAccountToken: userId },
        google: offerToken ? { skus: [id], obfuscatedAccountId: userId, subscriptionOffers: [{ sku: id, offerToken }] } : null,
      },
    });
  } catch (e) {
    return buyFailure((e as { code?: string })?.code);
  }
  const purchase = (Array.isArray(result) ? result : [result]).find((p) => p?.productId === id);
  if (!purchase || (android && purchase.purchaseState === 'pending')) return { ok: false, reason: 'pending' };
  const verified = await settle(purchase).catch(() => false);
  return { ok: true, verified };
}

export async function restore(): Promise<{ ok: boolean; restored: number }> {
  if (!(await connect())) return { ok: false, restored: 0 };
  try {
    // Android: asking Google Play for the account's purchases is the restore.
    if (!android) await restorePurchases();
    const owned = await getAvailablePurchases(android ? undefined : { onlyIncludeActiveItemsIOS: true });
    const ours = owned.filter((p) => PRODUCT_IDS.includes(p.productId));
    const results = await Promise.all(ours.map((p) => settle(p).catch(() => false)));
    return { ok: true, restored: results.filter(Boolean).length };
  } catch (e) {
    if ((e as { code?: string })?.code === ErrorCode.UserCancelled) return { ok: true, restored: 0 };
    console.warn('restore failed', e);
    return { ok: false, restored: 0 };
  }
}

/**
 * The store's own code screen: Apple's offer-code sheet, or Google Play's Redeem Code page. A
 * redeemed code arrives as a purchase through the update listener (Google Play: when the rider
 * comes back to the app), and Pro starts only after the server has verified it.
 */
export async function redeemOfferCode(): Promise<void> {
  if (!(await connect())) return;
  await startPurchaseUpdates();
  if (android) {
    await openRedeemOfferCode();
    return;
  }
  await presentCodeRedemptionSheetIOS();
}

/** The store's own subscription screen (change plan, cancel): Apple's sheet, or Google Play's page. */
export async function manageSubscription(productId?: string | null): Promise<void> {
  if (!(await connect())) return;
  if (android) {
    await deepLinkToSubscriptions({ packageNameAndroid: ANDROID_PACKAGE, skuAndroid: productId ?? null });
    return;
  }
  const changed = await showManageSubscriptionsIOS().catch(() => [] as Purchase[]);
  await Promise.all((changed ?? []).map((p) => settle(p).catch(() => false)));
}
