import { useSyncExternalStore } from 'react';
import { Appearance as SystemAppearance, Platform } from 'react-native';

import { newerAppearance, parseAppearance, sameAppearance, type Appearance } from '@/core/appearance';
import { applyAppearance, Colors, currentAppearance, currentScheme, themeVersion } from '@/constants/theme';
import { writeAppearance } from './appearance-storage';

// The rider's appearance (Dark / Light / Match Phone, theme, Color Blind Mode) for every screen.
// Saved on this device straight away; account sync (another module) reads getAppearanceForSync()
// and hands back what the account holds with applySyncedAppearance(), newest change winning.

const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const syncListeners = new Set<(a: Appearance) => void>();

/** Tells the phone (keyboards, alerts, date pickers, the status bar) which scheme to draw. */
function tellSystem(a: Appearance) {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = currentScheme();
      document.documentElement.style.backgroundColor = Colors.background;
      document.body.style.backgroundColor = Colors.background;
    }
    return;
  }
  try {
    SystemAppearance.setColorScheme(a.mode === 'auto' ? 'unspecified' : a.mode);
  } catch {
    // Older builds without the override keep following the app.json setting.
  }
}

function systemScheme(): string | null | undefined {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return SystemAppearance.getColorScheme();
}

function show(next: Appearance) {
  // Native first, so Match Phone reads the phone's own scheme rather than our last override.
  if (Platform.OS !== 'web') tellSystem(next);
  applyAppearance(next, systemScheme());
  if (Platform.OS === 'web') tellSystem(next);
  publish();
}

let started = false;

/** Called once from the root layout: tells the phone the saved scheme and follows it in Match Phone. */
export function startAppearance() {
  if (started) return;
  started = true;
  show(currentAppearance());
  if (Platform.OS === 'web') {
    window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
      if (currentAppearance().mode === 'auto') show(currentAppearance());
    });
  } else {
    // Fires for the phone's own switch (and our overrides); only Match Phone redraws, and only
    // when the scheme really changed, so an override never loops back here.
    SystemAppearance.addChangeListener(() => {
      if (currentAppearance().mode === 'auto' && applyAppearance(currentAppearance(), systemScheme())) publish();
    });
  }
}

const launchedAt = Date.now();
/** A synced change that arrives later than this waits for the next launch (see applySyncedAppearance). */
const SYNC_APPLY_WINDOW_MS = 20_000;

let returnTo: string | null = null;
/** Where the root layout sends the rider after it redraws the app for a new theme (once). */
export function takeReturnPath() {
  const r = returnTo;
  returnTo = null;
  return r;
}

/**
 * Changes the look on this device now and saves it for next launch and for account sync.
 * `from` is the screen to come back to once the app redraws (the Appearance screen).
 */
export function setAppearance(patch: Partial<Omit<Appearance, 'updatedAt'>>, from?: string) {
  const prev = currentAppearance();
  const next: Appearance = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  if (sameAppearance(prev, next)) return;
  writeAppearance(JSON.stringify(next));
  returnTo = from ?? null;
  show(next);
  syncListeners.forEach((l) => l(next));
}

/** What account sync uploads: the choice and when it was made. */
export const getAppearanceForSync = (): Appearance => currentAppearance();

/**
 * Account sync hands over what the account holds; it is used only if it is newer than this
 * device's. Right after launch (or sign-in on a fresh launch) it shows at once. Later it is saved
 * and shows on the next launch, because redrawing the app would pull a rider out of Ride Mode.
 * Returns 'applied', 'saved' (next launch) or 'kept' (this device's choice is newer or the same).
 */
export function applySyncedAppearance(raw: unknown, now = Date.now()): 'applied' | 'saved' | 'kept' {
  const remote = parseAppearance(raw);
  const local = currentAppearance();
  const winner = newerAppearance(local, remote);
  if (winner === local || sameAppearance(local, remote)) return 'kept';
  writeAppearance(JSON.stringify(winner));
  if (now - launchedAt > SYNC_APPLY_WINDOW_MS) return 'saved';
  show(winner);
  return 'applied';
}

/** Account sync listens here to upload each change the rider makes on this device. */
export function onAppearanceChange(l: (a: Appearance) => void) {
  syncListeners.add(l);
  return () => {
    syncListeners.delete(l);
  };
}

type Snapshot = { appearance: Appearance; version: number };
let snap: Snapshot = { appearance: currentAppearance(), version: themeVersion() };
const getSnap = () => {
  const a = currentAppearance();
  const v = themeVersion();
  if (snap.appearance !== a || snap.version !== v) snap = { appearance: a, version: v };
  return snap;
};

/** The rider's choice and the theme version (it goes up each time the colours change). */
export function useAppearance(): Snapshot {
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}
