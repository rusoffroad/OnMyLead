// Pro is bought in the iPhone app; the website can't sell Apple subscriptions.
import { PRODUCTS, type BuyResult, type ProProduct } from '@/core/purchases';

export { PRODUCTS };
export type { BuyResult, ProProduct };

export const onPurchaseVerified = (_listener: (result: unknown) => void): (() => void) => () => {};
export const startPurchaseUpdates = async (): Promise<void> => {};
export const loadProducts = async (): Promise<ProProduct[]> => [];
export const buy = async (_id: string): Promise<BuyResult> => ({ ok: false, reason: 'ios_only' });
export const restore = async (): Promise<{ ok: boolean; restored: number }> => ({ ok: false, restored: 0 });
export const redeemOfferCode = async (): Promise<void> => {};
export const manageSubscription = async (): Promise<void> => {};
