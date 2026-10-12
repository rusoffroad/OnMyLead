// The app calls this after a purchase, a restore or an offer-code redemption, with the signed
// StoreKit 2 transaction. Pro is only ever granted from what this function (or
// appstore-notifications) has verified against Apple's signature chain; the app's own word
// counts for nothing.
//
// POST { signedTransaction: "<JWS>" } with the rider's Supabase session (JWT verified by Supabase).
// 200 { verified: true, status, productId, expiresAt, entitlements } where entitlements is
//     my_entitlements() for the caller, or null if the Pro migration isn't applied yet.
// 400 { error: 'bad_request' | 'unverified' | 'wrong_environment' | 'unknown_product' }
// 401 { error: 'signed_out' }
// 503 { error: 'retry' }  the subscription couldn't be saved; the app tries again later.
//
// The subscription is linked to the account that verifies it, so a restore on another account
// moves Pro there (one Apple subscription, one OnMyLead account at a time).
//
// Deploy:  supabase functions deploy appstore-verify
// Secrets: see ../_shared/apple.ts
import {
  PRO_PRODUCT_IDS,
  peekJws,
  subscriptionRow,
  type AppleTransaction,
} from '../_shared/appstore-status.ts';
import { asUser, db, liveStatus, saveSubscription, verifierFor } from '../_shared/apple.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: 'signed_out' }, 401);

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => null);
  const jws = input?.signedTransaction;
  if (typeof jws !== 'string' || jws.length > 20_000) return json({ error: 'bad_request' }, 400);

  const environment = peekJws(jws)?.environment;
  const verifier = verifierFor(environment);
  if (!verifier) return json({ error: 'wrong_environment' }, 400);

  let transaction: AppleTransaction;
  try {
    transaction = await verifier.transaction(jws);
  } catch (e) {
    console.error('transaction not verified', e instanceof Error ? e.message : e);
    return json({ error: 'unverified' }, 400);
  }
  if (!transaction.productId || !PRO_PRODUCT_IDS.includes(transaction.productId) || !transaction.originalTransactionId) {
    return json({ error: 'unknown_product' }, 400);
  }

  const now = Date.now();
  const live = await liveStatus(transaction.originalTransactionId, verifier);
  const row = live
    ? subscriptionRow({ transaction: live.transaction, renewal: live.renewal, appleStatus: live.appleStatus, now })
    : subscriptionRow({ transaction, now });

  try {
    await saveSubscription(row, { userId: user.id });
    await db.from('app_store_events').insert({
      type: 'APP_VERIFY',
      subtype: live ? 'LIVE_STATUS' : 'TRANSACTION',
      original_transaction_id: row.original_transaction_id,
      payload: { user_id: user.id, transaction_id: transaction.transactionId, status: row.status, environment },
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
