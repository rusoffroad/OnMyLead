import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import {
  languageByCode,
  newerLanguageSetting,
  parseLanguageSetting,
  resolveLanguage,
  translateWith,
  type LanguageChoice,
  type LanguageCode,
  type LanguageSetting,
} from '@/core/i18n';
import { TRANSLATIONS } from '@/core/translations';
import { readLanguageSync, writeLanguage } from './language-storage';

// The rider's language for every screen (core/i18n.ts has the rules). It defaults to Match Phone:
// the device's own language when the app speaks it, else English. Read before the first screen
// draws; a change redraws the app from the top (the root layout keys on languageVersion), the same
// way a new theme does. Account sync (lib/language-sync) carries the choice to the rider's other
// devices.

function deviceTags(): string[] {
  try {
    return getLocales().map((l) => l.languageTag);
  } catch {
    // Older builds without expo-localization: the website's browser, else English.
    if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) return [...navigator.languages];
    return [];
  }
}

let setting: LanguageSetting = parseLanguageSetting(readLanguageSync());
let current: LanguageCode = resolveLanguage(setting.choice, deviceTags());
let version = 0;

const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());
const syncListeners = new Set<(s: LanguageSetting) => void>();

function tellPage() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = languageByCode(current).locale;
}
tellPage();

/** The line in the rider's language (English when it isn't translated yet). See core/i18n.ts. */
export function t(text: string, vars?: Record<string, string | number>): string {
  return translateWith(current === 'en' ? null : TRANSLATIONS[current], text, vars);
}

/** Translates a label a shared component was handed, if it is plain text. */
export function tx<T>(text: T): T {
  return (typeof text === 'string' && text ? t(text) : text) as T;
}

/** The language shown now. */
export const currentLanguage = (): LanguageCode => current;
/** The BCP-47 tag for toLocaleString on dates and numbers. */
export const currentLocale = (): string => languageByCode(current).locale;
/** Goes up each time the language changes; the root layout redraws on it. */
export const languageVersion = () => version;

let returnTo: string | null = null;
/** Where the root layout sends the rider after the app redraws in a new language (once). */
export function takeLanguageReturnPath() {
  const r = returnTo;
  returnTo = null;
  return r;
}

function show(next: LanguageSetting) {
  setting = next;
  const lang = resolveLanguage(next.choice, deviceTags());
  if (lang !== current) {
    current = lang;
    version += 1;
    tellPage();
  }
  publish();
}

/**
 * Switches the app's language now and saves it for next launch and for account sync. `from` is
 * the screen to come back to once the app redraws (the Language screen).
 */
export function setLanguage(choice: LanguageChoice, from?: string) {
  if (choice === setting.choice) return;
  const next: LanguageSetting = { choice, updatedAt: new Date().toISOString() };
  writeLanguage(JSON.stringify(next));
  returnTo = from ?? null;
  show(next);
  syncListeners.forEach((l) => l(next));
}

/** What account sync uploads. */
export const getLanguageForSync = (): LanguageSetting => setting;

const launchedAt = Date.now();
/** A synced change that arrives later than this waits for the next launch, so Ride Mode is never redrawn. */
const SYNC_APPLY_WINDOW_MS = 20_000;

/**
 * Account sync hands over what the account holds; it is used only if it is newer than this
 * device's. Right after launch it shows at once, later it is saved for the next launch.
 */
export function applySyncedLanguage(raw: unknown, now = Date.now()): 'applied' | 'saved' | 'kept' {
  const remote = parseLanguageSetting(raw);
  const winner = newerLanguageSetting(setting, remote);
  if (winner === setting || winner.choice === setting.choice) return 'kept';
  writeLanguage(JSON.stringify(winner));
  if (now - launchedAt > SYNC_APPLY_WINDOW_MS) return 'saved';
  show(winner);
  return 'applied';
}

/** Account sync listens here to upload each change the rider makes on this device. */
export function onLanguageChange(l: (s: LanguageSetting) => void) {
  syncListeners.add(l);
  return () => {
    syncListeners.delete(l);
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

type Snapshot = { choice: LanguageChoice; language: LanguageCode; version: number };
let snap: Snapshot = { choice: setting.choice, language: current, version };
const getSnap = () => {
  if (snap.choice !== setting.choice || snap.language !== current || snap.version !== version) {
    snap = { choice: setting.choice, language: current, version };
  }
  return snap;
};

/** The rider's choice (a language or Match Phone), the language shown, and the redraw version. */
export function useLanguage(): Snapshot {
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}
