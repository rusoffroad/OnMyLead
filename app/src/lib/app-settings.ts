import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { flagOn, NO_SETTINGS, parseAppSettings, type AppFlag, type AppSettings } from '@/core/app-settings';
import { isBackendConfigured, supabase } from './supabase';

// The owner's announcement, maintenance notice and feature flags, shared by every screen.
// Kept on the phone so the last answer holds with no signal; anything that fails leaves features on.
const CACHE_KEY = 'onmylead.appSettings';
const DISMISSED_KEY = 'onmylead.dismissedNotices';
const REFRESH_MS = 5 * 60_000;

let current: AppSettings = NO_SETTINGS;
let dismissed: string[] = [];
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let inflight: Promise<void> | null = null;
let lastLoad = 0;

/** Ask the server again. Never throws. */
export function refreshAppSettings(): Promise<void> {
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load() {
  lastLoad = Date.now();
  try {
    const { data, error } = await supabase.rpc('public_app_settings');
    if (error) return; // Not switched on yet, or offline: the last answer stands.
    current = parseAppSettings(data);
    publish();
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(current)).catch(() => {});
  } catch {
    // Offline.
  }
}

let started = false;

/** Called once from the root layout: cached answer first, then the server, on launch and on coming back. */
export function startAppSettings() {
  if (started || !isBackendConfigured) return;
  started = true;
  Promise.all([AsyncStorage.getItem(CACHE_KEY), AsyncStorage.getItem(DISMISSED_KEY)])
    .then(([raw, gone]) => {
      if (raw && current === NO_SETTINGS) current = parseAppSettings(JSON.parse(raw));
      if (gone) dismissed = (JSON.parse(gone) as unknown[]).filter((x): x is string => typeof x === 'string');
      publish();
    })
    .catch(() => {})
    .finally(() => refreshAppSettings());
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && Date.now() - lastLoad > REFRESH_MS) refreshAppSettings();
  });
}

/** Hides one announcement's wording on this phone. New wording shows again. */
export function dismissNotice(key: string) {
  if (dismissed.includes(key)) return;
  dismissed = [...dismissed, key].slice(-20);
  publish();
  AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed)).catch(() => {});
}

type Snapshot = { settings: AppSettings; dismissed: string[] };
let snap: Snapshot = { settings: current, dismissed };
const getSnapshot = () => (snap.settings === current && snap.dismissed === dismissed ? snap : (snap = { settings: current, dismissed }));

export function useAppSettings(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Whether the owner left this feature on (it is, unless switched off on the Admin Dashboard). */
export function useFlag(flag: AppFlag): boolean {
  return flagOn(useAppSettings().settings, flag);
}
