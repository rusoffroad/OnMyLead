import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import {
  isVersion, noticeForVersion, parseAppStoreLookup, parsePlayPage, updateState, type UpdateState, type VersionNotice,
} from '@/core/app-versions';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/constants/site';
import { useAppSettings } from './app-settings';

// The owner's release controls (Admin Dashboard > Releases) applied to this build. The website is
// always the newest code, so it never sees any of this. On top of the Releases page, the app asks
// the App Store or Google Play which version is live, so "Update Available" shows on its own.

const BUNDLE_ID = 'com.rusoffroad.onmylead.app';
const STORE_KEY = 'onmylead.storeVersion';
// The Google Play page is large, so ask at most twice a day; the answer is kept on the phone.
const STORE_CHECK_MS = 12 * 60 * 60_000;

let storeVersion: string | null = null;
let checkedAt = 0;
let storeStarted = false;
const storeListeners = new Set<() => void>();

async function fetchStoreVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    if (Platform.OS === 'ios') {
      const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=us`, { signal: controller.signal });
      return res.ok ? parseAppStoreLookup(await res.json()) : null;
    }
    const res = await fetch(`https://play.google.com/store/apps/details?id=${BUNDLE_ID}&hl=en_US&gl=US`, { signal: controller.signal });
    return res.ok ? parsePlayPage(await res.text()) : null;
  } finally {
    clearTimeout(timer);
  }
}

function checkStore() {
  if (Date.now() - checkedAt < STORE_CHECK_MS) return;
  checkedAt = Date.now();
  fetchStoreVersion()
    .then((v) => {
      if (!v) return; // A changed page or no signal: the last answer stands.
      storeVersion = v;
      storeListeners.forEach((l) => l());
      AsyncStorage.setItem(STORE_KEY, JSON.stringify({ version: v, at: checkedAt })).catch(() => {});
    })
    .catch(() => {});
}

function startStoreCheck() {
  if (storeStarted || appVersion() === null) return;
  storeStarted = true;
  AsyncStorage.getItem(STORE_KEY)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as { version?: unknown; at?: unknown }) : null;
      if (saved && isVersion(saved.version) && storeVersion === null) {
        storeVersion = saved.version;
        if (typeof saved.at === 'number') checkedAt = saved.at;
        storeListeners.forEach((l) => l());
      }
    })
    .catch(() => {})
    .finally(checkStore);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') checkStore();
  });
}

function subscribeStore(l: () => void) {
  startStoreCheck();
  storeListeners.add(l);
  return () => {
    storeListeners.delete(l);
  };
}

/** The version live in this phone's store, or null until known (and always on the website). */
export function useStoreVersion(): string | null {
  return useSyncExternalStore(subscribeStore, () => storeVersion, () => null);
}

/** This build's version from app.json ("1.0.3"), or null on the website. */
export function appVersion(): string | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  return Constants.expoConfig?.version ?? null;
}

/** Opens OnMyLead's page in the App Store or Google Play. */
export function openStore(): void {
  const url = Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
  if (url) Linking.openURL(url).catch(() => {});
}

export function useUpdateState(): UpdateState {
  const store = useStoreVersion();
  return updateState(useAppSettings().settings.versions, Platform.OS, appVersion(), store);
}

export function useVersionNotice(): VersionNotice | null {
  return noticeForVersion(useAppSettings().settings.versions, Platform.OS, appVersion());
}
