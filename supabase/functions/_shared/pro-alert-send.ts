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
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { proAlertEmail, type AlertRider, type ProAlert } from './pro-alert.ts';

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
    if (!key || !to.length) return;

    const claim = { store: alert.store, subscription_id: alert.subscriptionId, kind: alert.kind };
    const { data: claimed, error } = await db.from('pro_signup_alerts')
      .upsert(claim, { onConflict: 'store,subscription_id,kind', ignoreDuplicates: true })
      .select('store');
    // Table missing (migration not applied yet) or already sent: nothing to do.
    if (error || !claimed?.length) return;

    const who = await rider(db, alert);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM') || 'OnMyLead <rides@onmylead.com>', to, ...proAlertEmail(alert, who, new Date()) }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) {
      console.error('Pro alert email failed', res?.status ?? 'no answer');
      await db.from('pro_signup_alerts').delete().match(claim);
    }
  } catch (e) {
    console.error('Pro alert failed', e instanceof Error ? e.message : e);
  }
}
