// Ad conversion tracking on iPhone, iPad and Android (3.0): tells Meta and TikTok, through our
// ad-conversions edge function, when an install, a sign-up, a trial start or a Pro purchase
// happened, so OnMyLead's ads can be measured. Rules: core/ad-tracking.ts. Website: ad-tracking.web.ts.
//
// iPhone and iPad: nothing is sent unless the rider tapped Allow on Apple's App Tracking
// Transparency prompt. Android: on unless the rider turns off You > Settings > Ad Measurement, or
// Android's advertising ID is deleted. Events that happen before the answer wait (up to a week) and
// are dropped on Ask App Not to Track.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Tracking from 'expo-tracking-transparency';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { eventId, isFreshTrial, isNewAccount, maySend, purchaseValue, type AdConsent, type AdEvent } from '@/core/ad-tracking';
import { PRICES } from '@/core/pro';
import { currentEntitlements } from '@/lib/entitlements';
import { supabase } from '@/lib/supabase';

const KEY_QUEUE = 'onmylead.ads.queue';
const KEY_SENT = 'onmylead.ads.sent';
const KEY_ANDROID = 'onmylead.ads.android';
const KEY_INSTALLED = 'onmylead.ads.installed';
const WEEK = 7 * 86_400_000;

type Queued = { event: AdEvent; key: string; at: number; value?: number };

const native = Platform.OS === 'ios' || Platform.OS === 'android';

let consent: AdConsent = 'undetermined';
let androidOn = true;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function refreshConsent(): Promise<void> {
  if (!native) return;
  try {
    const p = await Tracking.getTrackingPermissionsAsync();
    consent = p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    consent = 'undetermined';
  }
  androidOn = (await AsyncStorage.getItem(KEY_ANDROID).catch(() => null)) !== '0';
  publish();
}

function adId(): string | null {
  try {
    return Tracking.getAdvertisingId();
  } catch {
    return null;
  }
}

let flushing: Promise<void> | null = null;
/** Sends what's waiting once the rider has allowed it; drops it if they said no. */
function flush(): Promise<void> {
  flushing ??= (async () => {
    const queue = (await readJson<Queued[]>(KEY_QUEUE, [])).filter((q) => Date.now() - q.at < WEEK);
    if (!queue.length) return;
    const id = adId();
    const declined = Platform.OS === 'ios' ? consent === 'denied' : !androidOn;
    if (declined) {
      await AsyncStorage.removeItem(KEY_QUEUE).catch(() => {});
      return;
    }
    if (!maySend(Platform.OS, consent, id, androidOn)) {
      await AsyncStorage.setItem(KEY_QUEUE, JSON.stringify(queue)).catch(() => {});
      return;
    }
    const sent = new Set(await readJson<string[]>(KEY_SENT, []));
    const left: Queued[] = [];
    for (const q of queue) {
      const eid = eventId(q.event, q.key);
      if (sent.has(eid)) continue;
      const { error } = await supabase.functions.invoke('ad-conversions', {
        body: {
          event: q.event,
          event_id: eid,
          platform: Platform.OS,
          ad_id: id,
          att: consent,
          app_version: Constants.expoConfig?.version ?? '',
          os_version: Device.osVersion ?? '',
          device_model: Device.modelName ?? '',
          event_time: Math.floor(q.at / 1000),
          ...(q.value !== undefined ? { value: q.value, currency: 'USD' } : {}),
        },
      });
      if (error) left.push(q);
      else sent.add(eid);
    }
    await AsyncStorage.setItem(KEY_SENT, JSON.stringify([...sent].slice(-200))).catch(() => {});
    await AsyncStorage.setItem(KEY_QUEUE, JSON.stringify(left)).catch(() => {});
  })()
    .catch(() => {})
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

/** Records one conversion; it goes out now or once the rider allows it. Never throws. */
export async function trackConversion(event: AdEvent, key: string, value?: number): Promise<void> {
  if (!native) return;
  try {
    const sent = await readJson<string[]>(KEY_SENT, []);
    const queue = await readJson<Queued[]>(KEY_QUEUE, []);
    if (sent.includes(eventId(event, key)) || queue.some((q) => q.event === event && q.key === key)) return;
    queue.push({ event, key, at: Date.now(), ...(value !== undefined ? { value } : {}) });
    await AsyncStorage.setItem(KEY_QUEUE, JSON.stringify(queue.slice(-20)));
    await flush();
  } catch {
    // Ad measurement must never break the ride.
  }
}

/** A Pro purchase the rider just made (not a renewal or a restore). */
export function trackPurchase(productId: string, transactionKey: string) {
  return trackConversion('subscribe', transactionKey || productId, purchaseValue(productId, PRICES));
}

let asked = false;
/**
 * Shows Apple's App Tracking Transparency prompt once, after the rider is signed in and not on
 * the map (never mid-ride). Does nothing on Android or after the rider has answered.
 */
export async function askForTracking(): Promise<void> {
  if (Platform.OS !== 'ios' || asked) return;
  asked = true;
  try {
    const p = await Tracking.getTrackingPermissionsAsync();
    if (p.status === 'undetermined' && p.canAskAgain) await Tracking.requestTrackingPermissionsAsync();
  } catch {
    // Older iPhones without the prompt read as not allowed.
  }
  await refreshConsent();
  await flush();
}

/** Starts at launch: the install event, sign-ups and trial starts, and resending what's waiting. */
export function startAdTracking(): () => void {
  if (!native) return () => {};
  (async () => {
    await refreshConsent();
    if (!(await AsyncStorage.getItem(KEY_INSTALLED).catch(() => '1'))) {
      await AsyncStorage.setItem(KEY_INSTALLED, String(Date.now())).catch(() => {});
      // Riders already signed in are updating from an older version, not installing.
      const { data: had } = await supabase.auth.getSession();
      if (!had.session) await trackConversion('first_open', 'install');
    } else {
      await flush();
    }
  })();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session) return;
    const user = session.user;
    if (isNewAccount(user.created_at)) trackConversion('sign_up', user.id);
    // The 30-day Pro trial starts with the account; give the server a moment to report it.
    setTimeout(() => {
      const ent = currentEntitlements();
      if (isFreshTrial(ent.proSource, ent.trialEndsAt)) trackConversion('start_trial', user.id);
    }, 8000);
  });
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') refreshConsent().then(flush);
  });
  return () => {
    data.subscription.unsubscribe();
    sub.remove();
  };
}

/** You > Settings > Ad Measurement. */
export function useAdMeasurement(): { consent: AdConsent; androidOn: boolean } {
  const c = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => `${consent}|${androidOn}`,
  );
  const [con, on] = c.split('|');
  return { consent: con as AdConsent, androidOn: on === 'true' };
}

export async function setAndroidAdMeasurement(on: boolean): Promise<void> {
  androidOn = on;
  publish();
  await AsyncStorage.setItem(KEY_ANDROID, on ? '1' : '0').catch(() => {});
  if (!on) await AsyncStorage.removeItem(KEY_QUEUE).catch(() => {});
}

/** The cookie notice and its choice are website-only (ad-tracking.web.ts). */
export function useWebAdChoice(): { show: boolean; choice: 'allow' | 'decline' | null; available: boolean } {
  return { show: false, choice: null, available: false };
}
export function setWebAdChoice(_next: 'allow' | 'decline'): void {}
