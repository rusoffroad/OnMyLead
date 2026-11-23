// Emails the owner when a rider starts a store free trial of Pro or pays for Pro for the first
// time (what counts is decided in pro-alert.ts). Called by appstore-verify, appstore-notifications,
// play-verify and play-notifications right after they save a subscription. It never throws: a
// purchase is always handled even when the email can't go out.
//
// pro_signup_alerts holds one row per subscription and kind, claimed before sending, so the app's
// sync and the store's notification racing each other still send one email. A failed send gives
// the claim back so the next update from the store tries again.
//
// Secrets: RESEND_API_KEY      the same Resend key the contact form uses
//          PRO_ALERTS_TO       where the emails go (comma separated); without it, CONTACT_TO
//          EMAIL_FROM          optional sender, default "OnMyLead <rides@onmylead.com>"
//          PRO_ALERTS_SANDBOX  "on" to also email store test purchases (Sandbox, Play license testers)
//          PRO_ALERTS_WEBHOOK  optional https URL that also gets each alert as JSON (POST), for a push
//                              notification from another app; PRO_ALERTS_WEBHOOK_TOKEN is sent as
//                              its Bearer token when set. The email still goes out either way.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { proAlertEmail, proAlertPush, type AlertRider, type ProAlert } from './pro-alert.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

async function rider(db: SupabaseClient, a: ProAlert): Promise<AlertRider> {
  const table = a.store === 'apple' ? 'app_store_subscriptions' : 'play_subscriptions';
  const key = a.store === 'apple' ? 'original_transaction_id' : 'purchase_token';
  const { data: sub } = await db.from(table).select('user_id').eq(key, a.subscriptionId).maybeSingle();
  const userId: string | null = sub?.user_id ?? null;
  if (!userId) return { userId: null, name: null, email: null };
  const [{ data: profile }, { data: auth }] = await Promise.all([
    db.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    db.auth.admin.getUserById(userId),
  ]);
  return { userId, name: profile?.display_name || null, email: auth?.user?.email ?? null };
}

export async function sendProAlert(db: SupabaseClient, alert: ProAlert | null): Promise<void> {
  try {
    if (!alert) return;
    if (alert.sandbox && env('PRO_ALERTS_SANDBOX').toLowerCase() !== 'on') return;
    const key = env('RESEND_API_KEY');
    const to = (env('PRO_ALERTS_TO') || env('CONTACT_TO')).split(',').map((s) => s.trim()).filter(Boolean);
    const hook = env('PRO_ALERTS_WEBHOOK');
    if ((!key || !to.length) && !hook.startsWith('https://')) return;

    const claim = { store: alert.store, subscription_id: alert.subscriptionId, kind: alert.kind };
    const { data: claimed, error } = await db.from('pro_signup_alerts')
      .upsert(claim, { onConflict: 'store,subscription_id,kind', ignoreDuplicates: true })
      .select('store');
    // Table missing (migration not applied yet) or already sent: nothing to do.
    if (error || !claimed?.length) return;

    const who = await rider(db, alert);
    const mail = proAlertEmail(alert, who, new Date());
    const sends: Promise<boolean>[] = [];
    if (key && to.length) {
      sends.push(fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env('EMAIL_FROM') || 'OnMyLead <rides@onmylead.com>', to, ...mail }),
        signal: AbortSignal.timeout(10_000),
      }).then((r) => r.ok, () => false));
    }
    if (hook.startsWith('https://')) {
      const token = env('PRO_ALERTS_WEBHOOK_TOKEN');
      sends.push(fetch(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(proAlertPush(alert, who, mail.subject)),
        signal: AbortSignal.timeout(10_000),
      }).then((r) => r.ok, () => false));
    }
    const sent = await Promise.all(sends);
    // Nothing reached Chris: give the claim back so the store's next update tries again.
    if (!sent.some(Boolean)) {
      console.error('Pro alert not delivered');
      await db.from('pro_signup_alerts').delete().match(claim);
    }
  } catch (e) {
    console.error('Pro alert failed', e instanceof Error ? e.message : e);
  }
}
