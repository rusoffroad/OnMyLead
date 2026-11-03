/**
 * Bluetooth Sharing: with no cell service, Ride Mode passes riders' spots, status taps and quick
 * replies to nearby riders on the same ride, phone to phone (modules/onmylead-nearby is the radio,
 * core/nearby.ts the packets and relay rules). When any phone gets service back, it uploads what
 * it heard (bluetooth_relay_upload), so the whole group shows up for everyone else too.
 *
 * Safe everywhere: on the website and in builds without the module, `nearbyAvailable` is false and
 * every function here does nothing.
 *
 * One session at a time, for the ride open in Ride Mode. The keys come from the server while the
 * rider has service and are kept on the phone (SecureStore) for that ride, so a ride opened with
 * no service still works if it was opened once with service.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import {
  NEARBY_INBOX_UUID, NEARBY_OUTBOX_UUID, NEARBY_SERVICE_UUID, NearbyMesh, fromBase64, fromE7, sealFrame, toBase64, uploadRow,
  type NearbyItem, type NearbyPosition, type NearbyStatus,
} from '@/core/nearby';
import { supabase } from './supabase';
import type { Position, RiderStatusKind } from './types';

type NearbyNative = {
  isSupported(): boolean;
  start(service: string, inbox: string, outbox: string): void;
  stop(): void;
  setOutgoing(frames: string[]): void;
  sendNow(frames: string[]): void;
  drain(): string[];
  getState(): { state: string; peers: number };
  addListener(event: 'onFrame', l: (e: { data: string }) => void): { remove(): void };
  addListener(event: 'onState', l: (e: { state: string; peers: number }) => void): { remove(): void };
};

const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<NearbyNative>('OnMyLeadNearby');

/** This build has the Bluetooth module and the phone has Bluetooth Low Energy. */
export const nearbyAvailable = (() => {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
})();

/** 'on' | 'off' (Bluetooth switched off) | 'unauthorized' | 'unsupported' | 'idle' (not running). */
export type NearbyRadioState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'starting' | 'idle';

export type NearbyView = {
  state: NearbyRadioState;
  /** Phones connected right now. */
  peers: number;
  /** Newest spot heard over Bluetooth per rider, shaped like a server row. */
  positions: Record<string, Position>;
  /** Newest status tap heard over Bluetooth per rider. */
  statuses: Record<string, { id: string; user_id: string; status: RiderStatusKind; tapped_at: string; lat: number | null; lng: number | null; possible_crash: boolean }>;
  /** Quick replies heard over Bluetooth, newest first. */
  replies: { id: string; user_id: string; body: string; at: string }[];
};

const EMPTY: NearbyView = { state: 'idle', peers: 0, positions: {}, statuses: {}, replies: [] };

const ROUND_MS = 4_000;
const UPLOAD_MS = 20_000;

type Session = {
  rideId: string;
  mesh: NearbyMesh;
  sharing: boolean;
  timer: ReturnType<typeof setInterval>;
  subs: { remove(): void }[];
  lastUpload: number;
};

let session: Session | null = null;
let view: NearbyView = EMPTY;
const listeners = new Set<() => void>();

function publish(next: Partial<NearbyView>) {
  view = { ...view, ...next };
  listeners.forEach((l) => l());
}

const nonce = () => Crypto.getRandomBytes(12);

// ---------------------------------------------------------------------------
// The rider's own switch (You > Bluetooth Sharing). On unless they turned it off.
// ---------------------------------------------------------------------------

const SETTING_KEY = 'nearby.bluetooth.v1';
let settingOn = true;
let settingLoaded: Promise<void> | null = null;
const settingListeners = new Set<() => void>();

function loadSetting() {
  settingLoaded ??= AsyncStorage.getItem(SETTING_KEY)
    .then((v) => {
      if (v === '0' || v === '1') settingOn = v === '1';
      settingListeners.forEach((f) => f());
    })
    .catch(() => {});
  return settingLoaded;
}

export function setBluetoothSharing(next: boolean) {
  settingOn = next;
  AsyncStorage.setItem(SETTING_KEY, next ? '1' : '0').catch(() => {});
  settingListeners.forEach((f) => f());
  if (!next) stopNearby();
}

function subscribeSetting(l: () => void) {
  settingListeners.add(l);
  loadSetting();
  return () => {
    settingListeners.delete(l);
  };
}

export function useBluetoothSharingSetting(): [boolean, (on: boolean) => void] {
  const v = useSyncExternalStore(subscribeSetting, () => settingOn, () => settingOn);
  return [v, setBluetoothSharing];
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const keyName = (rideId: string) => `nearby.keys.${rideId.replace(/[^a-zA-Z0-9]/g, '')}`;

async function loadKeys(rideId: string): Promise<{ rideKey: Uint8Array; riderKey: Uint8Array } | null> {
  try {
    const { data, error } = await supabase.rpc('bluetooth_ride_keys', { p_ride: rideId });
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row?.ride_key && row?.rider_key) {
      await SecureStore.setItemAsync(keyName(rideId), JSON.stringify(row)).catch(() => {});
      return { rideKey: fromBase64(row.ride_key), riderKey: fromBase64(row.rider_key) };
    }
    // The server answered no (left the ride, ride over, or a server without this feature yet).
    if (error && !/fetch|network|timed? ?out/i.test(error.message)) {
      await SecureStore.deleteItemAsync(keyName(rideId)).catch(() => {});
      return null;
    }
  } catch {
    // No service: fall back to the keys saved last time.
  }
  try {
    const saved = await SecureStore.getItemAsync(keyName(rideId));
    if (!saved) return null;
    const row = JSON.parse(saved) as { ride_key: string; rider_key: string };
    return { rideKey: fromBase64(row.ride_key), riderKey: fromBase64(row.rider_key) };
  } catch {
    return null;
  }
}

/** Drops a ride's saved keys (the ride ended or the rider left). */
export async function forgetNearbyKeys(rideId: string) {
  await SecureStore.deleteItemAsync(keyName(rideId)).catch(() => {});
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function askAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 31) return true;
  const perms = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
  ];
  try {
    const have = await Promise.all(perms.map((p) => PermissionsAndroid.check(p)));
    if (have.every(Boolean)) return true;
    const res = await PermissionsAndroid.requestMultiple(perms);
    return perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

/**
 * Starts Bluetooth Sharing for a ride (Ride Mode calls this). Does nothing if it is already
 * running for this ride, the rider switched it off, or the phone can't.
 */
export async function startNearby(rideId: string, myId: string): Promise<void> {
  if (!native || !nearbyAvailable) return;
  await loadSetting();
  if (!settingOn) return;
  if (session?.rideId === rideId) return;
  stopNearby();
  const keys = await loadKeys(rideId);
  if (!keys) return;
  if (!(await askAndroidPermission())) {
    publish({ ...EMPTY, state: 'unauthorized' });
    return;
  }
  // Another start may have won while this one waited.
  if (session) return;
  const mesh = new NearbyMesh({ rideId, ...keys }, myId);
  const subs = [
    native.addListener('onFrame', (e) => receive(e.data)),
    native.addListener('onState', (e) => publish({ state: e.state as NearbyRadioState, peers: e.peers })),
  ];
  const timer = setInterval(round, ROUND_MS);
  session = { rideId, mesh, sharing: false, timer, subs, lastUpload: 0 };
  publish({ ...EMPTY, state: 'starting' });
  try {
    native.start(NEARBY_SERVICE_UUID, NEARBY_INBOX_UUID, NEARBY_OUTBOX_UUID);
  } catch {
    stopNearby();
  }
}

export function stopNearby() {
  const s = session;
  if (!s) return;
  session = null;
  clearInterval(s.timer);
  s.subs.forEach((x) => x.remove());
  try {
    native?.stop();
  } catch {}
  publish(EMPTY);
}

/** Only riders sharing their location send it. Ride Mode keeps this in step with the share. */
export function setNearbySharing(rideId: string, sharing: boolean) {
  const s = session;
  if (!s || s.rideId !== rideId || s.sharing === sharing) return;
  s.sharing = sharing;
  if (!sharing) s.mesh.clearOwnPosition();
  pushOutgoing();
}

/** This rider's newest fix (lib/location.ts calls this for every fix, even with the screen off). */
export function nearbyOwnFix(fix: { lat: number; lng: number; accuracyM: number | null; speedMps: number | null; headingDeg: number | null; at: number }) {
  const s = session;
  if (!s?.sharing) return;
  if (s.mesh.ownPosition(fix)) pushOutgoing();
}

/** A status tap that couldn't go out over the internet (lib/outbox.ts). */
export function nearbyStatus(rideId: string, t: { id?: string; status: RiderStatusKind; lat: number | null; lng: number | null; tappedAt: string; possibleCrash?: boolean }) {
  const s = session;
  if (!s || s.rideId !== rideId || !t.id || !native) return;
  const item = s.mesh.ownStatus({ id: t.id, status: t.status, flags: t.possibleCrash ? 1 : 0, lat: t.lat, lng: t.lng, at: Date.parse(t.tappedAt) });
  sendNow([item]);
}

/** A quick reply that couldn't go out over the internet (lib/outbox.ts). */
export function nearbyReply(rideId: string, r: { id?: string; body: string; tappedAt: string }) {
  const s = session;
  if (!s || s.rideId !== rideId || !r.id || !native) return;
  sendNow([s.mesh.ownReply({ id: r.id, body: r.body, at: Date.parse(r.tappedAt) })]);
}

/** A tap the rider cancelled stops going out. */
export function nearbyForget(id: string) {
  session?.mesh.forget(id);
  pushOutgoing();
}

function sendNow(items: NearbyItem[]) {
  const s = session;
  if (!s || !native) return;
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    // Out at once, then again every round for as long as it is worth passing on.
    native.sendNow(items.map((i) => toBase64(sealFrame(s.mesh.keys.rideKey, i, nonce(), nowSec))));
  } catch {}
  pushOutgoing();
}

function pushOutgoing() {
  const s = session;
  if (!s || !native) return;
  try {
    native.setOutgoing(s.mesh.outgoing(Date.now(), nonce).map(toBase64));
  } catch {}
}

export type NearbyEvent =
  | { kind: 'position'; position: Position }
  | { kind: 'status'; status: NearbyView['statuses'][string] }
  | { kind: 'reply'; reply: NearbyView['replies'][number] };

const itemListeners = new Set<(e: NearbyEvent) => void>();

/** Each new spot, tap or reply heard over Bluetooth, as it arrives. Returns the unsubscribe. */
export function onNearbyEvent(l: (e: NearbyEvent) => void): () => void {
  itemListeners.add(l);
  return () => {
    itemListeners.delete(l);
  };
}

function emit(e: NearbyEvent) {
  itemListeners.forEach((l) => l(e));
}

function receive(b64: string) {
  const s = session;
  if (!s) return;
  let item: NearbyItem | null = null;
  try {
    item = s.mesh.receive(fromBase64(b64), Date.now());
  } catch {
    item = null;
  }
  if (!item) return;
  if (item.kind === 'position') {
    const position = asPosition(item);
    publish({ positions: { ...view.positions, [item.userId]: position } });
    emit({ kind: 'position', position });
  } else if (item.kind === 'status') {
    const status = asStatus(item);
    const prev = view.statuses[item.userId];
    if (!prev || Date.parse(prev.tapped_at) <= item.at * 1000) publish({ statuses: { ...view.statuses, [item.userId]: status } });
    emit({ kind: 'status', status });
  } else {
    const reply = { id: item.id, user_id: item.userId, body: item.body, at: new Date(item.at * 1000).toISOString() };
    publish({ replies: [reply, ...view.replies].slice(0, 50) });
    emit({ kind: 'reply', reply });
  }
  // A new item goes on to the next phone with the next round.
}

function round() {
  const s = session;
  if (!s || !native) return;
  // Packets that arrived while JavaScript was paused (screen off) are waiting in the module.
  try {
    for (const f of native.drain()) receive(f);
  } catch {}
  pushOutgoing();
  // Drop riders whose last spot is too old to pass on.
  const live = new Set(s.mesh.heardPositions().map((p) => p.userId));
  if (Object.keys(view.positions).some((id) => !live.has(id))) {
    publish({ positions: Object.fromEntries(Object.entries(view.positions).filter(([id]) => live.has(id))) });
  }
  if (Date.now() - s.lastUpload >= UPLOAD_MS) {
    s.lastUpload = Date.now();
    void upload(s);
  }
}

/** Gives the server what this phone heard. Quietly does nothing without service. */
async function upload(s: Session) {
  const items = s.mesh.pendingUploads();
  if (!items.length) return;
  try {
    const { error } = await supabase.rpc('bluetooth_relay_upload', { p_ride: s.rideId, p_items: items.map(uploadRow) });
    // The server checked every item; the ones it skipped (stale, not sharing) won't pass later either.
    if (!error) s.mesh.markUploaded(items);
  } catch {
    // No service yet.
  }
}

function asPosition(p: NearbyPosition): Position {
  return {
    user_id: p.userId,
    lat: fromE7(p.latE7),
    lng: fromE7(p.lngE7),
    speed_mps: p.speedCms == null ? null : p.speedCms / 100,
    heading_deg: p.headingDd == null ? null : p.headingDd / 10,
    accuracy_m: p.accuracyM,
    last_moved_at: null,
    recorded_at: new Date(p.at * 1000).toISOString(),
  };
}

function asStatus(s: NearbyStatus) {
  return {
    id: s.id, user_id: s.userId, status: s.status, tapped_at: new Date(s.at * 1000).toISOString(),
    lat: s.latE7 == null ? null : fromE7(s.latE7), lng: s.lngE7 == null ? null : fromE7(s.lngE7),
    possible_crash: (s.flags & 1) === 1,
  };
}

/** What Bluetooth Sharing knows right now, for Ride Mode. */
function subscribeView(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useNearby(): NearbyView {
  return useSyncExternalStore(subscribeView, () => view, () => EMPTY);
}
