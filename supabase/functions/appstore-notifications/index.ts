// App Store Server Notifications V2: Apple posts here on every renewal, expiry, billing problem,
// grace period, refund, revocation, offer-code redemption and plan change, including ones that
// happen while the app is closed. Set this function's URL as both the Production and Sandbox
// notification URL in App Store Connect (Version 2).
//
// POST { signedPayload: "<JWS>" } from Apple. No Supabase JWT: Apple's signature is the check.
// Each notification is stored once in app_store_events by notification_uuid; a repeat of one
// already handled returns 200 without doing anything, and one that failed is tried again.
// 200 tells Apple it's handled; anything else makes Apple retry later.
//
// Deploy:  supabase functions deploy appstore-notifications --no-verify-jwt
// Secrets: see ../_shared/apple.ts
import { PRO_PRODUCT_IDS, peekJws, subscriptionRow, type AppleRenewalInfo } from '../_shared/appstore-status.ts';
import { db, saveSubscription, verifierFor, type AppleNotification } from '../_shared/apple.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => null);
  const signed = input?.signedPayload;
  if (typeof signed !== 'string' || signed.length > 100_000) return new Response('bad request', { status: 400 });

  // deno-lint-ignore no-explicit-any
  const peek = peekJws(signed) as any;
  const environment = peek?.data?.environment ?? peek?.summary?.environment;
  const verifier = verifierFor(environment);
  // Not an environment this server accepts: say it's handled so Apple stops retrying.
  if (!verifier) return new Response('ignored', { status: 200 });

  let note: AppleNotification;
  try {
    note = await verifier.notification(signed);
  } catch (e) {
    console.error('notification not verified', e instanceof Error ? e.message : e);
    return new Response('unverified', { status: 400 });
  }

  const uuid = note.notificationUUID;
  if (!uuid) return new Response('bad request', { status: 400 });
  const { data: seen, error: seenError } = await db
    .from('app_store_events')
    .select('id, error')
    .eq('notification_uuid', uuid)
    .maybeSingle();
  if (seenError) return new Response('retry', { status: 500 });
  if (seen && !seen.error) return new Response('already handled', { status: 200 });

  const event = {
    notification_uuid: uuid,
    type: String(note.notificationType ?? ''),
    subtype: note.subtype ? String(note.subtype) : null,
    original_transaction_id: null as string | null,
    payload: { notificationType: note.notificationType, subtype: note.subtype, signedDate: note.signedDate } as Record<string, unknown>,
    error: null as string | null,
  };

  try {
    const data = note.data;
    if (data?.signedTransactionInfo) {
      const transaction = await verifier.transaction(data.signedTransactionInfo);
      const renewal: AppleRenewalInfo | null = data.signedRenewalInfo ? await verifier.renewal(data.signedRenewalInfo) : null;
      event.original_transaction_id = transaction.originalTransactionId ?? null;
      event.payload = { ...event.payload, transaction, renewal };
      if (transaction.productId && PRO_PRODUCT_IDS.includes(transaction.productId)) {
        const row = subscriptionRow({
          transaction,
          renewal,
          // Apple's own status code, sent with every V2 subscription notification.
          appleStatus: typeof data.status === 'number' ? data.status : null,
          notificationType: event.type,
          now: Date.now(),
        });
        // The notification's own signing time orders it against everything else stored.
        if (note.signedDate) row.last_signed_at = new Date(note.signedDate).toISOString();
        await saveSubscription(row, { accountToken: transaction.appAccountToken });
      }
    }
  } catch (e) {
    event.error = e instanceof Error ? e.message : String(e);
  }

  const { error: logError } = await db.from('app_store_events').upsert(event, { onConflict: 'notification_uuid' });
  if (logError) console.error('could not log notification', logError.message);
  if (event.error) {
    console.error('notification failed', uuid, event.error);
    return new Response('retry', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
