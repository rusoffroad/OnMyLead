import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import {
  addCall, dropCall, endedCalls, isNewerTap, newestTapPerRider, parseSirenSetting, rememberSilenced, shouldSound, sirenSettingValue, SIREN_SETTING_KEY, type EmergencyCall,
  SIREN_REMEMBER,
} from '@/core/siren';
import { onSyncedChange, setSyncedItem } from './settings-sync';
import { supabase } from './supabase';
import { criticalUrgentUp, onUrgentChange } from './urgent-modal';

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
// Taps taken back that were never a call here (most are not EMERGENCY): kept for this run only, so
// a late copy can't sound, without crowding the saved list of silenced calls.
const endedHere = new Set<string>();
// Bluetooth EMERGENCY ids already shown as a plain notification (siren switched off).
const plainNotified = new Set<string>();
// Calls already left on the lock screen as a quiet reminder: once each.
const reminded = new Set<string>();
// Each ride's latest status per rider, as Ride Mode last saw it, so a call that arrives later by
// push is checked against it too.
const knownLatest: Record<string, Record<string, { id?: string | null; status: string; at: number }>> = {};
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const settingListeners = new Set<(on: boolean) => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a local notification with the siren for a call that came over Bluetooth while the app was in the background (lib/push.ts). */
let backgroundNotifier: ((c: EmergencyCall, plain?: boolean, quiet?: boolean) => void) | null = null;
/** Takes silenced calls' notifications off the phone, so their own siren sound stops too (lib/push.ts). */
let silencedHook: ((ids: string[]) => void) | null = null;
export function setSirenSilencedHook(fn: ((ids: string[]) => void) | null) {
  silencedHook = fn;
}

export function setBackgroundSirenNotifier(fn: ((c: EmergencyCall, plain?: boolean, quiet?: boolean) => void) | null) {
  backgroundNotifier = fn;
}

export function loadSiren(): Promise<void> {
  loaded ??= AsyncStorage.multiGet([SIREN_SETTING_KEY, SILENCED_KEY])
    .then(([[, on], [, ids]]) => {
      // A switch flipped (here or on another device) before the read finished wins.
      if (!settingChanged) enabled = parseSirenSetting(on);
      try {
        const list = JSON.parse(ids ?? '[]');
        if (Array.isArray(list)) silenced = rememberSilenced(list.filter((x) => typeof x === 'string'), silenced);
      } catch {}
      silencedSet = new Set([...silenced, ...endedHere]);
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

/** Whether this call was silenced (or ended) on this phone. */
export function sirenSilenced(id: string): boolean {
  return silencedSet.has(id);
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
  if (!Number.isFinite(at) || !shouldSound({ ...e, at }, { me, enabled, silenced: silencedSet, now: Date.now() })) return false;
  // Already sounding, or would join the list (not an older call from a rider with a newer one).
  if (calls.some((c) => c.id === e.id)) return true;
  const call: EmergencyCall = { id: e.id!, rideId: e.rideId, userId: e.userId, at, tappedAt: e.tappedAt ?? (e.source === 'push' ? undefined : at), name: e.name, possibleCrash: e.possibleCrash };
  if (endedCalls([call], call.rideId, knownLatest[call.rideId] ?? {}).length) return false;
  return addCall(calls, call) !== calls;
}

/** A status reached this phone. Starts the siren when it is another rider's fresh EMERGENCY. */
export function raiseEmergency(e: IncomingEmergency, me: string | null) {
  void loadSiren().then(() => {
    const at = typeof e.at === 'number' ? e.at : Date.parse(e.at);
    if (!Number.isFinite(at)) return;
    // Ride Mode and Bluetooth hand over the tap time itself as `at`: that is the tap time.
    const tappedAt = e.tappedAt ?? (e.source === 'push' ? undefined : at);
    const call: EmergencyCall = { id: e.id!, rideId: e.rideId, userId: e.userId, at, tappedAt, name: e.name, possibleCrash: e.possibleCrash };
    if (!shouldSound({ ...e, at }, { me, enabled, silenced: silencedSet, now: Date.now() })) {
      // Siren switched off: an EMERGENCY heard over Bluetooth in the background still gets a
      // notification with the normal sound, once (no service means no push brings it).
      const wouldSound = shouldSound({ ...e, at }, { me, enabled: true, silenced: silencedSet, now: Date.now() });
      if (!enabled && wouldSound && e.source === 'bluetooth' && AppState.currentState !== 'active' && !plainNotified.has(call.id)) {
        plainNotified.add(call.id);
        backgroundNotifier?.(call, true);
      }
      return;
    }
    // Ride Mode already shows a newer tap from this rider: it's over before it sounds.
    if (endedCalls([call], call.rideId, knownLatest[call.rideId] ?? {}).length) {
      markEnded(call.id);
      return;
    }
    const isNew = !calls.some((c) => c.id === call.id);
    const next = addCall(calls, call);
    if (next === calls) return;
    // Another call from the same rider replaces the older one: its notification goes, but it isn't
    // silenced (if the newer one is taken back, the older one can sound again).
    const replaced = calls.filter((c) => !next.some((n) => n.id === c.id)).map((c) => c.id);
    if (replaced.length) silencedHook?.(replaced);
    calls = next;
    emit();
    if (isNew && AppState.currentState !== 'active' && e.source === 'bluetooth') backgroundNotifier?.(call);
    update();
  });
}

/** A call is over: the rider took the tap back or tapped something newer. Never sounds again. */
/** Ends a call for this run only, keeping the list to SIREN_REMEMBER ids. */
function markEnded(id: string) {
  if (endedHere.has(id)) return;
  if (endedHere.size >= SIREN_REMEMBER) {
    const oldest = endedHere.values().next().value as string;
    endedHere.delete(oldest);
    if (!silenced.includes(oldest)) silencedSet.delete(oldest);
  }
  endedHere.add(id);
  silencedSet.add(id);
}

/**
 * A newer tap from the rider ended this call. Kept for this run only (not saved as silenced), so
 * it can't sound again now; if the rider needs help again they tap EMERGENCY again, a new call.
 */
function endByTap(callId: string) {
  if (!calls.some((c) => c.id === callId)) return;
  markEnded(callId);
  silencedHook?.([callId]);
  calls = dropCall(calls, callId);
  emit();
  update();
}

/** A rider took a tap back (Ride Mode's cancel, a cancelled push): it ends a call of that id, and no longer counts as their newest. */
export function tapTakenBack(id: string) {
  for (const ride of Object.values(knownLatest))
    for (const [u, k] of Object.entries(ride)) if (k.id === id) delete ride[u];
  endEmergency(id);
}

export function endEmergency(id: string) {
  if (!calls.some((c) => c.id === id)) {
    markEnded(id);
    return;
  }
  remember([id]);
  silencedHook?.([id]);
  calls = dropCall(calls, id);
  emit();
  update();
}

/** Ride Mode's latest status per rider: calls whose rider has tapped something newer are over. */
export function endStaleCalls(rideId: string, latest: Record<string, { id?: string | null; status: string; tapped_at: string } | undefined>) {
  const now: Record<string, { id?: string | null; status: string; at: number }> = {};
  const iso = (at: number) => new Date(at).toISOString();
  for (const [u, st] of Object.entries(latest)) {
    const at = st ? Date.parse(st.tapped_at) : NaN;
    if (st && Number.isFinite(at)) now[u] = { id: st.id, status: st.status, at };
  }
  // Keep a newer tap learned another way (a push, the server check) over Ride Mode's older one.
  const before = knownLatest[rideId] ?? {};
  for (const [u, k] of Object.entries(before)) {
    const n = now[u];
    if (!n || isNewerTap({ id: n.id, status: n.status, tapped_at: iso(n.at) }, { id: k.id, status: k.status, tapped_at: iso(k.at) })) now[u] = k;
  }
  knownLatest[rideId] = now;
  for (const id of endedCalls(calls, rideId, now)) endByTap(id);
}

/**
 * A later status from a rider reached this phone outside Ride Mode (a push for I'm OK, Stopped...):
 * it ends that rider's call just as Ride Mode's newer status would.
 */
export function noteRiderTap(rideId: string, userId: string, tap: { id: string; status: string; tapped_at: string }) {
  const at = Date.parse(tap.tapped_at);
  if (!Number.isFinite(at)) return;
  const known = knownLatest[rideId]?.[userId];
  if (known?.id && !isNewerTap({ id: known.id, status: known.status, tapped_at: new Date(known.at).toISOString() }, tap)) return;
  knownLatest[rideId] = { ...knownLatest[rideId], [userId]: { id: tap.id, status: tap.status, at } };
  for (const id of endedCalls(calls, rideId, knownLatest[rideId])) endByTap(id);
}

/** Whether this call is waiting (sounding or on the siren screen). */
export function sirenHasCall(id: string): boolean {
  return calls.some((c) => c.id === id);
}

/** Sign-out: the last account's waiting calls and what was known about its rides go. */
export function resetSirenCalls() {
  for (const k of Object.keys(knownLatest)) delete knownLatest[k];
  reminded.clear();
  plainNotified.clear();
  if (!calls.length) return;
  // Their notifications (tray alarm, lock-screen reminder) go too.
  silencedHook?.(calls.map((c) => c.id));
  calls = [];
  emit();
  update();
}

/** The rider silenced one call (a notification tap counts too). */
export function silenceEmergency(id: string) {
  // Saved even when it isn't sounding yet (a notification tap on a cold start), so it never sounds.
  if (!calls.some((c) => c.id === id) && !silenced.includes(id)) remember([id]);
  endEmergency(id);
}

/** Silence Siren: every call waiting. */
export function silenceAll() {
  if (calls.length) {
    remember(calls.map((c) => c.id));
    silencedHook?.(calls.map((c) => c.id));
  }
  calls = [];
  emit();
  update();
}

function remember(ids: string[]) {
  silenced = rememberSilenced(silenced, ids);
  silencedSet = new Set([...silenced, ...endedHere]);
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
  // Quiet while this rider's own Crash Alert countdown is up: its screen and voice come first.
  // Not only 'active': iPhone's 'inactive' (Control Center or Face ID over the app) still counts.
  const want = calls.length > 0 && AppState.currentState !== 'background' && !criticalUrgentUp();
  // Just back in front: wait for the resume moment, so a notification tap can silence its call first.
  if (want && resume) return;
  if (want) {
    // The in-app siren takes over from any siren notification still in the tray (Android alarm).
    // (`buzz` runs only for a real call; the Play Siren sample sounds without it.)
    // Android only: on iPhone and iPad the push's entry stays, quiet, in Notification Center.
    if (!buzz && Platform.OS === 'android') {
      silencedHook?.(calls.map((c) => c.id));
      // That took any lock-screen reminder down too: the next trip away posts it again.
      for (const c of calls) reminded.delete(c.id);
    }
    startSound();
    startBuzz();
  } else if (sample && !buzz) {
    // Only the three-second Play Siren sample is playing: let it finish.
  } else {
    // A real call was sounding (its buzz runs) and is over or silenced: stop now, sample or not.
    if (sample) clearTimeout(sample);
    sample = null;
    stopSound();
  }
}

// The server's word on each waiting call, so a rider's I'm OK or cancel that this phone missed (it
// came while the app was away, or that kind of notification is off here) still ends it: checked when
// the app comes back and every 20 s while a call waits.
async function checkCallsOnServer() {
  // Calls from an older server don't name the rider: look those up by id, for a cancel.
  const unnamed = calls.filter((c) => c.userId.startsWith('item:'));
  if (unnamed.length) {
    const { data } = await supabase.from('rider_statuses').select('id, cancelled_at').in('id', unnamed.map((c) => c.id));
    for (const r of (data ?? []) as { id: string; cancelled_at?: string | null }[]) if (r.cancelled_at) tapTakenBack(r.id);
  }
  const waiting = calls.filter((c) => !c.userId.startsWith('item:'));
  // The rides are separate: ask for each at once.
  await Promise.all([...new Set(waiting.map((c) => c.rideId))].map(async (rideId) => {
    const mine = waiting.filter((c) => c.rideId === rideId);
    // Each waiting rider's own newest taps (one rider's many taps can't crowd out another's).
    type Row = { id: string; user_id: string; status: string; tapped_at: string; cancelled_at?: string | null };
    const pages = await Promise.all([...new Set(mine.map((c) => c.userId))].map((u) =>
      supabase.from('rider_statuses').select('id, user_id, status, tapped_at, cancelled_at')
        .eq('ride_id', rideId).eq('user_id', u).order('tapped_at', { ascending: false }).limit(20)));
    const rows: Row[] = pages.flatMap((p) => (p.error ? [] : ((p.data ?? []) as Row[])));
    for (const c of mine) {
      if (rows.some((r) => r.id === c.id && r.cancelled_at)) {
        tapTakenBack(c.id);
        continue;
      }
      // The same newest-tap rule as Ride Mode (ties included).
      const newest = newestTapPerRider(rows.filter((r) => r.user_id === c.userId && !r.cancelled_at))[c.userId];
      if (!newest) continue;
      // A newer EMERGENCY from the same rider takes this call's place (addCall replaces it).
      if (newest.status === 'emergency' && newest.id !== c.id)
        raiseEmergency({ id: newest.id, rideId: c.rideId, userId: c.userId, status: 'emergency', at: newest.tapped_at, name: c.name, source: 'ride' }, null);
      else noteRiderTap(c.rideId, c.userId, newest);
    }
  }));
}
let checking = false;
function checkSoon() {
  if (checking || !calls.length) return;
  checking = true;
  void checkCallsOnServer().catch(() => {}).finally(() => (checking = false));
}
setInterval(() => {
  if (calls.length && AppState.currentState === 'active') checkSoon();
}, 20_000);

// Website: a browser that refused to play before the first click gets another try on each click.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // 'click' counts as the rider's gesture on touch screens too; play() runs right in it.
  document.addEventListener('click', () => {
    // play() doesn't say it was refused: a call waiting while nothing plays gets started again.
    if (!calls.length || !sounding || player?.playing) return;
    const p = getPlayer();
    if (!p) return;
    p.loop = true;
    p.volume = 1;
    p.play();
  });
}

// The countdown came or went: the siren stops for it, and sounds again after.
onUrgentChange(() => update());

AppState.addEventListener('change', (s) => {
  if (resume) clearTimeout(resume);
  resume = null;
  if (s === 'active') checkSoon();
  if (s === 'active')
    resume = setTimeout(() => {
      resume = null;
      update();
    }, RESUME_DELAY_MS);
  else {
    // Gone to the background with calls not silenced yet (the screen locked before the rider
    // looked): the in-app siren stops, so each stays on the lock screen as a quiet reminder. No
    // sound, so it never plays over the dialer when the rider leaves to call 911.
    if (s === 'background')
      for (const c of calls) {
        if (reminded.has(c.id)) continue;
        reminded.add(c.id);
        backgroundNotifier?.(c, false, true);
      }
    update();
  }
});

function getPlayer(): AudioPlayer | null {
  try {
    player ??= createAudioPlayer(require('../../assets/sounds/siren.wav'));
    return player;
  } catch {
    return null;
  }
}

// Audio session changes run one after another, so a stop and a quick restart can't land out of order.
let audioChain: Promise<unknown> = Promise.resolve();
function audioStep(fn: () => Promise<unknown>): Promise<unknown> {
  audioChain = audioChain.then(fn).catch(() => {});
  return audioChain;
}

let soundGen = 0;

function startSound() {
  if (sounding) return;
  sounding = true;
  // Only this start's setup may play: a stop (or a stop and a new start) since then wins.
  const gen = ++soundGen;
  // Plays with the ring/silent switch on, and lowers the rider's music under it.
  void audioStep(() => setIsAudioActiveAsync(true));
  audioStep(() => setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false, allowsRecording: false }))
    .then(() => {
      // A stop since then (which gives the music back itself) or a newer start wins.
      if (gen !== soundGen) return;
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
  soundGen++;
  try {
    player?.pause();
  } catch {}
  // iPhone and iPad: let the rider's music come back up (the siren ducked it), without switching
  // the app's audio off (a voice prompt may be speaking). Android gives it back when the player pauses.
  if (was && Platform.OS === 'ios') void audioStep(() => setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }));
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
