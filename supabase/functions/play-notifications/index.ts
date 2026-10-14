// Google Play Real-time Developer Notifications: Google posts here (through a Pub/Sub push
// subscription) on every purchase, renewal, cancellation, payment problem, grace period, hold,
// pause, revoke, expiry and refund, including ones that happen while the app is closed.
//
// Set up once (Google Cloud and Play Console, on Chris's OK):
//   1. Pub/Sub topic, e.g. projects/<project>/topics/onmylead-play, with
//      google-play-developer-notifications@system.gserviceaccount.com as a Publisher.
//   2. A push subscription on that topic to
//      https://<project-ref>.supabase.co/functions/v1/play-notifications?token=<PLAY_RTDN_TOKEN>
//   3. Play Console > OnMyLead > Monetization setup > Real-time developer notifications: the topic.
//
// POST { message: { data: base64(DeveloperNotification), messageId }, subscription } from Pub/Sub.
// No Supabase JWT. The token in the URL keeps strangers out, and nothing in a notification is
// trusted: each one only names a purchase token, and the state comes from the Google Play
// Developer API. Each message is stored once in play_events by message id; a repeat of one already
// handled returns 200 without doing anything, and one that failed is tried again.
// 2xx tells Pub/Sub it's handled; anything else makes it retry later.
//
// Deploy:  supabase functions deploy play-notifications --no-verify-jwt
// Secrets: see ../_shared/google-play.ts
import { accountUserId, parseRtdn, playOrder, playRow, proLineItem } from '../_shared/play-status.ts';
import { acknowledge, db, getSubscription, PACKAGE_NAME, PLAY_ENVIRONMENTS, PlayNotFound, savePlay } from '../_shared/google-play.ts';

const expected = Deno.env.get('PLAY_RTDN_TOKEN') ?? '';

/** Compares without stopping at the first different character. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!expected || !same(new URL(req.url).searchParams.get('token') ?? '', expected)) return new Response('unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  const note = parseRtdn(body);
  // A message that can never be read: say it's handled so Pub/Sub stops retrying.
  if (!note) return new Response('ignored', { status: 200 });
  if (note.packageName !== PACKAGE_NAME) return new Response('ignored', { status: 200 });

  const { data: seen, error: seenError } = await db.from('play_events').select('id, error').eq('message_id', note.messageId).maybeSingle();
  if (seenError) return new Response('retry', { status: 500 });
  if (seen && !seen.error) return new Response('already handled', { status: 200 });

  const event = {
    message_id: note.messageId,
    notification_type: note.kind === 'subscription' ? note.notificationType : null,
    type: note.kind === 'subscription' ? note.type : note.kind === 'voided' ? 'VOIDED_PURCHASE' : note.kind === 'test' ? 'TEST' : 'OTHER',
    purchase_token: note.kind === 'subscription' || note.kind === 'voided' ? note.purchaseToken : null,
    order_id: note.kind === 'voided' ? note.orderId : null as string | null,
    payload: { eventTime: note.eventTime, ...(note.kind === 'voided' ? { refundType: note.refundType, productType: note.productType } : {}) } as Record<string, unknown>,
    error: null as string | null,
  };

  try {
    if (note.kind === 'subscription') {
      const sub = await getSubscription(note.purchaseToken);
      if (proLineItem(sub)) {
        const now = Date.now();
        const row = playRow(note.purchaseToken, sub, now);
        event.order_id = row.latest_order_id;
        event.payload = { ...event.payload, status: row.status, environment: row.environment, product_id: row.product_id };
        if (PLAY_ENVIRONMENTS.has(row.environment)) {
          await savePlay(row, accountUserId(sub), false, playOrder(sub, now));
          if (!row.acknowledged && row.status !== 'pending') await acknowledge(row.product_id, note.purchaseToken);
        }
      }
    } else if (note.kind === 'voided') {
      // Subscriptions are product type 1; one-time products aren't sold.
      if (note.productType === null || note.productType === 1) {
        const { error } = await db.rpc('play_refund_order', { p_order_id: note.orderId, p_purchase_token: note.purchaseToken });
        if (error) throw new Error(error.message);
      }
    }
  } catch (e) {
    // A token Google doesn't know will never work; keep the record but don't retry it.
    if (e instanceof PlayNotFound) event.payload = { ...event.payload, not_found: true };
    else event.error = e instanceof Error ? e.message : String(e);
  }

  const { error: logError } = await db.from('play_events').upsert(event, { onConflict: 'message_id' });
  if (logError) console.error('could not log notification', logError.message);
  if (event.error) {
    console.error('notification failed', note.messageId, event.error);
    return new Response('retry', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
