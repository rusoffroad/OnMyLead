// Pure rules behind ad conversion tracking (lib/ad-tracking.ts, lib/ad-tracking.web.ts and the
// ad-conversions edge function), kept here so vitest covers them.
//
// What is sent: only that an install, a sign-up, a trial start or a Pro purchase happened, with the
// price for a purchase and, on phones, the advertising ID the rider allowed. Never location, rides,
// messages, names or email addresses.
//
// Who gets it:
//   * iPhone and iPad: Meta and TikTok, through our server, only after the rider taps Allow on
//     Apple's App Tracking Transparency prompt.
//   * Android: Meta and TikTok, through our server, unless the rider turned off Ad Measurement
//     (You > Privacy) or Android's own "Delete advertising ID" / "Opt out of Ads Personalization".
//   * Website: the Meta, Google and TikTok pixels load only after the rider taps Allow on the
//     cookie notice.
// Google's in-app conversions need Firebase Analytics inside the app (docs/feature-parity.md,
// Exceptions); Google Play installs are measured by Google Play itself once Google Ads is linked.

export type AdEvent = 'first_open' | 'sign_up' | 'start_trial' | 'subscribe';
export const AD_EVENTS: AdEvent[] = ['first_open', 'sign_up', 'start_trial', 'subscribe'];
export const isAdEvent = (v: unknown): v is AdEvent => typeof v === 'string' && (AD_EVENTS as string[]).includes(v);

/** The Meta pixel's names on the website (the app's names are in supabase/functions/_shared/ad-conversions.ts). */
export const META_WEB_EVENT: Record<AdEvent, string | null> = {
  first_open: null,
  sign_up: 'CompleteRegistration',
  start_trial: 'StartTrial',
  subscribe: 'Subscribe',
};

/** iOS ATT status, or Android's: 'granted' (Ad Measurement on), 'denied', or 'undetermined'. */
export type AdConsent = 'granted' | 'denied' | 'undetermined';

/** An advertising ID of all zeros means the rider (or Android) has switched it off. */
export function usableAdId(id: string | null | undefined): string | null {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  if (!/^[0-9a-f-]{32,36}$/.test(clean)) return null;
  return /^[0-]+$/.test(clean) ? null : clean;
}

/**
 * Whether this device may send an ad event. On Apple devices only an Allow on the ATT prompt counts
 * (Apple's rule: no tracking without it). On Android the rider's Ad Measurement switch decides, and
 * a switched-off advertising ID also means no.
 */
export function maySend(platform: string, consent: AdConsent, adId: string | null, androidSwitch: boolean): boolean {
  if (platform === 'ios') return consent === 'granted' && !!usableAdId(adId);
  if (platform === 'android') return androidSwitch && !!usableAdId(adId);
  return false;
}

/** Pro prices in US dollars by store product id, for a purchase event's value. */
export function purchaseValue(productId: string, prices: { monthly: number; annual: number }): number {
  return productId.endsWith('.annual') ? prices.annual : prices.monthly;
}

/** A sign-up is an account made in the last 30 minutes (Apple and Google sign-in don't say if it's new). */
export function isNewAccount(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t >= -60_000 && now - t < 30 * 60_000;
}

/** A trial that started in the last two days (the 30-day trial ends trialEndsAt). */
export function isFreshTrial(source: string | null, trialEndsAt: string | null, now = Date.now(), trialDays = 30): boolean {
  if (source !== 'trial' || !trialEndsAt) return false;
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end) || end <= now) return false;
  const started = end - trialDays * 86_400_000;
  return now - started < 2 * 86_400_000;
}

/** One id per event so the networks drop a repeat (the same event sent twice). */
export function eventId(event: AdEvent, key: string): string {
  return `${event}:${key}`.slice(0, 100);
}

// ---- Website ----

export type WebAdIds = { metaPixel: string | null; googleTag: string | null; tiktokPixel: string | null };
export type GoogleLabels = { sign_up: string | null; start_trial: string | null; subscribe: string | null };

const cleanId = (v: string | undefined | null, re: RegExp) => (v && re.test(v.trim()) ? v.trim() : null);

/** Reads the pixel ids from the build's environment; anything missing or malformed stays off. */
export function webAdIds(env: Record<string, string | undefined>): WebAdIds {
  return {
    metaPixel: cleanId(env.EXPO_PUBLIC_META_PIXEL_ID, /^\d{6,20}$/),
    googleTag: cleanId(env.EXPO_PUBLIC_GOOGLE_ADS_ID, /^AW-\d{6,15}$/),
    tiktokPixel: cleanId(env.EXPO_PUBLIC_TIKTOK_PIXEL_ID, /^[A-Z0-9]{10,30}$/),
  };
}

export function googleLabels(env: Record<string, string | undefined>): GoogleLabels {
  const l = (v: string | undefined) => cleanId(v, /^[A-Za-z0-9_-]{6,40}$/);
  return {
    sign_up: l(env.EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL),
    start_trial: l(env.EXPO_PUBLIC_GOOGLE_ADS_TRIAL_LABEL),
    subscribe: l(env.EXPO_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL),
  };
}

export const anyWebAdId = (ids: WebAdIds) => !!(ids.metaPixel || ids.googleTag || ids.tiktokPixel);

/** The website's cookie choice, saved in the browser. null means not asked yet. */
export type WebAdChoice = 'allow' | 'decline' | null;
export const parseWebAdChoice = (v: string | null): WebAdChoice => (v === 'allow' || v === 'decline' ? v : null);

/**
 * Whether the website shows the cookie notice: only when a pixel is set up, nothing was chosen yet,
 * and the browser isn't sending Global Privacy Control or Do Not Track (those count as a decline).
 */
export function showWebAdNotice(ids: WebAdIds, choice: WebAdChoice, gpc: boolean): boolean {
  return anyWebAdId(ids) && choice === null && !gpc;
}

export function webAdsAllowed(ids: WebAdIds, choice: WebAdChoice, gpc: boolean): boolean {
  return anyWebAdId(ids) && choice === 'allow' && !gpc;
}
