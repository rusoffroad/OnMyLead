// Ad conversion tracking on onmylead.com (3.0): the Meta Pixel, the Google tag (Google Ads) and
// the TikTok Pixel, loaded only after the visitor taps Allow on the cookie notice
// (components/ad-consent-notice.web.tsx). Global Privacy Control or Do Not Track counts as a
// decline. Each pixel stays off until its id is in the build's environment (app/.env, never
// committed): EXPO_PUBLIC_META_PIXEL_ID, EXPO_PUBLIC_GOOGLE_ADS_ID (AW-...),
// EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL, EXPO_PUBLIC_GOOGLE_ADS_TRIAL_LABEL,
// EXPO_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL, EXPO_PUBLIC_TIKTOK_PIXEL_ID. Rules: core/ad-tracking.ts.
import { useSyncExternalStore } from 'react';

import {
  googleLabels,
  isNewAccount,
  META_WEB_EVENT,
  parseWebAdChoice,
  showWebAdNotice,
  webAdIds,
  webAdsAllowed,
  type AdConsent,
  type AdEvent,
  type WebAdChoice,
} from '@/core/ad-tracking';
import { supabase } from '@/lib/supabase';

// Expo only inlines EXPO_PUBLIC_ values read by their full name.
const ENV = {
  EXPO_PUBLIC_META_PIXEL_ID: process.env.EXPO_PUBLIC_META_PIXEL_ID,
  EXPO_PUBLIC_GOOGLE_ADS_ID: process.env.EXPO_PUBLIC_GOOGLE_ADS_ID,
  EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: process.env.EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
  EXPO_PUBLIC_GOOGLE_ADS_TRIAL_LABEL: process.env.EXPO_PUBLIC_GOOGLE_ADS_TRIAL_LABEL,
  EXPO_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: process.env.EXPO_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL,
  EXPO_PUBLIC_TIKTOK_PIXEL_ID: process.env.EXPO_PUBLIC_TIKTOK_PIXEL_ID,
};
const IDS = webAdIds(ENV);
const LABELS = googleLabels(ENV);
const KEY = 'onmylead.ads.choice';

type W = Window & {
  fbq?: ((...a: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; callMethod?: (...a: unknown[]) => void };
  _fbq?: unknown;
  dataLayer?: unknown[];
  gtag?: (...a: unknown[]) => void;
  ttq?: { [k: string]: unknown; load?: (id: string) => void; page?: () => void; track?: (e: string, p?: unknown) => void };
  TiktokAnalyticsObject?: string;
};
const w = (typeof window !== 'undefined' ? window : undefined) as W | undefined;

function gpc(): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

function readChoice(): WebAdChoice {
  try {
    return parseWebAdChoice(w?.localStorage.getItem(KEY) ?? null);
  } catch {
    return null;
  }
}

let choice: WebAdChoice = readChoice();
const listeners = new Set<() => void>();

function addScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

let loaded = false;
function loadPixels() {
  if (loaded || !w || !webAdsAllowed(IDS, choice, gpc())) return;
  loaded = true;
  if (IDS.metaPixel) {
    const f = function (...a: unknown[]) {
      if (f.callMethod) f.callMethod(...a);
      else f.queue!.push(a);
    } as NonNullable<W['fbq']>;
    f.push = f;
    f.loaded = true;
    f.version = '2.0';
    f.queue = [];
    w.fbq = f;
    w._fbq = f;
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    w.fbq('init', IDS.metaPixel);
    w.fbq('track', 'PageView');
  }
  if (IDS.googleTag) {
    w.dataLayer = w.dataLayer || [];
    // gtag reads its arguments object, as Google's snippet does.
    w.gtag = function () { w.dataLayer!.push(arguments); };
    w.gtag('js', new Date());
    w.gtag('config', IDS.googleTag);
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(IDS.googleTag)}`);
  }
  if (IDS.tiktokPixel) {
    // TikTok's loader: calls made before events.js arrives wait in the ttq array.
    w.TiktokAnalyticsObject = 'ttq';
    const q: unknown[] & { [k: string]: unknown } = [] as never;
    const methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    for (const m of methods) q[m] = (...a: unknown[]) => { q.push([m, ...a]); };
    w.ttq = q as never;
    addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(IDS.tiktokPixel)}&lib=ttq`);
    (q.page as () => void)();
  }
}

/** Fires one conversion on each pixel that's on. Never throws. */
export async function trackConversion(event: AdEvent, _key: string, value?: number): Promise<void> {
  try {
    if (!w || !webAdsAllowed(IDS, choice, gpc())) return;
    loadPixels();
    const money = value !== undefined ? { value, currency: 'USD' } : {};
    const metaName = META_WEB_EVENT[event];
    if (metaName && w.fbq) w.fbq('track', metaName, money);
    const label = event === 'first_open' ? null : LABELS[event];
    if (IDS.googleTag && label && w.gtag) w.gtag('event', 'conversion', { send_to: `${IDS.googleTag}/${label}`, ...money });
    const tt = { sign_up: 'CompleteRegistration', start_trial: 'StartTrial', subscribe: 'Subscribe', first_open: null }[event];
    if (tt && w.ttq?.track) w.ttq.track(tt, money);
  } catch {
    // Ad measurement must never break the website.
  }
}

/** The website sells nothing; purchases happen in the phone apps. */
export async function trackPurchase(_productId: string, _transactionKey: string): Promise<void> {}

/** The ATT prompt is iPhone-only. */
export async function askForTracking(): Promise<void> {}

export function startAdTracking(): () => void {
  loadPixels();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && isNewAccount(session.user.created_at)) trackConversion('sign_up', session.user.id);
  });
  return () => data.subscription.unsubscribe();
}

export function setWebAdChoice(next: 'allow' | 'decline') {
  choice = next;
  try {
    w?.localStorage.setItem(KEY, next);
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
  listeners.forEach((l) => l());
  // Turning it off after it loaded needs a reload to unload the pixels.
  if (next === 'decline' && loaded) w?.location.reload();
  else loadPixels();
}

/** Whether to show the cookie notice now, and the current choice (the Privacy page's switch). */
export function useWebAdChoice(): { show: boolean; choice: WebAdChoice; available: boolean } {
  const c = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => choice,
    () => null,
  );
  return { show: showWebAdNotice(IDS, c, gpc()), choice: c, available: !!(IDS.metaPixel || IDS.googleTag || IDS.tiktokPixel) };
}

export function useAdMeasurement(): { consent: AdConsent; androidOn: boolean } {
  return { consent: 'undetermined', androidOn: false };
}
export async function setAndroidAdMeasurement(_on: boolean): Promise<void> {}
