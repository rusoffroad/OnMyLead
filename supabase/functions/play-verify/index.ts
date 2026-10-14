// The Android app calls this after a Google Play purchase, a restore or a promo code, with the
// purchase token Google Play Billing gave it. Pro is only ever granted from what this function
// (or play-notifications) read from the Google Play Developer API; the app's own word counts for
// nothing.
//
// POST { purchaseToken: "<token>", productId?: "<sku>" } with the rider's Supabase session.
// 200 { verified: true, status, productId, expiresAt, entitlements } where entitlements is
//     my_entitlements() for the caller.
// 400 { error: 'bad_request' | 'unverified' | 'wrong_environment' | 'unknown_product' }
// 401 { error: 'signed_out' }
// 503 { error: 'retry' }  Google couldn't be asked or the subscription couldn't be saved; the app
//                         keeps the purchase and tries again on a later launch.
//
// The subscription is linked to the account that verifies it, so a restore on another account
// moves Pro there (one Google Play subscription, one OnMyLead account at a time), the same as
// appstore-verify. New purchases are acknowledged here so Google never refunds them for being
// left unacknowledged, even if the app closes before it finishes the purchase.
//
// Deploy:  supabase functions deploy play-verify
// Secrets: see ../_shared/google-play.ts
import { playOrder, playRow, proLineItem } from '../_shared/play-status.ts';
import { acknowledge, asUser, db, getSubscription, PLAY_ENVIRONMENTS, PlayNotFound, playConfigured, savePlay } from '../_shared/google-play.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: 'signed_out' }, 401);

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => null);
  const token = input?.purchaseToken;
  if (typeof token !== 'string' || !token || token.length > 4096) return json({ error: 'bad_request' }, 400);
  if (!playConfigured()) {
    console.error('PLAY_SERVICE_ACCOUNT_JSON is not set');
    return json({ error: 'retry' }, 503);
  }

  let sub;
  try {
    sub = await getSubscription(token);
  } catch (e) {
    console.error('Google Play lookup failed', e instanceof Error ? e.message : e);
    return e instanceof PlayNotFound ? json({ error: 'unverified' }, 400) : json({ error: 'retry' }, 503);
  }
  if (!proLineItem(sub)) return json({ error: 'unknown_product' }, 400);

  const now = Date.now();
  const row = playRow(token, sub, now);
  if (!PLAY_ENVIRONMENTS.has(row.environment)) return json({ error: 'wrong_environment' }, 400);

  try {
    await savePlay(row, user.id, true, playOrder(sub, now));
    if (!row.acknowledged && row.status !== 'pending') {
      await acknowledge(row.product_id, token).catch((e) => console.error('acknowledge failed', e instanceof Error ? e.message : e));
    }
    // A rider who also pays Apple: Pro is the same either way, but the Admin should see it.
    const { data: apple } = await db.from('app_store_subscriptions').select('original_transaction_id')
      .eq('user_id', user.id).in('status', ['active', 'grace', 'billing_retry']).gt('expires_at', new Date(now).toISOString()).limit(1);
    await db.from('play_events').insert({
      type: apple?.length ? 'APP_VERIFY_BOTH_STORES' : 'APP_VERIFY',
      purchase_token: token,
      order_id: row.latest_order_id,
      payload: { user_id: user.id, status: row.status, environment: row.environment, product_id: row.product_id },
    });
  } catch (e) {
    console.error('could not save subscription', e instanceof Error ? e.message : e);
    return json({ error: 'retry' }, 503);
  }

  const { data: entitlements, error } = await asUser(jwt).rpc('my_entitlements');
  return json({
    verified: true,
    status: row.status,
    productId: row.product_id,
    expiresAt: row.expires_at,
    entitlements: error ? null : entitlements,
  });
});
