import { describe, expect, it } from 'vitest';

import {
  accountUserId,
  allowedPlayEnvironments,
  moneyMilli,
  parseRtdn,
  PLAY_PACKAGE_NAME,
  PLAY_PRODUCT_IDS,
  playOrder,
  playRow,
  playStatus,
  promoCode,
  proLineItem,
  type PlaySubscription,
} from '../../../../supabase/functions/_shared/play-status';
import { parseEntitlements } from '../entitlements';
import { PRICES } from '../pro';
import {
  ANDROID_PACKAGE,
  androidOfferToken,
  deviceStore,
  disclosureText,
  manageTarget,
  otherStoreBlock,
  PRODUCT_IDS,
  PRODUCTS,
  restoreMessage,
} from '../purchases';

const now = Date.parse('2026-10-14T20:00:00Z');
const day = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(ms).toISOString();

const sub = (over: Partial<PlaySubscription> = {}): PlaySubscription => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  startTime: at(now - day),
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: '6F9619FF-8B86-D011-B42D-00C04FC964FF' },
  lineItems: [{
    productId: PRODUCTS.monthly,
    expiryTime: at(now + 29 * day),
    autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: 'USD', units: '4', nanos: 990_000_000 } },
    offerDetails: { basePlanId: 'monthly' },
    latestSuccessfulOrderId: 'GPA.3311-2222-1111-00000',
  }],
  ...over,
});

describe('Google Play products', () => {
  it('are the same ids as the App Store', () => {
    expect(PLAY_PRODUCT_IDS).toEqual(PRODUCT_IDS);
    expect(PLAY_PACKAGE_NAME).toBe(ANDROID_PACKAGE);
  });

  it('only count OnMyLead Pro line items, the longest first', () => {
    expect(proLineItem(sub({ lineItems: [{ productId: 'other.app.sub', expiryTime: at(now + day) }] }))).toBeNull();
    const two = sub({ lineItems: [
      { productId: PRODUCTS.monthly, expiryTime: at(now + day) },
      { productId: PRODUCTS.annual, expiryTime: at(now + 300 * day) },
    ] });
    expect(proLineItem(two)?.productId).toBe(PRODUCTS.annual);
  });
});

describe('Google Play subscription status', () => {
  it('maps every state Google sends', () => {
    const s = (state: string, expiry = now + day) => playStatus(sub({ subscriptionState: state, lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(expiry) }] }), now);
    expect(s('SUBSCRIPTION_STATE_ACTIVE')).toBe('active');
    expect(s('SUBSCRIPTION_STATE_CANCELED')).toBe('active');
    expect(s('SUBSCRIPTION_STATE_CANCELED', now - 1)).toBe('expired');
    expect(s('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')).toBe('grace');
    expect(s('SUBSCRIPTION_STATE_ON_HOLD')).toBe('billing_retry');
    expect(s('SUBSCRIPTION_STATE_PAUSED')).toBe('paused');
    expect(s('SUBSCRIPTION_STATE_PENDING')).toBe('pending');
    expect(s('SUBSCRIPTION_STATE_EXPIRED')).toBe('expired');
    expect(s('SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')).toBe('expired');
    expect(s('SUBSCRIPTION_STATE_UNSPECIFIED')).toBe('active');
    expect(s('SUBSCRIPTION_STATE_UNSPECIFIED', now - 1)).toBe('expired');
  });

  it('builds the play_subscriptions row', () => {
    expect(playRow('tok', sub(), now)).toEqual({
      purchase_token: 'tok',
      product_id: PRODUCTS.monthly,
      base_plan_id: 'monthly',
      status: 'active',
      expires_at: at(now + 29 * day),
      grace_until: null,
      auto_renew: true,
      offer_type: null,
      offer_id: null,
      price_milli: 4990,
      currency: 'USD',
      environment: 'Production',
      linked_purchase_token: null,
      latest_order_id: 'GPA.3311-2222-1111-00000',
      acknowledged: false,
      started_at: at(now - day),
    });
    expect(() => playRow('tok', sub({ lineItems: [] }), now)).toThrow();
  });

  it('marks license testers as Sandbox and remembers the token a plan change replaced', () => {
    const r = playRow('tok2', sub({ testPurchase: {}, linkedPurchaseToken: 'tok1', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }), now);
    expect(r.environment).toBe('Sandbox');
    expect(r.linked_purchase_token).toBe('tok1');
    expect(r.acknowledged).toBe(true);
  });

  it('keeps Pro through a grace period, at least a few days past the paid period', () => {
    const r = playRow('tok', sub({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(now - day) }] }), now);
    expect(r.status).toBe('grace');
    expect(r.grace_until).toBe(at(now + 3 * day));
    const later = playRow('tok', sub({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(now + 10 * day) }] }), now);
    expect(later.grace_until).toBe(at(now + 10 * day));
  });

  it('records a cancelled subscription as running until its end with auto-renew off', () => {
    const r = playRow('tok', sub({
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      lineItems: [{ productId: PRODUCTS.annual, expiryTime: at(now + 100 * day), autoRenewingPlan: { autoRenewEnabled: false } }],
    }), now);
    expect(r.status).toBe('active');
    expect(r.auto_renew).toBe(false);
  });

  it('records Play promo codes like Apple offer codes', () => {
    expect(promoCode(sub({ signupPromotion: { vanityCode: { promotionCode: 'TRAILFRIENDS' } } }))).toBe('TRAILFRIENDS');
    expect(promoCode(sub({ signupPromotion: { oneTimeCode: {} } }))).toBe('One-Time Code');
    expect(promoCode(sub())).toBeNull();
    const r = playRow('tok', sub({ signupPromotion: { vanityCode: { promotionCode: 'TRAILFRIENDS' } } }), now);
    expect([r.offer_type, r.offer_id]).toEqual([3, 'TRAILFRIENDS']);
    const offer = playRow('tok', sub({ lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(now + day), offerDetails: { basePlanId: 'monthly', offerId: 'winter' } }] }), now);
    expect([offer.offer_type, offer.offer_id]).toEqual([1, 'winter']);
  });

  it('reads Google money as thousandths', () => {
    expect(moneyMilli({ units: '29', nanos: 990_000_000 })).toBe(29990);
    expect(moneyMilli({ units: 4, nanos: 990_000_000 })).toBe(4990);
    expect(moneyMilli({ units: '0', nanos: 0 })).toBe(0);
    expect(moneyMilli({ currencyCode: 'USD' })).toBeNull();
    expect(moneyMilli(null)).toBeNull();
  });

  it('only links the purchase to a real-looking OnMyLead account id', () => {
    expect(accountUserId(sub())).toBe('6f9619ff-8b86-d011-b42d-00c04fc964ff');
    expect(accountUserId(sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: 'abc' } }))).toBeNull();
    expect(accountUserId(sub({ externalAccountIdentifiers: undefined }))).toBeNull();
  });

  it('accepts the environments the server is set to', () => {
    expect([...allowedPlayEnvironments(undefined)].sort()).toEqual(['Production', 'Sandbox']);
    expect([...allowedPlayEnvironments('Production')]).toEqual(['Production']);
    expect([...allowedPlayEnvironments(' sandbox ')]).toEqual(['Sandbox']);
  });
});

describe('Google Play orders', () => {
  it('counts the first order as a purchase at its start and renewals by their ..N suffix', () => {
    expect(playOrder(sub(), now)).toEqual({ order_id: 'GPA.3311-2222-1111-00000', kind: 'purchase', price_milli: 4990, currency: 'USD', charged_at: at(now - day) });
    const renewal = playOrder(sub({ lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(now + day), latestSuccessfulOrderId: 'GPA.3311-2222-1111-00000..3',
      autoRenewingPlan: { recurringPrice: { currencyCode: 'EUR', units: '5', nanos: 490_000_000 } } }] }), now);
    expect(renewal).toEqual({ order_id: 'GPA.3311-2222-1111-00000..3', kind: 'renewal', price_milli: 5490, currency: 'EUR', charged_at: at(now) });
  });

  it('charges nothing for a free trial phase and has no order while payment is pending', () => {
    const trial = sub({ lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(now + day), latestSuccessfulOrderId: 'GPA.1', offerPhase: { freeTrial: {} },
      autoRenewingPlan: { recurringPrice: { currencyCode: 'USD', units: '4', nanos: 990_000_000 } } }] });
    expect(playOrder(trial, now)?.price_milli).toBe(0);
    expect(playOrder(sub({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }), now)).toBeNull();
    expect(playOrder(sub({ lineItems: [{ productId: PRODUCTS.monthly, expiryTime: at(now + day) }] }), now)).toBeNull();
  });
});

describe('Real-time Developer Notifications', () => {
  const push = (n: unknown, messageId = '136969346945') => ({ message: { data: btoa(JSON.stringify(n)), messageId, publishTime: '2026-10-14T20:00:00Z' }, subscription: 'projects/x/subscriptions/y' });

  it('reads subscription notifications', () => {
    const n = parseRtdn(push({ version: '1.0', packageName: ANDROID_PACKAGE, eventTimeMillis: String(now),
      subscriptionNotification: { version: '1.0', notificationType: 4, purchaseToken: 'tok', subscriptionId: PRODUCTS.monthly } }));
    expect(n).toEqual({ kind: 'subscription', messageId: '136969346945', packageName: ANDROID_PACKAGE, eventTime: now,
      notificationType: 4, type: 'SUBSCRIPTION_PURCHASED', purchaseToken: 'tok', productId: PRODUCTS.monthly });
    const unknown = parseRtdn(push({ packageName: ANDROID_PACKAGE, subscriptionNotification: { notificationType: 99, purchaseToken: 't' } }));
    expect(unknown && unknown.kind === 'subscription' ? unknown.type : null).toBe('SUBSCRIPTION_99');
  });

  it('reads refunds, test messages, and refuses anything else', () => {
    expect(parseRtdn(push({ packageName: ANDROID_PACKAGE, voidedPurchaseNotification: { purchaseToken: 'tok', orderId: 'GPA.1', productType: 1, refundType: 1 } })))
      .toMatchObject({ kind: 'voided', purchaseToken: 'tok', orderId: 'GPA.1', productType: 1, refundType: 1 });
    expect(parseRtdn(push({ packageName: ANDROID_PACKAGE, testNotification: { version: '1.0' } }))?.kind).toBe('test');
    expect(parseRtdn(push({ packageName: ANDROID_PACKAGE, oneTimeProductNotification: {} }))?.kind).toBe('other');
    expect(parseRtdn(null)).toBeNull();
    expect(parseRtdn({ message: { data: 'not base64 json!', messageId: '1' } })).toBeNull();
    expect(parseRtdn({ message: { data: btoa('{}'), messageId: '1' } })).toBeNull();
    expect(parseRtdn({ message: { data: btoa(JSON.stringify({ packageName: 'x' })) } })).toBeNull();
  });
});

describe('two stores, one Pro', () => {
  const ent = (raw: Record<string, unknown>) => parseEntitlements({ account_type: 'pro', features: {}, ...raw }, now);
  const google = { store: 'google', product_id: PRODUCTS.monthly, status: 'active', expires_at: at(now + day), auto_renew: true, environment: 'Production' };
  const apple = { ...google, store: 'apple' };

  it('picks the store for each device', () => {
    expect(deviceStore('ios')).toBe('apple');
    expect(deviceStore('android')).toBe('google');
    expect(deviceStore('web')).toBeNull();
  });

  it('reads Google Pro from the server', () => {
    const e = ent({ pro_source: 'google', google: { ...google, store: undefined }, store_subscription: google, open_subscriptions: [google] });
    expect(e.proSource).toBe('google');
    expect(e.label).toBe('Pro');
    expect(e.store?.store).toBe('google');
    expect(e.google?.status).toBe('active');
    expect(e.apple).toBeNull();
    expect(e.openSubscriptions).toHaveLength(1);
  });

  it('still reads a server from before Google Play', () => {
    const e = ent({ pro_source: 'apple', apple: { ...apple, store: undefined } });
    expect(e.store?.store).toBe('apple');
    expect(e.openSubscriptions.map((s) => s.store)).toEqual(['apple']);
  });

  it('stops a rider paying on both stores', () => {
    const onGoogle = ent({ pro_source: 'google', store_subscription: google, open_subscriptions: [google] });
    expect(otherStoreBlock(onGoogle, 'google')).toBeNull();
    const b = otherStoreBlock(onGoogle, 'apple');
    expect(b?.store).toBe('google');
    expect(b?.message).toMatch(/through Google Play, and it works here too/);
    const onHold = ent({ account_type: 'free', pro_source: null, open_subscriptions: [{ ...apple, status: 'billing_retry' }] });
    expect(otherStoreBlock(onHold, 'google')?.message).toMatch(/through the App Store is waiting on a payment/);
    const paused = ent({ account_type: 'free', pro_source: null, open_subscriptions: [{ ...google, status: 'paused' }] });
    expect(otherStoreBlock(paused, 'apple')?.message).toMatch(/paused/);
    expect(otherStoreBlock(ent({ account_type: 'free', pro_source: null }), 'apple')).toBeNull();
  });

  it('sends Manage Subscription to the store that bills it', () => {
    const onGoogle = ent({ pro_source: 'google', store_subscription: google, open_subscriptions: [google] });
    expect(manageTarget(onGoogle, 'google')).toEqual({ kind: 'store' });
    const fromIphone = manageTarget(onGoogle, 'apple');
    expect(fromIphone.kind === 'web' && fromIphone.url).toContain('play.google.com/store/account/subscriptions');
    expect(fromIphone.kind === 'web' && fromIphone.message).toMatch(/billed by Google Play/);
    const onApple = ent({ pro_source: 'apple', store_subscription: apple, open_subscriptions: [apple] });
    const fromAndroid = manageTarget(onApple, 'google');
    expect(fromAndroid.kind === 'web' && fromAndroid.message).toMatch(/Settings > Apple Account > Subscriptions/);
    expect(manageTarget(ent({ account_type: 'free', pro_source: null }), 'google')).toEqual({ kind: 'store' });
    const web = manageTarget(ent({ account_type: 'free', pro_source: null }), null);
    expect(web.kind === 'web' && web.message).toMatch(/in the OnMyLead app/);
  });

  it('says which account Restore looked in', () => {
    expect(restoreMessage('google', 0)).toMatch(/Google account/);
    expect(restoreMessage('apple', 0)).toMatch(/Apple ID/);
    expect(restoreMessage('google', 1)).toMatch(/restored/);
  });

  it('buys the base plan on Google Play', () => {
    expect(androidOfferToken([
      { id: 'winter', basePlanIdAndroid: 'monthly', offerTokenAndroid: 'offer-tok' },
      { id: 'monthly', basePlanIdAndroid: 'monthly', offerTokenAndroid: 'base-tok' },
    ])).toBe('base-tok');
    expect(androidOfferToken([{ id: null, basePlanIdAndroid: 'annual', offerTokenAndroid: 'base' }])).toBe('base');
    expect(androidOfferToken([{ id: 'only', basePlanIdAndroid: 'annual', offerTokenAndroid: 'only-tok' }])).toBe('only-tok');
    expect(androidOfferToken([{ id: 'x', offerTokenAndroid: null }])).toBeNull();
    expect(androidOfferToken(undefined)).toBeNull();
  });
});

describe('subscription terms', () => {
  it('name the store that charges on each device', () => {
    expect(disclosureText('apple')).toMatch(/charged to your Apple ID/);
    expect(disclosureText('apple')).toMatch(/24 hours before/);
    expect(disclosureText('google')).toMatch(/charged to your Google Play account/);
    expect(disclosureText('google')).toMatch(/Payments & Subscriptions/);
    expect(disclosureText(null)).toMatch(/app store on your phone/);
    for (const s of ['apple', 'google', null] as const) {
      expect(disclosureText(s)).toContain(`$${PRICES.monthly} a month or $${PRICES.annual} a year`);
      expect(disclosureText(s)).toMatch(/never turns into a paid subscription/);
    }
  });
});
