// Pure rules behind lib/purchases.ts (StoreKit 2 through expo-iap), kept here so vitest covers them.

export const PRODUCTS = {
  monthly: 'com.rusoffroad.onmylead.pro.monthly',
  annual: 'com.rusoffroad.onmylead.pro.annual',
} as const;

export const PRODUCT_IDS: string[] = [PRODUCTS.monthly, PRODUCTS.annual];

export type ProProduct = { id: string; displayPrice: string; period: 'month' | 'year' };

export type BuyResult = {
  ok: boolean;
  reason?: 'cancelled' | 'pending' | 'failed' | 'ios_only';
  /**
   * Set when ok: true once the server has checked Apple's signature and stored the subscription.
   * false means Apple took the payment but the server couldn't confirm it yet (offline, or Pro
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

/** What a StoreKit error code (expo-iap ErrorCode values) means for the buyer. */
export function buyFailure(code: string | undefined): BuyResult {
  if (code === 'user-cancelled') return { ok: false, reason: 'cancelled' };
  // Ask to Buy or a bank check: Apple finishes it later and the purchase arrives on its own.
  if (code === 'pending' || code === 'deferred-payment') return { ok: false, reason: 'pending' };
  return { ok: false, reason: 'failed' };
}

/**
 * What to do with a transaction after asking appstore-verify about it.
 * 'verified': stored on the server, finish it with Apple.
 * 'finish':   the server will never accept it (not a Pro product), so finish it anyway.
 * 'keep':     leave it unfinished so StoreKit hands it back on the next launch (offline, signed
 *             out, function not deployed yet, Apple's certificate check timed out, and so on).
 */
export function verifyDisposition(httpStatus: number, error: string | undefined): 'verified' | 'finish' | 'keep' {
  if (httpStatus === 200) return 'verified';
  if (httpStatus === 400 && error === 'unknown_product') return 'finish';
  return 'keep';
}
