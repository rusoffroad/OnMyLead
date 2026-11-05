import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  isSyncedKey, mergeSynced, parseSyncedMap, seedFromDevice, stamp, syncSummary, SYNCED_SETTINGS, type SyncedMap,
} from '@/core/synced-settings';
import { isBackendConfigured, supabase } from './supabase';
import { can } from '@/core/entitlements';
import { currentEntitlements } from './entitlements';
import { singleFlight } from './single-flight';

/**
 * Settings that follow the account across devices (core/synced-settings.ts has the list and the
 * rules). Screens keep reading their settings from AsyncStorage as before; writing one goes
 * through setSyncedItem, which stamps the change and sends it a moment later. On launch, sign-in,
 * coming back to the app and after a change, the device swaps changes with the account
 * (sync_rider_settings) and writes what other devices changed, telling the screens that listen.
 *
 * Works offline: changes wait on the device and go up the next time there is signal.
 */

/** This device's view of the account's settings, with the time of each change. */
const STAMPS_KEY = 'sync.stamps.v1';
/** The account this device last synced with, so one rider's settings never land in another's. */
const ACCOUNT_KEY = 'sync.account.v1';
const LAST_KEY = 'sync.lastAt.v1';

let stamps: SyncedMap = {};
let loading: Promise<void> | null = null;
const keyListeners = new Map<string, Set<(v: string | null) => void>>();
const prefixListeners = new Map<string, Set<() => void>>();

export type SyncStatus = {
  lastSyncedAt: number | null;
  syncing: boolean;
  failed: boolean;
  /** False when the server doesn't have sync yet (before its update): the You tab hides the row. */
  available: boolean;
};
let status: SyncStatus = { lastSyncedAt: null, syncing: false, failed: false, available: true };
const statusListeners = new Set<() => void>();
const setStatus = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s };
  statusListeners.forEach((l) => l());
};

function load() {
  loading ??= AsyncStorage.multiGet([STAMPS_KEY, LAST_KEY])
    .then(([[, raw], [, last]]) => {
      stamps = { ...parseSyncedMap(raw ? JSON.parse(raw) : {}), ...stamps };
      const at = last ? Number(last) : NaN;
      if (Number.isFinite(at)) setStatus({ lastSyncedAt: at });
    })
    .catch(() => {});
  return loading;
}

const saveStamps = () => AsyncStorage.setItem(STAMPS_KEY, JSON.stringify(stamps)).catch(() => {});

const writeLocal = (key: string, v: string | null) =>
  (v == null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, v)).catch(() => {});

function tell(key: string, v: string | null) {
  for (const [p, set] of prefixListeners) if (key.startsWith(p)) set.forEach((l) => l());
  keyListeners.get(key)?.forEach((l) => {
    try {
      l(v);
    } catch {
      // One screen's listener never stops the others.
    }
  });
}

/**
 * Save a setting on this device and, when it is one that follows the account, send it to the
 * rider's other devices. Settings not in the list are simply saved here.
 */
export async function setSyncedItem(key: string, value: string | null): Promise<void> {
  await writeLocal(key, value);
  if (!isSyncedKey(key)) return;
  await load();
  stamps = { ...stamps, [key]: stamp(stamps[key], value, Date.now()) };
  saveStamps();
  tell(key, value);
  schedulePush();
}

/** Hear about a setting another device changed (and this device's own changes to it). */
export function onSyncedChange(key: string, fn: (v: string | null) => void): () => void {
  let set = keyListeners.get(key);
  if (!set) keyListeners.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** Every entry of a family of settings (core/synced-settings SYNCED_PREFIXES), by key. */
export async function syncedValues(prefix: string): Promise<Record<string, string | null>> {
  await load();
  return Object.fromEntries(Object.entries(stamps).filter(([k]) => k.startsWith(prefix)).map(([k, e]) => [k, e.v]));
}

/** True when this device has synced (or set) this key before, even to clear it. */
export async function hasSyncedEntry(key: string): Promise<boolean> {
  await load();
  return !!stamps[key];
}

/** Hear when any entry of a family changes, here or on another device. */
export function onSyncedPrefix(prefix: string, fn: () => void): () => void {
  let set = prefixListeners.get(prefix);
  if (!set) prefixListeners.set(prefix, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncSettingsNow();
  }, 2_000);
}

/** Swap changes with the account now. Safe to call often; does nothing when signed out. */
export const syncSettingsNow: () => Promise<void> = singleFlight(() => run());

async function run() {
  if (!isBackendConfigured) return;
  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user.id;
  if (!me) return;
  // Sync across devices is Pro: a Free account keeps its settings and trails on this device. It
  // still notes whose settings these are, so a different rider who signs in here with Pro gets
  // their own account's settings instead of adopting this rider's.
  if (!can(currentEntitlements(), 'sync')) {
    const lastAccount = await AsyncStorage.getItem(ACCOUNT_KEY).catch(() => null);
    if (lastAccount !== me) {
      // The stamps were the last account's: this rider starts fresh if they go Pro here later.
      await load();
      stamps = {};
      saveStamps();
      await AsyncStorage.setItem(ACCOUNT_KEY, me).catch(() => {});
    }
    return;
  }
  await load();
  setStatus({ syncing: true });
  try {
    const lastAccount = await AsyncStorage.getItem(ACCOUNT_KEY).catch(() => null);
    const sameAccount = !lastAccount || lastAccount === me;
    if (!sameAccount) stamps = {};
    // Settings this device has but never stamped (set before sync existed): offered at time 0, so
    // the account's copy wins wherever it has one and this device fills the gaps.
    const unstamped = Object.keys(SYNCED_SETTINGS).filter((k) => !stamps[k]);
    if (unstamped.length) {
      const pairs = await AsyncStorage.multiGet(unstamped).catch(() => [] as readonly [string, string | null][]);
      stamps = { ...seedFromDevice(Object.fromEntries(pairs), sameAccount), ...stamps };
    }

    const sent = stamps;
    const { data, error } = await supabase.rpc('sync_rider_settings', { p_changes: stamps });
    if (error) {
      // The server update hasn't run yet: stay quiet, keep everything on the device, try next time.
      if (isMissingFunction(error)) {
        setStatus({ syncing: false, failed: false, available: false });
        return;
      }
      throw new Error(error.message);
    }
    const remote = parseSyncedMap(data);
    // The server merged what was sent with the account copy (newer wins, stamps capped at its
    // clock plus a minute), so its answer settles every key it holds, even where this device's
    // clock ran ahead; a key the rider changed while the call was out keeps its new stamp.
    const settled: SyncedMap = { ...stamps };
    for (const [k, r] of Object.entries(remote)) if (sent[k] && stamps[k] === sent[k]) settled[k] = r;
    const { merged, apply } = mergeSynced(settled, remote);
    for (const [k, r] of Object.entries(remote)) {
      const was = sent[k];
      if (was && stamps[k] === was && was.v !== r.v) apply[k] = r;
    }
    for (const [k, e] of Object.entries(apply)) {
      await writeLocal(k, e.v);
      tell(k, e.v);
    }
    // A different rider signed in on this device: their account has no value for these settings,
    // so put them back to the app's defaults instead of keeping the last rider's choices.
    if (!sameAccount) {
      for (const k of Object.keys(SYNCED_SETTINGS)) {
        if (!remote[k]) {
          await writeLocal(k, null);
          tell(k, null);
        }
      }
    }
    stamps = merged;
    saveStamps();
    if (!sameAccount) prefixListeners.forEach((set) => set.forEach((l) => l()));
    const now = Date.now();
    AsyncStorage.multiSet([[ACCOUNT_KEY, me], [LAST_KEY, String(now)]]).catch(() => {});
    setStatus({ syncing: false, failed: false, available: true, lastSyncedAt: now });
  } catch {
    // Offline or the server doesn't have sync yet: changes wait on the device.
    setStatus({ syncing: false, failed: true });
  }
}

const isMissingFunction = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /could not find the function|schema cache/i.test(e.message ?? '');

/** For You > Sync: when this device last synced with the account. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      load();
      return () => void statusListeners.delete(l);
    },
    () => status,
    () => status,
  );
}

/** The You tab's Sync Across Devices line, kept current as the minutes pass. */
export function useSyncSummary(): string {
  const st = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return syncSummary(st, Math.max(now, st.lastSyncedAt ?? 0));
}

let started = false;
let lastForeground = 0;

/** Called once from the root layout, beside the other start-up work. */
export function startSettingsSync(extra: () => void = () => {}) {
  if (started || !isBackendConfigured) return;
  started = true;
  const both = () => {
    syncSettingsNow();
    extra();
  };
  both();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') both();
  });
  AppState.addEventListener('change', (s) => {
    if (s !== 'active' || Date.now() - lastForeground < 30_000) return;
    lastForeground = Date.now();
    both();
  });
}
