/**
 * Track Line (core/track-line): the breadcrumb of where this phone has been, one colour per day.
 * Stored on the phone only. It takes fixes from Map Mode while it's open and from the ride
 * location task while a ride shares location, so a day out shows up whichever screen was used.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import {
  addFix, parseTrackDays, pruneDays, TRACK_LINE_STORAGE_KEY, TRACK_LINE_SWITCH_KEY, type TrackDays, type TrackFix,
} from '@/core/track-line';

let days: TrackDays = {};
let loaded: Promise<void> | null = null;
let on: boolean | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const [raw, sw] = await Promise.all([AsyncStorage.getItem(TRACK_LINE_STORAGE_KEY), AsyncStorage.getItem(TRACK_LINE_SWITCH_KEY)]);
      days = pruneDays(parseTrackDays(raw ? JSON.parse(raw) : null), Date.now());
      on ??= sw === '1';
    } catch {
      days = {};
    }
    emit();
  })();
  return loaded;
}

function saveSoon() {
  if (saveTimer) return;
  // A fix comes about once a second; writing every 20 s keeps storage quiet and loses little.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(TRACK_LINE_STORAGE_KEY, JSON.stringify(days)).catch(() => {});
  }, 20_000);
}

/** Whether Track Line is on. The switch itself is stored by useRememberedToggle under the same key. */
export async function trackLineOn(): Promise<boolean> {
  await load();
  return !!on;
}

/** Called by the switch, so the ride location task picks it up without reading storage each fix. */
export function setTrackLineOn(next: boolean) {
  on = next;
}

/** Add fixes if Track Line is on. Never throws. */
export async function recordTrackFixes(fixes: TrackFix[]) {
  try {
    if (!(await trackLineOn())) return;
    let next = days;
    for (const f of fixes) next = addFix(next, f);
    if (next === days) return;
    days = next;
    emit();
    saveSoon();
  } catch {
    // Storage full or unavailable: the breadcrumb just pauses.
  }
}

/** Save now (leaving Map Mode, app to background). */
export function flushTrackLine() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  AsyncStorage.setItem(TRACK_LINE_STORAGE_KEY, JSON.stringify(days)).catch(() => {});
}

/** Wipe every day (the Clear button in Map Mode). */
export async function clearTrackLine() {
  days = {};
  emit();
  await AsyncStorage.removeItem(TRACK_LINE_STORAGE_KEY).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  void load();
  return () => listeners.delete(l);
};

/** The stored days, live as fixes come in. */
export function useTrackDays(): TrackDays {
  return useSyncExternalStore(subscribe, () => days, () => days);
}
