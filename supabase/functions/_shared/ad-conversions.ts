// Ad conversion events from the phone apps, forwarded by the ad-conversions edge function to Meta's
// Conversions API and TikTok's Events API. Pure, so vitest (app/src/core/__tests__/ad-tracking.test.ts)
// and the Deno function run the same file. The app-side rules are in app/src/core/ad-tracking.ts.
//
// Only the event, its time, a purchase's price and the advertising ID the rider allowed are sent,
// with the phone's IP address and user agent (Meta and TikTok match on those). Never location,
// rides, messages, names or email addresses.

export type AdEvent = 'first_open' | 'sign_up' | 'start_trial' | 'subscribe';
export type AdConsent = 'granted' | 'denied' | 'undetermined';
const AD_EVENTS: AdEvent[] = ['first_open', 'sign_up', 'start_trial', 'subscribe'];
const isAdEvent = (v: unknown): v is AdEvent => typeof v === 'string' && (AD_EVENTS as string[]).includes(v);

/** Meta's app-event names (Conversions API for app events). */
export const META_APP_EVENT: Record<AdEvent, string> = {
  first_open: 'fb_mobile_activate_app',
  sign_up: 'fb_mobile_complete_registration',
  start_trial: 'StartTrial',
  subscribe: 'Subscribe',
};

/** TikTok's standard event names. */
export const TIKTOK_EVENT: Record<AdEvent, string> = {
  first_open: 'InstallApp',
  sign_up: 'CompleteRegistration',
  start_trial: 'StartTrial',
  subscribe: 'Subscribe',
};

/** An advertising ID of all zeros means the rider (or the phone) has switched it off. */
export function usableAdId(id: string | null | undefined): string | null {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  if (!/^[0-9a-f-]{32,36}$/.test(clean)) return null;
  return /^[0-]+$/.test(clean) ? null : clean;
}

export type AdEventBody = {
  event: AdEvent;
  event_id: string;
  platform: 'ios' | 'android';
  ad_id: string;
  att: AdConsent;
  app_version: string;
  os_version: string;
  device_model: string;
  value?: number;
  currency?: string;
  event_time?: number;
};

/** Cleans what a phone sent; null if it isn't a valid event. */
export function parseAdEventBody(raw: unknown, nowSec = Math.floor(Date.now() / 1000)): AdEventBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (!isAdEvent(b.event)) return null;
  if (b.platform !== 'ios' && b.platform !== 'android') return null;
  const adId = usableAdId(s(b.ad_id, 40));
  if (!adId) return null;
  const att = b.att === 'granted' || b.att === 'denied' ? b.att : 'undetermined';
  if (b.platform === 'ios' && att !== 'granted') return null;
  const eid = s(b.event_id, 100);
  if (!eid) return null;
  const value = typeof b.value === 'number' && Number.isFinite(b.value) && b.value >= 0 && b.value < 1000 ? Math.round(b.value * 100) / 100 : undefined;
  const t = typeof b.event_time === 'number' && Number.isFinite(b.event_time) ? Math.floor(b.event_time) : nowSec;
  // Meta takes events up to 7 days old; anything older or from the future is sent as now.
  const event_time = t > nowSec || nowSec - t > 6 * 86_400 ? nowSec : t;
  return {
    event: b.event,
    event_id: eid,
    platform: b.platform,
    ad_id: adId,
    att,
    app_version: s(b.app_version, 20) || '0',
    os_version: s(b.os_version, 20) || '0',
    device_model: s(b.device_model, 40),
    ...(value !== undefined ? { value, currency: /^[A-Z]{3}$/.test(s(b.currency, 3)) ? s(b.currency, 3) : 'USD' } : {}),
    event_time,
  };
}

export const APP_BUNDLE_ID = 'com.rusoffroad.onmylead.app';

/** Meta Conversions API, app event (POST graph.facebook.com/<version>/<dataset id>/events). */
export function metaAppPayload(e: AdEventBody, ip: string | null, userAgent: string | null, testCode?: string) {
  const ios = e.platform === 'ios';
  // Meta's "extinfo" array: platform, app package, short and long version, OS version, device model,
  // locale, timezone abbreviation, carrier, screen width/height/density, cores, storage, free storage, timezone.
  const extinfo = [ios ? 'i2' : 'a2', APP_BUNDLE_ID, e.app_version, e.app_version, e.os_version, e.device_model, 'en_US', '', '', '', '', '', '', '', '', ''];
  return {
    data: [
      {
        event_name: META_APP_EVENT[e.event],
        event_time: e.event_time,
        event_id: e.event_id,
        action_source: 'app',
        user_data: {
          madid: e.ad_id,
          ...(ip ? { client_ip_address: ip } : {}),
          ...(userAgent ? { client_user_agent: userAgent } : {}),
        },
        app_data: {
          advertiser_tracking_enabled: 1,
          application_tracking_enabled: 1,
          extinfo,
        },
        ...(e.value !== undefined ? { custom_data: { value: e.value, currency: e.currency ?? 'USD' } } : {}),
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };
}

/** TikTok gives the iPhone and Android listings separate App IDs; TIKTOK_APP_ID is the older single one. */
export function tiktokAppIdFor(platform: string, env: (k: string) => string): string {
  const own = env(platform === 'ios' ? 'TIKTOK_IOS_APP_ID' : 'TIKTOK_ANDROID_APP_ID');
  return own || env('TIKTOK_APP_ID');
}

/** TikTok scopes an Events API token to one data source, so each app has its own; TIKTOK_EVENTS_TOKEN is the older single one. */
export function tiktokTokenFor(platform: string, env: (k: string) => string): string {
  const own = env(platform === 'ios' ? 'TIKTOK_IOS_EVENTS_TOKEN' : 'TIKTOK_ANDROID_EVENTS_TOKEN');
  return own || env('TIKTOK_EVENTS_TOKEN');
}

/** TikTok Events API 2.0, app event (POST business-api.tiktok.com/open_api/v1.3/event/track/). */
export function tiktokAppPayload(e: AdEventBody, tiktokAppId: string, ip: string | null, userAgent: string | null, testCode?: string) {
  const ios = e.platform === 'ios';
  return {
    event_source: 'app',
    event_source_id: tiktokAppId,
    ...(testCode ? { test_event_code: testCode } : {}),
    data: [
      {
        event: TIKTOK_EVENT[e.event],
        event_time: e.event_time,
        event_id: e.event_id,
        user: {
          ...(ios ? { idfa: e.ad_id, att_status: 'AUTHORIZED' } : { gaid: e.ad_id }),
          ...(ip ? { ip } : {}),
          ...(userAgent ? { user_agent: userAgent } : {}),
        },
        app: { app_id: ios ? '6822352321' : APP_BUNDLE_ID, app_name: 'OnMyLead', app_version: e.app_version },
        device: { platform: ios ? 'iOS' : 'Android' },
        ...(e.value !== undefined ? { properties: { value: e.value, currency: e.currency ?? 'USD' } } : {}),
      },
    ],
  };
}
