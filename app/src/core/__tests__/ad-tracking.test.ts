import { describe, expect, it } from 'vitest';

import {
  eventId,
  googleLabels,
  isFreshTrial,
  isNewAccount,
  maySend,
  parseWebAdChoice,
  purchaseValue,
  showWebAdNotice,
  usableAdId,
  webAdIds,
  webAdsAllowed,
} from '../ad-tracking';
import {
  META_APP_EVENT,
  metaAppPayload,
  parseAdEventBody,
  TIKTOK_EVENT,
  tiktokAppPayload,
} from '../../../../supabase/functions/_shared/ad-conversions';

const IDFA = '6D92078A-8246-4BA4-AE5B-76104861E7DC';
const NOW = Date.parse('2026-11-10T12:00:00Z');

describe('advertising id', () => {
  it('keeps a real id, lower case', () => {
    expect(usableAdId(IDFA)).toBe(IDFA.toLowerCase());
  });
  it('treats all zeros (tracking off) and junk as no id', () => {
    expect(usableAdId('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(usableAdId('')).toBeNull();
    expect(usableAdId(null)).toBeNull();
    expect(usableAdId('not-an-id')).toBeNull();
  });
});

describe('who may send', () => {
  it('iPhone and iPad only after Allow on the ATT prompt', () => {
    expect(maySend('ios', 'granted', IDFA, false)).toBe(true);
    expect(maySend('ios', 'denied', IDFA, true)).toBe(false);
    expect(maySend('ios', 'undetermined', IDFA, true)).toBe(false);
    expect(maySend('ios', 'granted', '00000000-0000-0000-0000-000000000000', true)).toBe(false);
  });
  it('Android follows the Ad Measurement switch and a live advertising id', () => {
    expect(maySend('android', 'undetermined', IDFA, true)).toBe(true);
    expect(maySend('android', 'undetermined', IDFA, false)).toBe(false);
    expect(maySend('android', 'undetermined', null, true)).toBe(false);
  });
  it('never from the website path (pixels there have their own consent)', () => {
    expect(maySend('web', 'granted', IDFA, true)).toBe(false);
  });
});

describe('events', () => {
  it('prices a purchase by plan', () => {
    expect(purchaseValue('com.rusoffroad.onmylead.pro.annual', { monthly: 4.99, annual: 29.99 })).toBe(29.99);
    expect(purchaseValue('com.rusoffroad.onmylead.pro.monthly', { monthly: 4.99, annual: 29.99 })).toBe(4.99);
  });
  it('a sign-up is an account made in the last 30 minutes', () => {
    expect(isNewAccount('2026-11-10T11:50:00Z', NOW)).toBe(true);
    expect(isNewAccount('2026-11-10T11:00:00Z', NOW)).toBe(false);
    expect(isNewAccount(null, NOW)).toBe(false);
    expect(isNewAccount('garbage', NOW)).toBe(false);
  });
  it('a trial start is a trial that began in the last two days', () => {
    expect(isFreshTrial('trial', '2026-12-10T10:00:00Z', NOW)).toBe(true);
    expect(isFreshTrial('trial', '2026-12-01T10:00:00Z', NOW)).toBe(false);
    expect(isFreshTrial('apple', '2026-12-10T10:00:00Z', NOW)).toBe(false);
    expect(isFreshTrial('trial', '2026-11-01T10:00:00Z', NOW)).toBe(false);
  });
  it('event ids are stable so networks drop repeats', () => {
    expect(eventId('subscribe', 'tx1')).toBe('subscribe:tx1');
    expect(eventId('sign_up', 'x'.repeat(200)).length).toBe(100);
  });
});

describe('ad-conversions edge function input', () => {
  const base = { event: 'subscribe', event_id: 'subscribe:tx1', platform: 'ios', ad_id: IDFA, att: 'granted', app_version: '3.0', os_version: '27.1', device_model: 'iPhone 17', value: 29.99, currency: 'USD', event_time: 1_762_776_000 };
  const nowSec = 1_762_776_100;
  it('takes a valid event', () => {
    const b = parseAdEventBody(base, nowSec)!;
    expect(b.event).toBe('subscribe');
    expect(b.ad_id).toBe(IDFA.toLowerCase());
    expect(b.value).toBe(29.99);
    expect(b.event_time).toBe(1_762_776_000);
  });
  it('refuses an iPhone event without Allow, an unknown event, or no id', () => {
    expect(parseAdEventBody({ ...base, att: 'denied' }, nowSec)).toBeNull();
    expect(parseAdEventBody({ ...base, event: 'page_view' }, nowSec)).toBeNull();
    expect(parseAdEventBody({ ...base, ad_id: '00000000-0000-0000-0000-000000000000' }, nowSec)).toBeNull();
    expect(parseAdEventBody({ ...base, platform: 'web' }, nowSec)).toBeNull();
    expect(parseAdEventBody(null, nowSec)).toBeNull();
  });
  it('lets Android through without ATT', () => {
    expect(parseAdEventBody({ ...base, platform: 'android', att: 'undetermined' }, nowSec)?.platform).toBe('android');
  });
  it('sends old or future times as now, and drops silly values', () => {
    expect(parseAdEventBody({ ...base, event_time: nowSec + 999 }, nowSec)!.event_time).toBe(nowSec);
    expect(parseAdEventBody({ ...base, event_time: nowSec - 8 * 86_400 }, nowSec)!.event_time).toBe(nowSec);
    expect(parseAdEventBody({ ...base, value: -1 }, nowSec)!.value).toBeUndefined();
  });

  it('builds the Meta app event with the advertising id and no personal fields', () => {
    const p = metaAppPayload(parseAdEventBody(base, nowSec)!, '1.2.3.4', 'OnMyLead/3.0', 'TEST1');
    const d = p.data[0];
    expect(d.event_name).toBe(META_APP_EVENT.subscribe);
    expect(d.action_source).toBe('app');
    expect(d.user_data).toEqual({ madid: IDFA.toLowerCase(), client_ip_address: '1.2.3.4', client_user_agent: 'OnMyLead/3.0' });
    expect(d.app_data.advertiser_tracking_enabled).toBe(1);
    expect(d.app_data.extinfo[0]).toBe('i2');
    expect(d.app_data.extinfo).toHaveLength(16);
    expect(d.custom_data).toEqual({ value: 29.99, currency: 'USD' });
    expect(p.test_event_code).toBe('TEST1');
    expect(JSON.stringify(p)).not.toMatch(/email|"lat|"lng|ride_name/);
  });

  it('builds the TikTok app event with IDFA on iPhone and GAID on Android', () => {
    const ios = tiktokAppPayload(parseAdEventBody(base, nowSec)!, 'TTAPP', null, null);
    expect(ios.event_source).toBe('app');
    expect(ios.event_source_id).toBe('TTAPP');
    expect(ios.data[0].event).toBe(TIKTOK_EVENT.subscribe);
    expect(ios.data[0].user).toEqual({ idfa: IDFA.toLowerCase(), att_status: 'AUTHORIZED' });
    const android = tiktokAppPayload(parseAdEventBody({ ...base, platform: 'android' }, nowSec)!, 'TTAPP', null, null);
    expect(android.data[0].user).toEqual({ gaid: IDFA.toLowerCase() });
    expect(android.data[0].app.app_id).toBe('com.rusoffroad.onmylead.app');
  });
});

describe('website pixels', () => {
  const env = { EXPO_PUBLIC_META_PIXEL_ID: '1234567890', EXPO_PUBLIC_GOOGLE_ADS_ID: 'AW-123456789', EXPO_PUBLIC_TIKTOK_PIXEL_ID: 'C4ABCDEFGHIJ12345' };
  it('reads ids from the environment and ignores malformed ones', () => {
    expect(webAdIds(env)).toEqual({ metaPixel: '1234567890', googleTag: 'AW-123456789', tiktokPixel: 'C4ABCDEFGHIJ12345' });
    expect(webAdIds({ EXPO_PUBLIC_META_PIXEL_ID: '<paste>', EXPO_PUBLIC_GOOGLE_ADS_ID: 'G-123' })).toEqual({ metaPixel: null, googleTag: null, tiktokPixel: null });
    expect(googleLabels({ EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: 'AbC-123_x' }).sign_up).toBe('AbC-123_x');
  });
  it('shows the cookie notice only when a pixel is set up and nothing was chosen', () => {
    const ids = webAdIds(env);
    const none = webAdIds({});
    expect(showWebAdNotice(ids, null, false)).toBe(true);
    expect(showWebAdNotice(ids, 'decline', false)).toBe(false);
    expect(showWebAdNotice(none, null, false)).toBe(false);
    expect(showWebAdNotice(ids, null, true)).toBe(false);
  });
  it('loads pixels only after Allow, and never with Global Privacy Control', () => {
    const ids = webAdIds(env);
    expect(webAdsAllowed(ids, 'allow', false)).toBe(true);
    expect(webAdsAllowed(ids, 'allow', true)).toBe(false);
    expect(webAdsAllowed(ids, null, false)).toBe(false);
    expect(parseWebAdChoice('allow')).toBe('allow');
    expect(parseWebAdChoice('maybe')).toBeNull();
  });
});
