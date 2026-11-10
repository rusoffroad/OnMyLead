// Ad conversion events from the iPhone, iPad and Android apps (lib/ad-tracking.ts): an install, a
// sign-up, a trial start or a Pro purchase, forwarded to Meta's Conversions API and TikTok's Events
// API so those ads can be measured. Google's in-app conversions need Firebase in the app and are
// not sent here (docs/feature-parity.md, Exceptions). The website uses the pixels directly.
//
// The phone only calls this after the rider allowed it (Apple's App Tracking Transparency prompt,
// or Android's Ad Measurement switch); this function refuses an iPhone event without that.
// What is sent: the event, its time, a purchase's price, the advertising ID, and the phone's IP
// address and user agent. Never location, rides, messages, names or email addresses.
//
// Works before sign-in (the first-open event), so JWT verification is OFF for this function.
// Each network is skipped while its secrets are missing, so this is safe to deploy before the
// ids exist; the reply says which networks took the event.
//
// Deploy:  supabase functions deploy ad-conversions --no-verify-jwt
// Secrets: META_DATASET_ID       Meta Pixel / dataset id linked to the OnMyLead Meta app
//          META_CAPI_TOKEN       Conversions API access token (Events Manager > Settings)
//          TIKTOK_IOS_APP_ID     TikTok App ID of the iPhone app (Events Manager > the app > Copy the TikTok App ID)
//          TIKTOK_ANDROID_APP_ID TikTok App ID of the Android app (TikTok gives each store listing its own)
//          TIKTOK_APP_ID         older single id, used for a platform whose own id isn't set
//          TIKTOK_IOS_EVENTS_TOKEN     Events API token made under the iPhone app (TikTok scopes a token to one data source)
//          TIKTOK_ANDROID_EVENTS_TOKEN Events API token made under the Android app
//          TIKTOK_EVENTS_TOKEN   older single token, used for a platform whose own token isn't set
//          META_TEST_EVENT_CODE, TIKTOK_TEST_EVENT_CODE   optional, while checking in each Test Events page
import { metaAppPayload, parseAdEventBody, tiktokAppIdFor, tiktokAppPayload, tiktokTokenFor } from '../_shared/ad-conversions.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const META_API = 'https://graph.facebook.com/v21.0';
const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

/** Cheap per-IP limit for one warm instance: an install sends a handful of events, not hundreds. */
const recent = new Map<string, number[]>();
function limited(ip: string, now = Date.now()): boolean {
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return list.length > 30;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const ua = req.headers.get('user-agent');
  if (ip && limited(ip)) return Response.json({ error: 'slow_down' }, { status: 429 });
  const body = parseAdEventBody(await req.json().catch(() => null));
  if (!body) return Response.json({ error: 'invalid' }, { status: 400 });

  const sent: string[] = [];
  const jobs: Promise<void>[] = [];
  const dataset = env('META_DATASET_ID');
  const metaToken = env('META_CAPI_TOKEN');
  if (dataset && metaToken) {
    jobs.push(
      fetch(`${META_API}/${encodeURIComponent(dataset)}/events?access_token=${encodeURIComponent(metaToken)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(metaAppPayload(body, ip, ua, env('META_TEST_EVENT_CODE') || undefined)),
      }).then(async (r) => {
        if (r.ok) sent.push('meta');
        else console.warn('meta', r.status, (await r.text()).slice(0, 300));
      }, (e) => console.warn('meta', String(e))),
    );
  }
  const ttApp = tiktokAppIdFor(body.platform, env);
  const ttToken = tiktokTokenFor(body.platform, env);
  if (ttApp && ttToken) {
    jobs.push(
      fetch(TIKTOK_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Access-Token': ttToken },
        body: JSON.stringify(tiktokAppPayload(body, ttApp, ip, ua, env('TIKTOK_TEST_EVENT_CODE') || undefined)),
      }).then(async (r) => {
        const j = await r.json().catch(() => null);
        if (r.ok && j?.code === 0) sent.push('tiktok');
        else console.warn('tiktok', r.status, JSON.stringify(j).slice(0, 300));
      }, (e) => console.warn('tiktok', String(e))),
    );
  }
  await Promise.all(jobs);
  return Response.json({ ok: true, sent });
});
