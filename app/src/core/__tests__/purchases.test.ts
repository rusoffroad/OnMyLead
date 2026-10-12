import { describe, expect, it } from 'vitest';

import {
  accountTokenUserId,
  allowedEnvironments,
  peekJws,
  PRO_PRODUCT_IDS,
  subscriptionRow,
  subscriptionStatus,
} from '../../../../supabase/functions/_shared/appstore-status';
import { buyFailure, PRODUCT_IDS, PRODUCTS, proProducts, verifyDisposition } from '../purchases';

const now = Date.parse('2026-10-12T20:00:00Z');
const day = 24 * 60 * 60 * 1000;
const tx = {
  originalTransactionId: '2000000123',
  transactionId: '2000000456',
  productId: PRODUCTS.annual,
  environment: 'Sandbox',
  expiresDate: now + 30 * day,
  price: 29990,
  currency: 'USD',
  signedDate: now - 1000,
};

describe('Pro products in the app', () => {
  it('match the server list', () => {
    expect(PRODUCT_IDS).toEqual(PRO_PRODUCT_IDS);
  });

  it('lists monthly then annual and drops anything else', () => {
    const items = [
      { id: PRODUCTS.annual, displayPrice: '$29.99' },
      { id: 'something.else', displayPrice: '$1' },
      { id: PRODUCTS.monthly, displayPrice: '$4.99' },
    ];
    expect(proProducts(items)).toEqual([
      { id: PRODUCTS.monthly, displayPrice: '$4.99', period: 'month' },
      { id: PRODUCTS.annual, displayPrice: '$29.99', period: 'year' },
    ]);
    expect(proProducts([])).toEqual([]);
  });

  it('turns StoreKit errors into buyer outcomes', () => {
    expect(buyFailure('user-cancelled')).toEqual({ ok: false, reason: 'cancelled' });
    expect(buyFailure('deferred-payment')).toEqual({ ok: false, reason: 'pending' });
    expect(buyFailure('pending')).toEqual({ ok: false, reason: 'pending' });
    expect(buyFailure('network-error')).toEqual({ ok: false, reason: 'failed' });
    expect(buyFailure(undefined)).toEqual({ ok: false, reason: 'failed' });
  });

  it('finishes a transaction with Apple only once the server has it, or never will', () => {
    expect(verifyDisposition(200, undefined)).toBe('verified');
    expect(verifyDisposition(400, 'unknown_product')).toBe('finish');
    for (const [status, error] of [[400, 'unverified'], [400, 'wrong_environment'], [401, 'signed_out'], [404, undefined], [503, 'retry'], [0, undefined]] as const) {
      expect(verifyDisposition(status, error)).toBe('keep');
    }
  });
});

describe('Apple subscription status', () => {
  it('is active until it expires', () => {
    expect(subscriptionStatus({ transaction: tx, now })).toBe('active');
    expect(subscriptionStatus({ transaction: { ...tx, expiresDate: now - 1 }, now })).toBe('expired');
  });

  it('keeps Pro through the billing grace period, then billing retry', () => {
    const lapsed = { ...tx, expiresDate: now - day };
    expect(subscriptionStatus({ transaction: lapsed, renewal: { gracePeriodExpiresDate: now + day, isInBillingRetryPeriod: true }, now })).toBe('grace');
    expect(subscriptionStatus({ transaction: lapsed, renewal: { gracePeriodExpiresDate: now - 1, isInBillingRetryPeriod: true }, now })).toBe('billing_retry');
  });

  it('tells a refund from a Family Sharing revoke', () => {
    const revoked = { ...tx, revocationDate: now - 1000, revocationReason: 0 };
    expect(subscriptionStatus({ transaction: revoked, notificationType: 'REFUND', now })).toBe('refunded');
    expect(subscriptionStatus({ transaction: revoked, now })).toBe('refunded');
    expect(subscriptionStatus({ transaction: revoked, notificationType: 'REVOKE', now })).toBe('revoked');
    expect(subscriptionStatus({ transaction: revoked, appleStatus: 5, now })).toBe('revoked');
  });

  it("trusts Apple's own status code over the clock", () => {
    expect(subscriptionStatus({ transaction: tx, appleStatus: 2, now })).toBe('expired');
    expect(subscriptionStatus({ transaction: { ...tx, expiresDate: now - 1 }, appleStatus: 1, now })).toBe('active');
    expect(subscriptionStatus({ transaction: tx, appleStatus: 3, now })).toBe('billing_retry');
    expect(subscriptionStatus({ transaction: tx, appleStatus: 4, now })).toBe('grace');
  });

  it('builds the stored row, including offer codes and price', () => {
    const row = subscriptionRow({
      transaction: { ...tx, offerType: 3, offerIdentifier: 'SPRING' },
      renewal: { autoRenewStatus: 1, signedDate: now },
      now,
    });
    expect(row).toEqual({
      original_transaction_id: '2000000123',
      product_id: PRODUCTS.annual,
      status: 'active',
      expires_at: new Date(now + 30 * day).toISOString(),
      grace_until: null,
      auto_renew: true,
      offer_type: 3,
      offer_id: 'SPRING',
      price_milli: 29990,
      currency: 'USD',
      environment: 'Sandbox',
      last_signed_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    });
    expect(subscriptionRow({ transaction: tx, now }).auto_renew).toBeNull();
    expect(() => subscriptionRow({ transaction: { ...tx, originalTransactionId: undefined }, now })).toThrow();
  });

  it('accepts both Apple environments unless told otherwise', () => {
    expect([...allowedEnvironments(undefined)].sort()).toEqual(['Production', 'Sandbox']);
    expect([...allowedEnvironments('Sandbox')]).toEqual(['Sandbox']);
    expect([...allowedEnvironments(' production , SANDBOX ')].sort()).toEqual(['Production', 'Sandbox']);
    expect([...allowedEnvironments('nonsense')]).toEqual([]);
  });

  it('only links an account from a real user id', () => {
    expect(accountTokenUserId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(accountTokenUserId('not-a-uuid')).toBeNull();
    expect(accountTokenUserId(undefined)).toBeNull();
  });

  it('peeks at a JWS payload to pick the environment', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(peekJws(`${b64({ alg: 'ES256' })}.${b64({ environment: 'Sandbox' })}.sig`)).toEqual({ environment: 'Sandbox' });
    expect(peekJws('garbage')).toBeNull();
  });
});
