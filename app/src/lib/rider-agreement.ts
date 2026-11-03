/**
 * Who has agreed to the Rider Safety and Liability Agreement (core/rider-agreement.ts), on this
 * device and on the server, and sending each acceptance to the server as evidence.
 *
 * Tapping I Agree is saved on the device first, so a rider with no signal (or before the server
 * update is live) is never locked out of Ride Mode or Help and SOS. The record goes to the server
 * as soon as the rider is signed in and online, and is retried on every launch, sign-in and
 * return to the app until it lands. An acceptance made before signing in goes to the first
 * account that signs in on this device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import {
  accountKey, agreementText, needsAgreement, parseAcceptances, pendingUpload, RIDER_AGREEMENT, type LocalAcceptances,
} from '@/core/rider-agreement';
import { isBackendConfigured, supabase } from './supabase';

const STORE_KEY = 'onmylead.riderAgreement';

type State = {
  loaded: boolean;
  local: LocalAcceptances;
  userId: string | null;
  /** The newest version the server holds for the signed-in rider; null = not known yet. */
  serverVersion: number | null;
  /** The server has answered (or couldn't be reached) for the signed-in rider. */
  checked: boolean;
};

let state: State = { loaded: false, local: {}, userId: null, serverVersion: null, checked: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const save = (local: LocalAcceptances) => {
  set({ local });
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(local)).catch(() => {});
};

let uploading = false;
let again = false;

/** Asks the server what this rider has agreed to, then sends anything waiting. */
async function sync(): Promise<void> {
  const userId = state.userId;
  if (!userId || !isBackendConfigured || !state.loaded) return;
  if (uploading) {
    again = true;
    return;
  }
  uploading = true;
  try {
    if (state.serverVersion == null) {
      const { data, error } = await supabase.rpc('my_rider_agreement');
      if (state.userId !== userId) return;
      // Not live yet (migration still to run) or offline: the device copy stands, try later.
      if (error) {
        set({ checked: true });
        return;
      }
      const version = Number((data as { version: number | null } | null)?.version ?? 0);
      set({ serverVersion: version, checked: true });
      // Agreed on another device or the website: remember it here too, for offline launches.
      const mine = state.local[accountKey(userId)];
      if (version >= RIDER_AGREEMENT.version && !(mine && mine.version >= version)) {
        save({ ...state.local, [accountKey(userId)]: { version, acceptedAt: new Date().toISOString(), uploaded: true } });
      }
    }
    const waiting = pendingUpload({ userId, local: state.local, serverVersion: state.serverVersion });
    if (!waiting) return;
    const beforeSignIn = !(state.local[userId] && state.local[userId].version >= RIDER_AGREEMENT.version);
    const cfg = Constants.expoConfig;
    const build = Platform.OS === 'ios' ? cfg?.ios?.buildNumber : Platform.OS === 'android' ? cfg?.android?.versionCode : null;
    let locale: string | null = null;
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale ?? null;
    } catch {}
    const { error } = await supabase.rpc('accept_rider_agreement', {
      p_version: waiting.version,
      p_text: agreementText(),
      p_device_accepted_at: waiting.acceptedAt,
      p_before_sign_in: beforeSignIn,
      p_platform: Platform.OS === 'ios' && Device.deviceType === Device.DeviceType.TABLET ? 'ipados' : Platform.OS,
      p_app_version: Platform.OS === 'web' ? 'website' : cfg?.version ?? null,
      p_app_build: build == null ? null : String(build),
      p_device: Platform.OS === 'web' ? Device.osName ?? 'browser' : Device.modelName ?? null,
      p_os_version: Platform.OS === 'web' ? null : `${Device.osName ?? ''} ${Device.osVersion ?? ''}`.trim() || null,
      p_locale: locale,
    });
    if (error || state.userId !== userId) return;
    // Recorded. The before-sign-in copy belonged to this account, so the next person to sign in
    // on this device is asked for themselves.
    const local = { ...state.local, [accountKey(userId)]: { ...waiting, uploaded: true } };
    delete local[''];
    save(local);
    set({ serverVersion: Math.max(state.serverVersion ?? 0, waiting.version) });
  } catch {
    // Offline: try again later.
  } finally {
    uploading = false;
    if (again) {
      again = false;
      sync();
    }
  }
}

function setSession(session: Session | null) {
  const userId = session?.user.id ?? null;
  if (userId === state.userId) return;
  set({ userId, serverVersion: null, checked: false });
  sync();
}

let started = false;
/** Loads this device's acceptances and follows sign-in and sign-out. Called once at launch. */
export function startRiderAgreement(): () => void {
  if (started) return () => {};
  started = true;
  AsyncStorage.getItem(STORE_KEY)
    .then((raw) => set({ local: parseAcceptances(raw), loaded: true }))
    .catch(() => set({ loaded: true }))
    .then(() => sync());
  if (!isBackendConfigured) return () => {};
  supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => {});
  const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') sync();
  });
  return () => {
    data.subscription.unsubscribe();
    app.remove();
    started = false;
  };
}

/** The rider tapped I Agree on this device. */
export function acceptRiderAgreement() {
  const key = accountKey(state.userId);
  save({ ...state.local, [key]: { version: RIDER_AGREEMENT.version, acceptedAt: new Date().toISOString(), uploaded: false } });
  sync();
}

/**
 * Whether the agreement screen should show now: false until this device's saved answer has been
 * read (so it never flashes for a rider who already agreed). On the website it's only for riders
 * who are signed in; the signed-out homepage links to it instead.
 */
export function useNeedsRiderAgreement(): boolean {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  if (!s.loaded) return false;
  if (Platform.OS === 'web' && !s.userId) return false;
  // Signed in with nothing saved on this device (a new phone, a reinstall, the website): wait for
  // the server's answer before asking, so a rider who already agreed isn't asked again.
  const mine = s.local[accountKey(s.userId)] ?? (s.userId ? s.local[''] : undefined);
  if (s.userId && !s.checked && !(mine && mine.version >= RIDER_AGREEMENT.version) && isBackendConfigured) return false;
  return needsAgreement({ userId: s.userId, local: s.local, serverVersion: s.serverVersion });
}
