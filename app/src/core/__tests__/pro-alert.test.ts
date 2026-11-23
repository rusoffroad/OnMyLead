import { describe, expect, it } from 'vitest';

import { appleAlert, isBlackFriday, planName, playAlert, priceText, proAlertEmail, proAlertPush } from '../../../../supabase/functions/_shared/pro-alert';

const MONTHLY = 'com.rusoffroad.onmylead.pro.monthly';
const ANNUAL = 'com.rusoffroad.onmylead.pro.annual';

describe('appleAlert', () => {
  const paid = { originalTransactionId: '2000001', productId: ANNUAL, price: 29990, currency: 'USD', environment: 'Production' };

  it('a full-price purchase is a paid alert', () => {
    expect(appleAlert(paid, 'active')).toMatchObject({ store: 'apple', subscriptionId: '2000001', kind: 'paid', priceMilli: 29990, sandbox: false, offerKind: null });
  });

  it('a free trial introductory offer is a trial alert', () => {
    expect(appleAlert({ ...paid, price: 0, offerType: 1, offerDiscountType: 'FREE_TRIAL' }, 'active')?.kind).toBe('trial');
    expect(appleAlert({ ...paid, price: 0, offerType: 1 }, 'active')?.kind).toBe('trial');
  });

  it('a paid introductory price or offer code is paid, with the offer named', () => {
    const a = appleAlert({ ...paid, price: 14990, offerType: 3, offerIdentifier: 'black-friday-50', offerDiscountType: 'PAY_UP_FRONT' }, 'active');
    expect(a).toMatchObject({ kind: 'paid', offerKind: 'code', offerId: 'black-friday-50' });
  });

  it('sends nothing for a subscription that gives no Pro', () => {
    for (const s of ['expired', 'billing_retry', 'revoked', 'refunded']) expect(appleAlert(paid, s)).toBeNull();
    expect(appleAlert(paid, 'grace')).not.toBeNull();
  });

  it('marks Sandbox purchases', () => {
    expect(appleAlert({ ...paid, environment: 'Sandbox' }, 'active')?.sandbox).toBe(true);
  });
});

describe('playAlert', () => {
  const row = { product_id: MONTHLY, status: 'active', price_milli: 4990, currency: 'USD', offer_id: null, offer_type: null };
  const sub = { lineItems: [{ productId: MONTHLY, autoRenewingPlan: { recurringPrice: { currencyCode: 'USD', units: '4', nanos: 990000000 } }, offerPhase: { basePrice: {} } }] };

  it('a base-price purchase is paid', () => {
    expect(playAlert('tok', sub, row)).toMatchObject({ store: 'google', subscriptionId: 'tok', kind: 'paid', priceMilli: 4990, sandbox: false });
  });

  it('a free trial phase is a trial', () => {
    const trial = { lineItems: [{ ...sub.lineItems[0], offerPhase: { freeTrial: {} }, offerDetails: { offerId: 'trial-7' } }] };
    expect(playAlert('tok', trial, { ...row, offer_id: 'trial-7', offer_type: 1 })).toMatchObject({ kind: 'trial', offerKind: 'intro', offerId: 'trial-7' });
  });

  it('an introductory price leaves the amount out rather than show the full price', () => {
    const intro = { lineItems: [{ ...sub.lineItems[0], offerPhase: { introductoryPrice: {} } }] };
    expect(playAlert('tok', intro, { ...row, offer_id: 'bf', offer_type: 1 })?.priceMilli).toBeNull();
  });

  it('skips plan changes, pending and ended subscriptions', () => {
    expect(playAlert('tok', { ...sub, linkedPurchaseToken: 'old' }, row)).toBeNull();
    expect(playAlert('tok', sub, { ...row, status: 'pending' })).toBeNull();
    expect(playAlert('tok', sub, { ...row, status: 'expired' })).toBeNull();
  });

  it('license tester purchases are Sandbox', () => {
    expect(playAlert('tok', { ...sub, testPurchase: {} }, row)?.sandbox).toBe(true);
  });
});

describe('the email', () => {
  it('names plan, price and Black Friday offers', () => {
    expect(planName(MONTHLY)).toBe('Monthly');
    expect(planName(ANNUAL)).toBe('Annual');
    expect(priceText({ priceMilli: 29990, currency: 'USD', productId: ANNUAL })).toBe('$29.99 a year');
    expect(priceText({ priceMilli: 4990, currency: 'CAD', productId: MONTHLY })).toBe('4.99 CAD a month');
    expect(isBlackFriday('black-friday-50')).toBe(true);
    expect(isBlackFriday('bf2026')).toBe(true);
    expect(isBlackFriday('offroad')).toBe(false);
    expect(isBlackFriday('pro_bf_annual')).toBe(true);
    expect(isBlackFriday('referral-50')).toBe(false);
  });

  it('says who paid, on which store, and links the rider', () => {
    const a = appleAlert({ originalTransactionId: '1', productId: ANNUAL, price: 14990, currency: 'USD', offerType: 2, offerIdentifier: 'BlackFriday', environment: 'Production' }, 'active')!;
    const e = proAlertEmail(a, { userId: 'u-1', name: 'Rex <Rider>', email: 'rex@example.com' }, new Date('2026-11-28T15:04:00Z'));
    expect(e.subject).toBe('Rex <Rider> paid for Pro Annual (iPhone)');
    expect(e.text).toContain('Store: App Store (iPhone or iPad)');
    expect(e.text).toContain('Type: Paid');
    expect(e.text).toContain('Price: $14.99 a year');
    expect(e.text).toContain('Offer: Black Friday price: Promotional offer "BlackFriday"');
    expect(e.text).toContain('https://onmylead.com/admin/users/u-1');
    expect(e.html).toContain('Rex &lt;Rider&gt;');
    expect(e.html).not.toContain('<Rider>');
  });

  it('a trial on Android with no linked account still reads well', () => {
    const a = playAlert('tok', { lineItems: [{ productId: MONTHLY, offerPhase: { freeTrial: {} } }] },
      { product_id: MONTHLY, status: 'active', price_milli: 4990, currency: 'USD', offer_id: 'free-week', offer_type: 1 })!;
    const e = proAlertEmail(a, { userId: null, name: null, email: null }, new Date('2026-11-28T15:04:00Z'));
    expect(e.subject).toBe('A rider started a Pro Monthly free trial (Android)');
    expect(e.text).toContain('Price after trial: $4.99 a month');
    expect(e.text).toContain('Store: Google Play (Android)');
    expect(e.text).toContain('/admin/subscriptions');
  });

  it('flags test purchases', () => {
    const a = appleAlert({ originalTransactionId: '1', productId: MONTHLY, price: 4990, environment: 'Sandbox' }, 'active')!;
    const e = proAlertEmail(a, { userId: 'u', name: 'Tess', email: null }, new Date());
    expect(e.subject.startsWith('Test purchase: ')).toBe(true);
    expect(e.text).toContain('No real money');
  });
});

describe('the push webhook', () => {
  it('carries a ready title and body without the rider email', () => {
    const a = appleAlert({ originalTransactionId: '1', productId: 'com.rusoffroad.onmylead.pro.annual', price: 14990, currency: 'USD', offerType: 3, offerIdentifier: 'black-friday', environment: 'Production' }, 'active')!;
    const p = proAlertPush(a, { userId: 'u-1', name: 'Rex', email: 'rex@example.com' }, 'Rex paid for Pro Annual (iPhone)');
    expect(p).toMatchObject({ event: 'pro_paid', title: 'Rex paid for Pro Annual (iPhone)', body: 'Pro Annual · App Store · $14.99 a year · Black Friday price', url: 'https://onmylead.com/admin/users/u-1' });
    expect(JSON.stringify(p)).not.toContain('rex@example.com');
  });
});
