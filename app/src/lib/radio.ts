/**
 * Radio Sharing: the rider's own Meshtastic radio carries the same encrypted Bluetooth Sharing
 * packets (spots, status taps, EMERGENCY, ride chat messages, receipts) miles instead of a few
 * hundred feet. The packets and the mesh rules are Bluetooth Sharing's (core/nearby.ts, lib/nearby.ts);
 * this file only links the radio (modules/onmylead-mesh-radio), speaks Meshtastic's phone protocol
 * (core/meshtastic.ts) and decides what goes on the air (core/radio-share.ts).
 *
 * Runs only when all of these are true, so it can't change anything for riders without a radio:
 * the Admin switch radio_sharing is on (it starts off), this build has the module, the rider paired
 * a radio under You > Radio Sharing, and Bluetooth Sharing is running in Ride Mode (or the Radio
 * Sharing page is open, to show the radio's status). Everything it calls in lib/nearby is caught.
 *
 * What it does not do: change any of the radio's own settings. OnMyLead packets go on the radio's
 * main channel on OnMyLead's own port, sealed with the ride key; other Meshtastic users' apps
 * don't show them, and their radios relay them without being able to read them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import {
  MESHTASTIC_FROMNUM_UUID, MESHTASTIC_FROMRADIO_UUID, MESHTASTIC_SERVICE_UUID, MESHTASTIC_TORADIO_UUID, ONMYLEAD_PORT, PRIORITY, REGION_UNSET,
  readFromRadio, toRadioPacket, wantConfig, type ModemPreset,
} from '@/core/meshtastic';
import { fromBase64, openFrame, roundKey, sealFrame, toBase64, type NearbyItem } from '@/core/nearby';
import { markSent, pick, usedLastMinute, type RadioSent } from '@/core/radio-share';
import { flagNow, onAppSettingsChange } from './app-settings';
import { askBluetoothPermission, attachNearbyRadio, bluetoothPermission, nearbyFromRadio, nearbyMeshFor } from './nearby';

type RadioNative = {
  isSupported(): boolean;
  configure(service: string, toRadio: string, fromRadio: string, fromNum: string): void;
  startScan(): void;
  stopScan(): void;
  connect(id: string): void;
  disconnect(): void;
  write(b64: string): void;
  getState(): string;
  addListener(event: 'onDevice', l: (e: { id: string; name: string; rssi: number }) => void): { remove(): void };
  addListener(event: 'onState', l: (e: { state: string; id: string }) => void): { remove(): void };
  addListener(event: 'onFromRadio', l: (e: { data: string }) => void): { remove(): void };
};

const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<RadioNative>('OnMyLeadMeshRadio');

/** This build has the radio module and the phone has Bluetooth Low Energy. */
export const radioAvailable = (() => {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
})();

/**
 * The link as the module reports it, plus 'ready' once the radio sent its settings:
 * idle | connecting | connected | ready | disconnected | off | unauthorized | unsupported |
 * not_found | not_meshtastic | pairing_failed.
 */
export type RadioLinkState = string;

/** Why the radio can't carry ride packets, if it can't. */
export type RadioProblem = 'region' | 'ham' | 'tx_off' | null;

export type SavedRadio = { id: string; name: string };
export type FoundRadio = { id: string; name: string; rssi: number };

export type RadioView = {
  link: RadioLinkState;
  saved: SavedRadio | null;
  /** The radio's own name and battery (0-100, 101 = plugged in). */
  name: string | null;
  battery: number | null;
  /** Percent of the time the channel is busy. */
  channelUtil: number | null;
  preset: ModemPreset | null;
  problem: RadioProblem;
  /** OnMyLead packets heard from the radio this session, and sent to it. */
  heard: number;
  sent: number;
  lastHeardAt: number | null;
  /** Whether ride packets are going over the radio right now (a ride is open in Ride Mode). */
  sharing: boolean;
  /** Radios found by a scan (Pair a Radio). */
  found: FoundRadio[];
  scanning: boolean;
};

const EMPTY: RadioView = {
  link: 'idle', saved: null, name: null, battery: null, channelUtil: null, preset: null, problem: null,
  heard: 0, sent: 0, lastHeardAt: null, sharing: false, found: [], scanning: false,
};

let view: RadioView = EMPTY;
const listeners = new Set<() => void>();

function publish(next: Partial<RadioView>) {
  view = { ...view, ...next };
  listeners.forEach((l) => l());
}

export function useRadio(): RadioView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => view,
    () => EMPTY,
  );
}

const SAVED_KEY = 'radio.saved.v1';
/** How often the radio round runs while a ride is shared. */
const ROUND_MS = 5_000;
/** A radio silent this long no longer counts as a ride peer. */
const PEER_MS = 10 * 60_000;
/** Packets the radio's own queue can hold before OnMyLead waits (most radios: 16). */
const RADIO_QUEUE_LOW = 3;

const rand32 = () => {
  const b = Crypto.getRandomBytes(4);
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let started = false;
/** The ride Bluetooth Sharing is running for, if any. */
let ride: { rideId: string; myId: string } | null = null;
/** The Radio Sharing page is open (keeps the link up to show status). */
let pageOpen = 0;
let myNode: number | null = null;
let configId: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let queueFree: number | null = null;
/** The radio is in licensed (ham) mode, from its node info; the rest of `problem` comes from its LoRa settings. */
let ham = false;
let loraProblem: RadioProblem = null;
const sent = new Map<string, RadioSent>();
const airLog: [number, number][] = [];
/** Items heard from the radio by roundKey: the item's own time and when it was heard, so that copy isn't sent back to it. */
const fromRadio = new Map<string, { at: number; heardAt: number }>();
/** Other radios heard carrying this ride's packets, with when. */
const peers = new Map<number, number>();

const on = () => radioAvailable && flagNow('radio_sharing');

// ---------------------------------------------------------------------------
// Start (root layout): reads the paired radio and attaches to Bluetooth Sharing when switched on.
// ---------------------------------------------------------------------------

/** Called once from the root layout. Does nothing on the website or in builds without the module. */
export function startRadio() {
  if (started || !native || !radioAvailable) return;
  started = true;
  try {
    native.configure(MESHTASTIC_SERVICE_UUID, MESHTASTIC_TORADIO_UUID, MESHTASTIC_FROMRADIO_UUID, MESHTASTIC_FROMNUM_UUID);
  } catch {
    return;
  }
  // Kept for the life of the app, like the module itself.
  native.addListener('onDevice', (e) => foundRadio(e));
  native.addListener('onState', (e) => linkState(e.state));
  native.addListener('onFromRadio', (e) => fromRadioMessage(e.data));
  AsyncStorage.getItem(SAVED_KEY)
    .then((v) => {
      const s = v ? (JSON.parse(v) as SavedRadio) : null;
      if (s?.id) publish({ saved: { id: String(s.id), name: String(s.name ?? '') } });
    })
    .catch(() => {})
    .finally(() => {
      onAppSettingsChange(syncAttach);
      syncAttach();
    });
}

let attached = false;

/** Attached to Bluetooth Sharing while the Admin switch is on; detached (and the link dropped) when it goes off. */
function syncAttach() {
  if (on() && !attached) {
    attached = true;
    attachNearbyRadio({
      onSession: (s) => {
        // A new ride starts with a clean slate (what went out, what was heard).
        if (s?.rideId !== ride?.rideId) {
          sent.clear();
          airLog.length = 0;
          fromRadio.clear();
          peers.clear();
        }
        ride = s;
        syncLink();
      },
      onNew: () => round(),
    });
  } else if (!on() && attached) {
    attached = false;
    attachNearbyRadio(null);
    ride = null;
    syncLink();
  }
}

/** Connected while it is wanted: a ride is shared over Bluetooth or the page is open. */
function syncLink() {
  if (!native) return;
  const want = on() && !!view.saved && (!!ride || pageOpen > 0);
  publish({ sharing: want && !!ride });
  if (want && view.saved) {
    if (view.link === 'idle' || view.link === 'not_found' || view.link === 'not_meshtastic') {
      try {
        native.connect(view.saved.id);
      } catch {}
    }
    if (ride && !timer) timer = setInterval(round, ROUND_MS);
  } else {
    stopTimer();
    if (view.link !== 'idle') {
      try {
        native.disconnect();
      } catch {}
    }
  }
  if (!ride) stopTimer();
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ---------------------------------------------------------------------------
// Pairing (You > Radio Sharing)
// ---------------------------------------------------------------------------

/** The Radio Sharing page opened (true) or closed (false). */
export function radioPageOpen(open: boolean) {
  pageOpen = Math.max(0, pageOpen + (open ? 1 : -1));
  if (!open) stopRadioScan();
  syncLink();
}

/** Looks for Meshtastic radios nearby (asks for Bluetooth first if needed). */
export async function startRadioScan() {
  if (!native || !on()) return;
  if ((await bluetoothPermission()) !== 'granted') await askBluetoothPermission();
  publish({ found: [], scanning: true });
  try {
    native.startScan();
  } catch {
    publish({ scanning: false });
  }
}

export function stopRadioScan() {
  if (!view.scanning) return;
  try {
    native?.stopScan();
  } catch {}
  publish({ scanning: false });
}

function foundRadio(e: { id: string; name: string; rssi: number }) {
  if (!view.scanning) return;
  const rest = view.found.filter((f) => f.id !== e.id);
  publish({ found: [...rest, { id: e.id, name: e.name || 'Meshtastic', rssi: e.rssi }].sort((a, b) => b.rssi - a.rssi) });
}

/** Pairs this radio: remembered on this phone, connected now (the radio's PIN prompt shows the first time). */
export function pairRadio(r: FoundRadio) {
  stopRadioScan();
  const saved = { id: r.id, name: r.name };
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify(saved)).catch(() => {});
  try {
    native?.disconnect();
  } catch {}
  resetRadio();
  publish({ saved, link: 'idle' });
  syncLink();
}

/** Forgets the paired radio. */
export function forgetRadio() {
  AsyncStorage.removeItem(SAVED_KEY).catch(() => {});
  try {
    native?.disconnect();
  } catch {}
  resetRadio();
  publish({ ...EMPTY, found: view.found });
  syncLink();
}

function resetRadio() {
  ham = false;
  loraProblem = null;
  myNode = null;
  configId = null;
  queueFree = null;
  sent.clear();
  airLog.length = 0;
  fromRadio.clear();
  peers.clear();
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

function linkState(state: string) {
  if (state === 'connected') {
    // Ask for the radio's settings and node list; 'ready' when the matching config_complete_id comes back.
    configId = rand32();
    write(wantConfig(configId));
    publish({ link: 'connected' });
    return;
  }
  if (state !== 'ready') {
    configId = null;
    queueFree = null;
  }
  publish({ link: state });
}

function write(bytes: Uint8Array) {
  try {
    native?.write(toBase64(bytes));
  } catch {}
}

function fromRadioMessage(b64: string) {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(b64);
  } catch {
    return;
  }
  const m = readFromRadio(bytes);
  if (!m) return;
  switch (m.kind) {
    case 'myInfo':
      myNode = m.nodeNum;
      return;
    case 'node':
      if (m.num === myNode) {
        publish({
          name: m.longName || m.shortName || view.saved?.name || null,
          battery: m.battery,
          channelUtil: m.channelUtil,
        });
        ham = m.isLicensed;
        publish({ problem: ham ? 'ham' : loraProblem });
      }
      return;
    case 'lora':
      loraProblem = m.region === REGION_UNSET ? 'region' : !m.txEnabled ? 'tx_off' : null;
      publish({ preset: m.usePreset ? m.preset : 'OTHER', problem: ham ? 'ham' : loraProblem });
      return;
    case 'configComplete':
      if (configId != null && m.id === configId) {
        publish({ link: 'ready' });
        round();
      }
      return;
    case 'rebooted':
      // The radio restarted: ask for its settings again.
      linkState('connected');
      return;
    case 'queue':
      queueFree = m.free;
      return;
    case 'packet':
      if (m.portnum === ONMYLEAD_PORT) heardPacket(m.from, m.payload);
      return;
    default:
      return;
  }
}

function heardPacket(from: number, payload: Uint8Array) {
  if (from === myNode) return;
  const now = Date.now();
  // Which item this is, so it isn't sent back to the radio. Packets for other rides don't open.
  const mesh = ride ? nearbyMeshFor(ride.rideId) : null;
  if (!mesh) return;
  const item = openFrame(mesh.keys.rideKey, payload, Math.floor(now / 1000));
  if (!item) return;
  // A copy of this rider's own packet relayed back: nothing to note (the mesh drops it too).
  if (item.userId === ride?.myId) return;
  const k = roundKey(item);
  if ((fromRadio.get(k)?.at ?? -1) < item.at) fromRadio.set(k, { at: item.at, heardAt: now });
  peers.set(from, now);
  publish({ heard: view.heard + 1, lastHeardAt: now });
  try {
    nearbyFromRadio(payload);
  } catch {}
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function round() {
  const r = ride;
  if (!r || view.link !== 'ready' || view.problem) return;
  const mesh = nearbyMeshFor(r.rideId);
  if (!mesh) return;
  // The radio's own queue is nearly full: let it catch up.
  if (queueFree != null && queueFree < RADIO_QUEUE_LOW) return;
  const now = Date.now();
  for (const [k, h] of fromRadio) if (now - h.heardAt > 30 * 60_000) fromRadio.delete(k);
  for (const [n, t] of peers) if (now - t > PEER_MS) peers.delete(n);
  const nowSec = Math.floor(now / 1000);
  const sealed = new Map<NearbyItem, Uint8Array>();
  const seal = (i: NearbyItem) => {
    let f = sealed.get(i);
    if (!f) {
      f = sealFrame(mesh.keys.rideKey, i, Crypto.getRandomBytes(12), nowSec);
      sealed.set(i, f);
    }
    return f;
  };
  let picks: ReturnType<typeof pick>;
  try {
    const items = mesh.live(now);
    // Only the copy the radio already carried stays off it; a newer one (heard over phone Bluetooth) goes.
    const carried = new Set(items.filter((i) => (fromRadio.get(roundKey(i))?.at ?? -1) >= i.at).map(roundKey));
    picks = pick({
      items,
      myId: r.myId,
      now,
      preset: view.preset ?? 'LONG_FAST',
      fromRadio: carried,
      sent,
      usedMs: usedLastMinute(airLog, now),
      radioPeers: peers.size,
      channelUtil: view.channelUtil,
      sizeOf: (i) => seal(i).length,
    });
  } catch {
    return;
  }
  for (const p of picks) {
    let bytes: Uint8Array;
    try {
      bytes = toRadioPacket({
        id: rand32(),
        payload: seal(p.item),
        priority: p.urgent ? PRIORITY.alert : p.item.kind === 'position' ? PRIORITY.background : PRIORITY.default,
        wantAck: p.urgent,
      });
    } catch {
      continue;
    }
    write(bytes);
    markSent(sent, p, now);
    airLog.push([now, p.airMs]);
  }
  if (picks.length) publish({ sent: view.sent + picks.length });
}
