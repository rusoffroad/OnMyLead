import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  applyClock, can as canDo, isEntitlementsMissing, NOT_SWITCHED_ON, parseEntitlements,
  type Entitlements, type FeatureKey,
} from '@/core/entitlements';
import { isBackendConfigured, supabase } from './supabase';

// The signed-in rider's plan, shared by every screen. Kept on the phone so it is known with
// no signal; a failed refresh keeps the last answer instead of taking Pro away mid-ride.
let current: Entitlements = NOT_SWITCHED_ON;
let currentUser: string | null = null;
const listeners = new Set<() => void>();
const cacheKey = (userId: string) => `onmylead.entitlements.${userId}`;

function publish(e: Entitlements) {
  current = e;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The latest known plan, checked against the clock so an ended trial reads as Free. */
export function currentEntitlements(): Entitlements {
  return applyClock(current);
}

let inflight: Promise<Entitlements> | null = null;

/** Ask the server again (after a purchase, sign-in, or coming back to the app). Never throws. */
export function refreshEntitlements(): Promise<Entitlements> {
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load(): Promise<Entitlements> {
  if (!isBackendConfigured) return current;
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id ?? null;
  if (userId !== currentUser) {
    currentUser = userId;
    publish(userId ? await readCache(userId) : NOT_SWITCHED_ON);
  }
  if (!userId) return current;
  try {
    const { data, error } = await supabase.rpc('my_entitlements');
    if (error) {
      if (isEntitlementsMissing(error)) publish(NOT_SWITCHED_ON);
      return current;
    }
    if (currentUser !== userId) return current;
    const fresh = parseEntitlements(data);
    publish(fresh);
    AsyncStorage.setItem(cacheKey(userId), JSON.stringify(fresh)).catch(() => {});
  } catch {
    // Offline: the cached answer stands.
  }
  return current;
}

async function readCache(userId: string): Promise<Entitlements> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return NOT_SWITCHED_ON;
    const e = JSON.parse(raw) as Entitlements;
    return e && typeof e === 'object' && typeof e.switchedOn === 'boolean' ? { ...NOT_SWITCHED_ON, ...e } : NOT_SWITCHED_ON;
  } catch {
    return NOT_SWITCHED_ON;
  }
}

/** Marks the rider as active (at most hourly on the server), for the owner's daily and monthly counts. */
async function touchActivity() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.rpc('touch_activity');
  } catch {
    // Never matters to the rider.
  }
}

let started = false;
let lastForeground = 0;

/** Called once from the root layout: loads on launch, sign-in and coming back to the app. */
export function startEntitlements() {
  if (started || !isBackendConfigured) return;
  started = true;
  refreshEntitlements();
  touchActivity();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      refreshEntitlements();
      if (event === 'SIGNED_IN') touchActivity();
    }
  });
  AppState.addEventListener('change', (s) => {
    if (s !== 'active' || Date.now() - lastForeground < 60_000) return;
    lastForeground = Date.now();
    refreshEntitlements();
    touchActivity();
  });
}

/**
 * The rider's plan for screens: label, trial days left, ride allowance and features.
 * can(feature) is always true until the server has the Pro update.
 */
export function useEntitlements(): { ent: Entitlements; can: (f: FeatureKey) => boolean; refresh: () => Promise<Entitlements> } {
  const raw = useSyncExternalStore(subscribe, () => current, () => current);
  const ent = applyClock(raw);
  return { ent, can: (f) => canDo(ent, f), refresh: refreshEntitlements };
}
