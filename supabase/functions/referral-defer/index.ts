// Refer a friend, for a rider who already pays for Pro through Google Play: Play's 50%-off offer
// only works on a new purchase, so their reward pushes the next bill back about 6 months instead
// (the same value as half off a year). The app calls this after claim_referral_reward('google')
// answered { kind: 'google_defer' } (migration 20261103800000_referrals.sql).
//
// POST {} with the rider's Supabase session.
// 200 { deferred: true, expiresAt }   done now, or done before (the same answer again)
// 400 { error: 'no_reward' }          no Google Play deferral reward to apply
// 401 { error: 'signed_out' }
// 503 { error: 'retry' }              Google couldn't be asked; the app offers to try again
//
// Deploy:  supabase functions deploy referral-defer
// Secrets: the same as play-verify (../_shared/google-play.ts).
import { proLineItem } from '../_shared/play-status.ts';
import { db, deferSubscription, getSubscription, playConfigured } from '../_shared/google-play.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const DAY = 86_400_000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: 'signed_out' }, 401);

  const { data: target, error } = await db.rpc('referral_defer_target', { p_user: user.id });
  if (error) {
    console.error('referral_defer_target failed', error.message);
    return json({ error: 'retry' }, 503);
  }
  if (!target) return json({ error: 'no_reward' }, 400);
  if (target.redeemed_at) return json({ deferred: true, expiresAt: target.expires_at });
  if (!target.purchase_token || !target.product_id) return json({ error: 'no_reward' }, 400);
  if (!playConfigured()) {
    console.error('PLAY_SERVICE_ACCOUNT_JSON is not set');
    return json({ error: 'retry' }, 503);
  }

  // Google needs the subscription's current expiry, so read it fresh rather than trusting ours.
  let current: number;
  try {
    current = Date.parse(proLineItem(await getSubscription(target.purchase_token))?.expiryTime ?? '');
  } catch (e) {
    console.error('Google Play subscription read failed', e instanceof Error ? e.message : e);
    return json({ error: 'retry' }, 503);
  }
  if (!Number.isFinite(current)) return json({ error: 'no_reward' }, 400);
  const days = Number(target.defer_days) || 182;
  const known = Date.parse(target.expires_at ?? '');

  // Reserve the reward before asking Google, so a retry after a half-finished call can't defer the
  // same subscription twice. A reward already reserved means an earlier call got no answer from
  // Google: if the subscription now ends later than we last knew, that call went through.
  if (target.deferred_at) {
    if (Number.isFinite(known) && current > known) return await confirm(user.id, target.purchase_token, known, current);
  } else {
    const { error: reserveError } = await db.rpc('referral_reserve_deferral', { p_user: user.id });
    if (reserveError) {
      console.error('referral_reserve_deferral failed', reserveError.message);
      return json({ error: 'retry' }, 503);
    }
  }
  let next: number;
  try {
    next = await deferSubscription(target.product_id, target.purchase_token, current, current + days * DAY);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Google Play deferral failed', message);
    if (/^Google Play defer \d+$/.test(message)) {
      // Google answered no: nothing moved, so the reward goes back for another try.
      const { error: undoError } = await db.rpc('referral_unmark_deferred', { p_user: user.id });
      if (undoError) console.error('referral_unmark_deferred failed', undoError.message);
      return json({ error: 'retry' }, 503);
    }
    // No answer (timeout, dropped connection): Google may have deferred anyway. Its subscription says.
    let moved: number | null = null;
    try {
      const again = Date.parse(proLineItem(await getSubscription(target.purchase_token))?.expiryTime ?? '');
      if (Number.isFinite(again) && again > current) moved = again;
    } catch {
      // Still no answer: the reward stays reserved, and the next call settles it the same way.
    }
    if (moved == null) return json({ error: 'retry' }, 503);
    next = moved;
  }
  return await confirm(user.id, target.purchase_token, current, next);
});

/** Records Google's new expiry on the reward and the subscription, and logs the deferral. */
async function confirm(userId: string, purchaseToken: string, fromMs: number, toMs: number): Promise<Response> {
  const expiresAt = new Date(toMs).toISOString();
  const { error: saveError } = await db.rpc('referral_mark_deferred', { p_user: userId, p_new_expiry: expiresAt });
  if (saveError) {
    console.error('referral_mark_deferred failed', saveError.message);
    return json({ error: 'retry' }, 503);
  }
  await db.from('play_events').insert({
    type: 'REFERRAL_DEFER',
    purchase_token: purchaseToken,
    payload: { user_id: userId, from: new Date(fromMs).toISOString(), to: expiresAt },
  });
  return json({ deferred: true, expiresAt });
}
