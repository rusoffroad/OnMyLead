import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import {
  addCall, dropCall, endedCalls, parseSirenSetting, rememberSilenced, shouldSound, sirenSettingValue, SIREN_SETTING_KEY, type EmergencyCall,
} from '@/core/siren';
import { onSyncedChange, setSyncedItem } from './settings-sync';

/**
 * The Emergency Siren on this device (core/siren.ts has the rules). Holds the EMERGENCY calls
 * waiting to be silenced, plays the siren while there are any and the app is in front, and keeps
 * the switch. The siren screen (components/emergency-siren.tsx) shows the calls; Ride Mode and the
 * push listener (lib/push.ts) raise them. Works with no service: Bluetooth calls sound too.
 */

const SILENCED_KEY = 'alerts.sirenSilenced.v1';
/** Coming back to the app, give a notification tap a moment to silence its call before sounding. */
const RESUME_DELAY_MS = 700;

let enabled = true;
let settingChanged = false;
let calls: EmergencyCall[] = [];
let silenced: string[] = [];
let silencedSet = new Set<string>();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const settingListeners = new Set<(on: boolean) => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a local notification with the siren for a call that came over Bluetooth while the app was in the background (lib/push.ts). */
let backgroundNotifier: ((c: EmergencyCall) => void) | null = null;
export function setBackgroundSirenNotifier(fn: ((c: EmergencyCall) => void) | null) {
  backgroundNotifier = fn;
}

export function loadSiren(): Promise<void> {
  loaded ??= AsyncStorage.multiGet([SIREN_SETTING_KEY, SILENCED_KEY])
    .then(([[, on], [, ids]]) => {
      // A switch flipped (here or on another device) before the read finished wins.
      if (!settingChanged) enabled = parseSirenSetting(on);
      try {
        const list = JSON.parse(ids ?? '[]');
        if (Array.isArray(list)) silenced = rememberSilenced(silenced, list.filter((x) => typeof x === 'string'));
      } catch {}
      silencedSet = new Set(silenced);
      settingListeners.forEach((l) => l(enabled));
    })
    .catch(() => {});
  return loaded;
}

// Read at launch, so the push handler and the server get the rider's own choice, not the default.
void loadSiren();

// Switched on another device (lib/settings-sync).
onSyncedChange(SIREN_SETTING_KEY, (v) => {
  const on = parseSirenSetting(v);
  // This device's own change comes back here too: already applied.
  if (settingChanged && on === enabled) return;
  applySetting(on);
});

function applySetting(on: boolean) {
  settingChanged = true;
  enabled = on;
  settingListeners.forEach((l) => l(on));
  if (!on) silenceAll();
}

export function sirenEnabled(): boolean {
  return enabled;
}

/** Listens to the switch (lib/push.ts tells the server). */
export function onSirenSetting(l: (on: boolean) => void): () => void {
  settingListeners.add(l);
  return () => void settingListeners.delete(l);
}

export function setSirenEnabled(on: boolean) {
  applySetting(on);
  setSyncedItem(SIREN_SETTING_KEY, sirenSettingValue(on)).catch(() => {});
}

export function useSirenSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    const off = onSirenSetting(setOn);
    loadSiren().then(() => setOn(enabled));
    return off;
  }, []);
  return [on, setSirenEnabled];
}

export type IncomingEmergency = {
  id?: string | null;
  rideId: string;
  userId: string;
  status: string;
  /** When it was tapped: ms since 1970 or an ISO time. */
  at: number | string;
  /** For a push: when the rider tapped it (`at` is when it arrived, so a late upload still sounds). */
  tappedAt?: number;
  name?: string | null;
  possibleCrash?: boolean;
  cancelled?: boolean;
  /** Where it came from. Only a Bluetooth call needs its own notification in the background (a push already is one). */
  source: 'ride' | 'bluetooth' | 'push';
};

/** Whether this call would sound the siren now (so the push handler only drops the banner then). */
export async function sirenWillSound(e: IncomingEmergency, me: string | null): Promise<boolean> {
  await loadSiren();
  const at = typeof e.at === 'number' ? e.at : Date.parse(e.at);
  return Number.isFinite(at) && shouldSound({ ...e, at }, { me, enabled, silenced: silencedSet, now: Date.now() });
}

/** A status reached this phone. Starts the siren when it is another rider's fresh EMERGENCY. */
export function raiseEmergency(e: IncomingEmergency, me: string | null) {
  void loadSiren().then(() => {
    const at = typeof e.at === 'number' ? e.at : Date.parse(e.at);
    if (!Number.isFinite(at)) return;
    if (!shouldSound({ ...e, at }, { me, enabled, silenced: silencedSet, now: Date.now() })) return;
    const call: EmergencyCall = { id: e.id!, rideId: e.rideId, userId: e.userId, at, tappedAt: e.tappedAt, name: e.name, possibleCrash: e.possibleCrash };
    const isNew = !calls.some((c) => c.id === call.id);
    const next = addCall(calls, call);
    if (next === calls) return;
    // Another call from the same rider replaces the older one: that one needs no silencing.
    const replaced = calls.filter((c) => !next.some((n) => n.id === c.id)).map((c) => c.id);
    if (replaced.length) remember(replaced);
    calls = next;
    emit();
    if (isNew && AppState.currentState !== 'active' && e.source === 'bluetooth') backgroundNotifier?.(call);
    update();
  });
}

/** A call is over: the rider took the tap back or tapped something newer. Never sounds again. */
export function endEmergency(id: string) {
  remember([id]);
  if (!calls.some((c) => c.id === id)) return;
  calls = dropCall(calls, id);
  emit();
  update();
}

/** Ride Mode's latest status per rider: calls whose rider has tapped something newer are over. */
export function endStaleCalls(rideId: string, latest: Record<string, { id?: string | null; status: string; tapped_at: string } | undefined>) {
  const now: Record<string, { id?: string | null; status: string; at: number }> = {};
  for (const [u, st] of Object.entries(latest)) if (st) now[u] = { id: st.id, status: st.status, at: Date.parse(st.tapped_at) };
  for (const id of endedCalls(calls, rideId, now)) endEmergency(id);
}

/** The rider silenced one call (a notification tap counts too). */
export function silenceEmergency(id: string) {
  endEmergency(id);
}

/** Silence Siren: every call waiting. */
export function silenceAll() {
  if (calls.length) remember(calls.map((c) => c.id));
  calls = [];
  emit();
  update();
}

function remember(ids: string[]) {
  silenced = rememberSilenced(silenced, ids);
  silencedSet = new Set(silenced);
  // After the saved list has been read in (loadSiren merges it), so saving never drops it.
  void loadSiren().then(() => AsyncStorage.setItem(SILENCED_KEY, JSON.stringify(silenced))).catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** The calls waiting to be silenced, newest first. */
export function useEmergencyCalls(): EmergencyCall[] {
  return useSyncExternalStore(subscribe, () => calls, () => calls);
}

// ---- The sound ---------------------------------------------------------------------------------

let player: AudioPlayer | null = null;
let sounding = false;
let sample: ReturnType<typeof setTimeout> | null = null;
let buzz: ReturnType<typeof setInterval> | null = null;
let resume: ReturnType<typeof setTimeout> | null = null;

function update() {
  const want = calls.length > 0 && AppState.currentState === 'active';
  if (want) {
    startSound();
    startBuzz();
  } else if (!sample) stopSound();
}

AppState.addEventListener('change', (s) => {
  if (resume) clearTimeout(resume);
  resume = null;
  if (s === 'active') resume = setTimeout(update, RESUME_DELAY_MS);
  else update();
});

function getPlayer(): AudioPlayer | null {
  try {
    player ??= createAudioPlayer(require('../../assets/sounds/siren.wav'));
    return player;
  } catch {
    return null;
  }
}

function startSound() {
  if (sounding) return;
  sounding = true;
  // Plays with the ring/silent switch on, and lowers the rider's music under it.
  setIsAudioActiveAsync(true)
    .catch(() => {})
    .then(() => setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false, allowsRecording: false }))
    .catch(() => {})
    .then(() => {
      if (!sounding) return;
      const p = getPlayer();
      if (!p) return;
      p.loop = true;
      p.volume = 1;
      p.seekTo(0).catch(() => {});
      p.play();
    });
}

function startBuzz() {
  buzz ??= setInterval(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, 1500);
}

function stopSound() {
  const was = sounding;
  sounding = false;
  try {
    player?.pause();
  } catch {}
  // iPhone and iPad: let the rider's music come back up (the siren ducked it). Android gives the
  // audio back when the player pauses, and switching audio off there would mute the next siren.
  if (was && Platform.OS === 'ios') setIsAudioActiveAsync(false).catch(() => {});
  if (buzz) clearInterval(buzz);
  buzz = null;
}

/** Plays the siren for three seconds, so the rider knows what it sounds like (Notifications). */
export function playSirenSample() {
  if (sample) clearTimeout(sample);
  sample = setTimeout(() => {
    sample = null;
    update();
  }, 3000);
  // Sound only; a real call that is waiting (or arrives meanwhile) keeps its vibration (update).
  startSound();
}
