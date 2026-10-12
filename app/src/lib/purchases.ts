// OnMyLead Pro through Apple's StoreKit 2 (expo-iap). The phone never decides who has Pro: every
// transaction goes to the appstore-verify edge function, which checks Apple's signature and
// stores the subscription; App Store Server Notifications keep it current after that.
// The screens and buttons that call these live in the Pro screen and Profile > Settings.
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  presentCodeRedemptionSheetIOS,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  showManageSubscriptionsIOS,
  type Purchase,
} from 'expo-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';

import {
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

let connecting: Promise<boolean> | null = null;
/** Opens StoreKit once per launch. */
function connect(): Promise<boolean> {
  connecting ??= initConnection().then(
    () => true,
    (e) => {
      console.warn('StoreKit unavailable', e);
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
 * Sends one transaction to the server and finishes it with Apple once it's stored. Resolves true
 * when the server verified it. The same transaction can arrive from the purchase call and the
 * update listener at once; it is only sent once.
 */
function settle(purchase: Purchase): Promise<boolean> {
  const key = purchase.id || purchase.purchaseToken || '';
  const running = settling.get(key);
  if (running) return running;
  const job = (async () => {
    if (!PRODUCT_IDS.includes(purchase.productId) || !purchase.purchaseToken) return false;
    const { data, error } = await supabase.functions.invoke('appstore-verify', {
      body: { signedTransaction: purchase.purchaseToken },
    });
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
 * Starts listening for transactions StoreKit delivers on its own: renewals, offer codes redeemed
 * in the App Store, Ask to Buy approvals, and anything left unfinished from an earlier launch.
 * Safe to call more than once.
 */
export async function startPurchaseUpdates(): Promise<void> {
  if (listening || !(await connect())) return;
  listening = true;
  purchaseUpdatedListener((p) => {
    settle(p).catch((e) => console.warn('purchase not verified yet', e));
  });
}

export async function loadProducts(): Promise<ProProduct[]> {
  if (!(await connect())) return [];
  try {
    const items = await fetchProducts({ skus: PRODUCT_IDS, type: 'subs' });
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
  let result: Purchase | Purchase[] | null;
  try {
    result = await requestPurchase({
      type: 'subs',
      // Ties the Apple subscription to this OnMyLead account in every signed transaction.
      request: { apple: { sku: id, appAccountToken: userId } },
    });
  } catch (e) {
    return buyFailure((e as { code?: string })?.code);
  }
  const purchase = (Array.isArray(result) ? result : [result]).find((p) => p?.productId === id);
  if (!purchase) return { ok: false, reason: 'pending' };
  const verified = await settle(purchase).catch(() => false);
  return { ok: true, verified };
}

export async function restore(): Promise<{ ok: boolean; restored: number }> {
  if (!(await connect())) return { ok: false, restored: 0 };
  try {
    await restorePurchases();
    const owned = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
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
 * Apple's offer-code sheet. A redeemed code arrives as a transaction through the update listener,
 * and Pro starts only after the server has verified it.
 */
export async function redeemOfferCode(): Promise<void> {
  if (!(await connect())) return;
  await startPurchaseUpdates();
  await presentCodeRedemptionSheetIOS();
}

/** Apple's own Manage Subscription sheet (change plan, cancel). */
export async function manageSubscription(): Promise<void> {
  if (!(await connect())) return;
  const changed = await showManageSubscriptionsIOS().catch(() => [] as Purchase[]);
  await Promise.all((changed ?? []).map((p) => settle(p).catch(() => false)));
}
