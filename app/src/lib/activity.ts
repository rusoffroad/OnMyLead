import { useSyncExternalStore } from 'react';

import { paintedActivity } from '@/constants/theme';
import { ACTIVITY_KEY, DEFAULT_ACTIVITY, parseActivity, type ActivityId } from '@/core/activities';
import { flagOn } from '@/core/app-settings';
import { writeActivityFile } from './activity-storage';
import { useAppSettings } from './app-settings';
import { paintActivity } from './appearance';
import { onSyncedChange, setSyncedItem } from './settings-sync';

/**
 * The rider's activity (core/activities.ts), for every screen. It is picked with the chip on Home,
 * saved on this device (read before the first screen draws, so the app opens in its colours) and
 * sent to the account through settings sync. While the `activities` flag is off (the default until
 * the owner switches it on) every rider is in Offroad and nothing looks different.
 */

let chosen: ActivityId = paintedActivity();
const launchedAt = Date.now();
/** A pick from another device that arrives later than this shows on the next launch (never mid-ride). */
const SYNC_APPLY_WINDOW_MS = 20_000;

const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => chosen;

/** The splash shown after a switch (components/activity-splash.tsx), kept here so the redraw in new colours can't lose it. */
let splash: { id: ActivityId; at: number } | null = null;
const splashListeners = new Set<() => void>();
export const getSplash = () => splash;
export function subscribeSplash(l: () => void) {
  splashListeners.add(l);
  return () => {
    splashListeners.delete(l);
  };
}
/** Ends the splash that started at `at` (a later switch's splash stays). */
export function dismissSplash(at: number) {
  if (!splash || splash.at !== at) return;
  splash = null;
  splashListeners.forEach((l) => l());
}

/** Switches activity: saves it, sends it to the account, shows its splash, and redraws the app in its colours. */
export function setActivity(id: ActivityId) {
  if (id === chosen && paintedActivity() === id) return;
  if (id !== chosen) {
    splash = { id, at: Date.now() };
    splashListeners.forEach((l) => l());
  }
  chosen = id;
  writeActivityFile(id);
  setSyncedItem(ACTIVITY_KEY, id).catch(() => {});
  publish();
  paintActivity(id);
}

/** The activity in use: the rider's pick while Activities is on, else Offroad. */
export function useActivity(): { activity: ActivityId; on: boolean } {
  const picked = useSyncExternalStore(subscribe, get, get);
  const on = flagOn(useAppSettings().settings, 'activities');
  return { activity: on ? picked : DEFAULT_ACTIVITY, on };
}

/** Outside React (creating a ride or event): the activity to label it with, or null while Activities is off. */
export function activityForNew(on: boolean): ActivityId | null {
  return on ? chosen : null;
}

/**
 * Called by Home once it knows the flag: with Activities switched off the app goes back to
 * Offroad colours (the rider's pick is kept for when it comes back on).
 */
export function wearActivity(on: boolean) {
  const want = on ? chosen : DEFAULT_ACTIVITY;
  if (paintedActivity() !== want) paintActivity(want);
}

let started = false;
/** From the root layout: a pick made on another device, applied now right after launch, else next launch. */
export function startActivitySync() {
  if (started) return;
  started = true;
  onSyncedChange(ACTIVITY_KEY, (v) => {
    const id = parseActivity(v);
    if (!v || id === chosen) return;
    writeActivityFile(id);
    if (Date.now() - launchedAt > SYNC_APPLY_WINDOW_MS) return;
    chosen = id;
    publish();
  });
}

/** What lists of rides, events and places filter by: the activity while Activities is on, else nothing. */
export function useDiscoverActivity(): ActivityId | undefined {
  const { activity, on } = useActivity();
  return on ? activity : undefined;
}
