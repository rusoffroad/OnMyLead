// New Pro rider emails: decides when a store subscription is worth telling the owner about, and
// writes that email.
//
// Pure code with no imports, so the edge functions (Deno) and the app's vitest suite
// (app/src/core/__tests__/pro-alert.test.ts) run the same file. The sender is pro-alert-send.ts.
//
// Two moments get an email, each at most once per subscription (pro_signup_alerts keeps count):
//   trial  the rider started a store free trial (App Store or Google Play introductory offer);
//   paid   the store charged the rider for Pro for the first time: a straight purchase, or the
//          first charge after a free trial ends.
// Renewals, restores, plan changes and the server's own 30-day trial never send one.

export type AlertKind = 'trial' | 'paid';
export type AlertStore = 'apple' | 'google';

export type ProAlert = {
  store: AlertStore;
  /** Apple's original transaction id or Google's purchase token. */
  subscriptionId: string;
  kind: AlertKind;
  productId: string;
  priceMilli: number | null;
  currency: string | null;
  offerId: string | null;
  /** 'intro' (a store introductory offer), 'promo' (a promotional offer) or 'code' (an offer code). */
  offerKind: 'intro' | 'promo' | 'code' | null;
  sandbox: boolean;
};

export type AlertRider = { userId: string | null; name: string | null; email: string | null };

const LIVE = new Set(['active', 'grace']);

/** Apple's transaction fields this file reads (see appstore-status.ts for the rest). */
export type AppleAlertTransaction = {
  originalTransactionId?: string;
  productId?: string;
  price?: number;
  currency?: string;
  offerType?: number;
  offerIdentifier?: string;
  offerDiscountType?: string;
  environment?: string;
};

const appleOfferKind = (t: number | undefined): ProAlert['offerKind'] =>
  t === 1 ? 'intro' : t === 2 ? 'promo' : t === 3 ? 'code' : null;

/** What a verified Apple transaction is worth an email for, or null. `status` is the saved row's. */
export function appleAlert(t: AppleAlertTransaction, status: string): ProAlert | null {
  if (!t.originalTransactionId || !t.productId || !LIVE.has(status)) return null;
  const free = t.offerDiscountType === 'FREE_TRIAL' || (t.offerType === 1 && t.price === 0);
  return {
    store: 'apple',
    subscriptionId: t.originalTransactionId,
    kind: free ? 'trial' : 'paid',
    productId: t.productId,
    priceMilli: typeof t.price === 'number' ? t.price : null,
    currency: t.currency ?? null,
    offerId: t.offerIdentifier ?? null,
    offerKind: appleOfferKind(t.offerType),
    sandbox: t.environment !== 'Production',
  };
}

/** Google's subscription fields this file reads (see play-status.ts for the rest). */
export type PlayAlertSubscription = {
  subscriptionState?: string;
  linkedPurchaseToken?: string;
  testPurchase?: object;
  signupPromotion?: { oneTimeCode?: object; vanityCode?: { promotionCode?: string } };
  lineItems?: {
    productId?: string;
    autoRenewingPlan?: { recurringPrice?: { currencyCode?: string; units?: string | number; nanos?: number } };
    offerDetails?: { offerId?: string };
    offerPhase?: { freeTrial?: object; introductoryPrice?: object; basePrice?: object; prorationPeriod?: object };
  }[];
};

/**
 * What a Google Play subscription is worth an email for, or null. `row` is the saved
 * play_subscriptions row (status and product already worked out by play-status.ts).
 * A purchase that replaces an older one (an upgrade, a downgrade or a resubscribe from the Play
 * Store) names that older token in linkedPurchaseToken and isn't a new rider.
 */
export function playAlert(
  token: string,
  sub: PlayAlertSubscription,
  row: { product_id: string; status: string; price_milli: number | null; currency: string | null; offer_id: string | null; offer_type: number | null },
): ProAlert | null {
  if (!LIVE.has(row.status) || sub.linkedPurchaseToken) return null;
  const item = (sub.lineItems ?? []).find((l) => l.productId === row.product_id);
  const phase = item?.offerPhase;
  const intro = phase?.introductoryPrice;
  const price = item?.autoRenewingPlan?.recurringPrice;
  return {
    store: 'google',
    subscriptionId: token,
    kind: phase?.freeTrial ? 'trial' : 'paid',
    productId: row.product_id,
    // An introductory price phase charges less than the recurring price; the line item doesn't
    // say how much, so the email names the offer instead of a wrong amount.
    priceMilli: intro ? null : row.price_milli,
    currency: row.currency ?? price?.currencyCode ?? null,
    offerId: row.offer_id,
    offerKind: row.offer_type === 3 ? 'code' : row.offer_id ? 'intro' : null,
    sandbox: !!sub.testPurchase,
  };
}

export function planName(productId: string): 'Monthly' | 'Annual' | string {
  if (/\.monthly$/.test(productId)) return 'Monthly';
  if (/\.annual$/.test(productId)) return 'Annual';
  return productId;
}

/** "$29.99 a year". Null when the store didn't say. */
export function priceText(a: Pick<ProAlert, 'priceMilli' | 'currency' | 'productId'>): string | null {
  if (a.priceMilli === null) return null;
  const amount = (a.priceMilli / 1000).toFixed(2);
  const money = !a.currency || a.currency === 'USD' ? `$${amount}` : `${amount} ${a.currency}`;
  const plan = planName(a.productId);
  return plan === 'Monthly' ? `${money} a month` : plan === 'Annual' ? `${money} a year` : money;
}

/** Offer ids that look like a Black Friday sale (named by whoever set the offer up in the store). */
export const isBlackFriday = (offerId: string | null) => !!offerId && /black|friday|(^|[^a-z])bf([^a-z]|$)/i.test(offerId);

function offerText(a: ProAlert): string {
  if (!a.offerId && !a.offerKind) return 'None (full price)';
  const what = a.offerKind === 'code' ? 'Offer code' : a.offerKind === 'promo' ? 'Promotional offer' : 'Introductory offer';
  return `${isBlackFriday(a.offerId) ? 'Black Friday price: ' : ''}${what}${a.offerId ? ` "${a.offerId}"` : ''}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function proAlertEmail(a: ProAlert, rider: AlertRider, at: Date): { subject: string; text: string; html: string } {
  const who = rider.name?.trim() || rider.email || 'A rider';
  const plan = planName(a.productId);
  const device = a.store === 'apple' ? 'iPhone' : 'Android';
  const test = a.sandbox ? 'Test purchase: ' : '';
  const subject = a.kind === 'paid'
    ? `${test}${who} paid for Pro ${plan} (${device})`
    : `${test}${who} started a Pro ${plan} free trial (${device})`;
  const price = priceText(a);
  const facts: [string, string][] = [
    ['Rider', who],
    ...(rider.email && rider.email !== who ? [['Email', rider.email] as [string, string]] : []),
    ['Plan', `Pro ${plan}`],
    ['Store', a.store === 'apple' ? 'App Store (iPhone or iPad)' : 'Google Play (Android)'],
    ['Type', a.kind === 'paid' ? 'Paid' : 'Free trial (the store charges when it ends)'],
    [a.kind === 'paid' ? 'Price' : 'Price after trial', price ?? 'Not given by the store'],
    ['Offer', offerText(a)],
    ['When', at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
    ...(a.sandbox ? [['Note', 'Store test account (Sandbox). No real money.'] as [string, string]] : []),
  ];
  const link = rider.userId ? `https://onmylead.com/admin/users/${rider.userId}` : 'https://onmylead.com/admin/subscriptions';
  const linkLabel = rider.userId ? 'Open this rider on the Admin Dashboard' : 'Open Subscriptions on the Admin Dashboard (not linked to an account yet)';
  const text = `${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${linkLabel}: ${link}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0A1626">
<div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 16px;font-size:18px;line-height:24px;font-weight:700">${esc(subject)}</p>
<table style="border-collapse:collapse;font-size:14px;line-height:20px;margin:0 0 18px">
${facts.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#5F7190;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${esc(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:0;font-size:14px"><a href="${esc(link)}" style="color:#E5262E">${esc(linkLabel)}</a></p>
</div></body></html>`;
  return { subject, text, html };
}
