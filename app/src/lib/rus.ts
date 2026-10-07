/**
 * Products from the RUS Offroad store (WooCommerce Store API: public, no keys).
 * Short in-memory cache. Any failure returns an empty list so the app just shows nothing.
 */
import * as WebBrowser from 'expo-web-browser';

import { RUS_ORIGIN, buyUrl, parseStoreProducts, storeUrl, type RusProduct } from '@/core/rus-match';
import { track } from './analytics';

export type { GearSuggestion, RiderVehicle, RusProduct } from '@/core/rus-match';
export { formatPrice, matchProducts } from '@/core/rus-match';

const PRODUCTS_URL = `${RUS_ORIGIN}/wp-json/wc/store/v1/products?per_page=100`;
const FRESH_MS = 15 * 60_000;
const RETRY_MS = 2 * 60_000;

let cache: { at: number; ttl: number; products: RusProduct[] } | null = null;
let inflight: Promise<RusProduct[]> | null = null;

export function rusProducts(): Promise<RusProduct[]> {
  if (cache && Date.now() - cache.at < cache.ttl) return Promise.resolve(cache.products);
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load(): Promise<RusProduct[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(PRODUCTS_URL, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const products = parseStoreProducts(await res.json());
    cache = { at: Date.now(), ttl: FRESH_MS, products };
    return products;
  } catch {
    // Keep showing the last good list if we have one; otherwise nothing. Try again soon.
    const products = cache?.products ?? [];
    cache = { at: Date.now(), ttl: RETRY_MS, products };
    return products;
  } finally {
    clearTimeout(timer);
  }
}

/** Open a product in the in-app browser, with attribution for where in the app it came from. */
export async function openProduct(p: RusProduct, campaign: string) {
  track('rus_product_opened', { product_id: p.id, campaign });
  await WebBrowser.openBrowserAsync(buyUrl(p, campaign));
}

export async function openStore(campaign: string) {
  track('rus_store_opened', { campaign });
  await WebBrowser.openBrowserAsync(storeUrl(campaign));
}
