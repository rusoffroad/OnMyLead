/**
 * Bluetooth Sharing: Ride Mode passes locations, status taps and quick replies phone to phone over
 * Bluetooth when there is no cell service (lib/nearby.ts drives it, modules/onmylead-nearby is the
 * radio). This file is the part that has to be right on every device: the packet format, the
 * encryption, and which packets a phone keeps and passes on.
 *
 * Privacy, the same promise as sharing over the internet:
 * - Every packet is encrypted with the ride's key (AES-256-GCM), which only joined riders get
 *   from the server, while they have service. A phone that is not on the ride sees an OnMyLead
 *   phone nearby and random bytes, never a name, a rider or a spot.
 * - The 4-byte ride tag that lets phones skip other rides' packets changes every 15 minutes, so it
 *   can't be used to follow a ride around.
 * - Each packet also carries a code made with the sending rider's own key (HMAC-SHA256), which
 *   only that rider and the server know. Other phones pass it on untouched; when any phone gets
 *   service and uploads what it heard, the server checks the code (supabase migration
 *   20261103600000_bluetooth_sharing.sql), so nobody can place another rider somewhere they are not.
 * - Only riders sharing their location send it; a phone relays others for a limited time and
 *   number of hops, and forgets them when the ride ends.
 */
import { gcm } from '@noble/ciphers/aes';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';

/** Same values as lib/types RiderStatusKind (core stays free of app imports). */
export type RiderStatusKind =
  | 'ok' | 'stopped' | 'need_fuel' | 'mechanical' | 'flat_tire' | 'stuck' | 'lost' | 'need_help' | 'emergency';

/** Bluetooth service and characteristic every OnMyLead phone uses (the same on iOS and Android). */
export const NEARBY_SERVICE_UUID = 'E3B1C7A0-5D4F-4E2A-9F61-0A6D1E7C4B21';
/** Other phones write packets here. */
export const NEARBY_INBOX_UUID = 'E3B1C7A1-5D4F-4E2A-9F61-0A6D1E7C4B21';
/** Phones that connected to this one get packets from here as notifications. */
export const NEARBY_OUTBOX_UUID = 'E3B1C7A2-5D4F-4E2A-9F61-0A6D1E7C4B21';

/** Packets stay under what one Bluetooth write can carry between any iPhone and Android phone. */
export const MAX_FRAME_BYTES = 180;
/** Longest quick reply that fits in one packet, in UTF-8 bytes. */
export const MAX_REPLY_BYTES = 80;
/** A packet is passed on at most this many times after the phone that made it. */
export const MAX_HOPS = 3;
/** A rider's spot is passed on for this long after it was taken. */
export const POSITION_RELAY_SEC = 10 * 60;
/** A status tap or quick reply is passed on for this long. Emergencies for longer. */
export const EVENT_RELAY_SEC = 30 * 60;
export const EMERGENCY_RELAY_SEC = 2 * 3600;
/** How far ahead of this phone's clock a packet may claim to be (clocks drift). */
export const MAX_CLOCK_SKEW_SEC = 5 * 60;
/** The ride tag changes this often. */
export const TAG_WINDOW_SEC = 15 * 60;
/** Most packets one broadcast round sends, so a big group can't flood the link. */
export const MAX_FRAMES_PER_ROUND = 24;

const MAGIC = 0x4f; // "O"
const VERSION = 1;
const HEADER = 1 + 1 + 4 + 12; // magic, version, ride tag, nonce
const MAC_BYTES = 16;

/** The order is part of the packet format: add new kinds at the end only. */
export const STATUS_KINDS: readonly RiderStatusKind[] = [
  'ok', 'stopped', 'need_fuel', 'mechanical', 'flat_tire', 'stuck', 'lost', 'need_help', 'emergency',
];

/** Status flags. Bit 0: sent by Crash Alert ("Possible Crash"). */
export const FLAG_POSSIBLE_CRASH = 1;

type Common = {
  /** The rider who made the packet. */
  userId: string;
  /** Epoch seconds when it was made (a fix: when it was taken; a tap: when it was tapped). */
  at: number;
  /** How many phones passed it on after the first one. */
  hops: number;
  /** The sending rider's own code (hex), checked by the server on upload. */
  mac: string;
};

export type NearbyPosition = Common & {
  kind: 'position';
  latE7: number;
  lngE7: number;
  /** Metres, or null when unknown. */
  accuracyM: number | null;
  /** Centimetres per second, or null. */
  speedCms: number | null;
  /** Tenths of a degree, 0 to 3599, or null. */
  headingDd: number | null;
};

export type NearbyStatus = Common & {
  kind: 'status';
  id: string;
  status: RiderStatusKind;
  flags: number;
  latE7: number | null;
  lngE7: number | null;
};

export type NearbyReply = Common & {
  kind: 'reply';
  id: string;
  body: string;
};

export type NearbyItem = NearbyPosition | NearbyStatus | NearbyReply;

/** An item before the hop count and the rider's code are added. */
export type UnsignedItem =
  | Omit<NearbyPosition, 'mac' | 'hops'>
  | Omit<NearbyStatus, 'mac' | 'hops'>
  | Omit<NearbyReply, 'mac' | 'hops'>;

export type RideKeys = {
  rideId: string;
  /** 32 bytes, the same for every joined rider. */
  rideKey: Uint8Array;
  /** 32 bytes, this rider's own; only this rider and the server have it. */
  riderKey: Uint8Array;
};

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

// UTF-8 by hand: not every JavaScript engine the app runs on has TextDecoder.
const enc = {
  encode(s: string): Uint8Array {
    const out: number[] = [];
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  },
};
const dec = {
  decode(b: Uint8Array): string {
    let s = '';
    for (let i = 0; i < b.length;) {
      const x = b[i];
      const n = x < 0x80 ? 1 : x >= 0xf0 ? 4 : x >= 0xe0 ? 3 : x >= 0xc0 ? 2 : 0;
      if (!n || i + n > b.length) throw new Error('bad utf-8');
      let c = n === 1 ? x : x & (0xff >> (n + 1));
      for (let k = 1; k < n; k++) {
        if ((b[i + k] & 0xc0) !== 0x80) throw new Error('bad utf-8');
        c = (c << 6) | (b[i + k] & 63);
      }
      s += String.fromCodePoint(c);
      i += n;
    }
    return s;
  },
};

export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(s: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(s)) throw new Error('bad hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < b.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < b.length ? B64[n & 63] : '=';
  }
  return s;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12)
      | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

function uuidBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (hex.length !== 32) throw new Error('bad id');
  return fromHex(hex);
}

function bytesUuid(b: Uint8Array): string {
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const NONE_I32 = 0x7fffffff;
const NONE_U16 = 0xffff;

class Writer {
  private buf: number[] = [];
  u8(v: number) { this.buf.push(v & 255); }
  u16(v: number) { this.buf.push((v >> 8) & 255, v & 255); }
  u32(v: number) { this.buf.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
  i32(v: number) { this.u32(v >>> 0); }
  bytes(b: Uint8Array) { for (const x of b) this.buf.push(x); }
  done() { return Uint8Array.from(this.buf); }
}

class Reader {
  private i = 0;
  constructor(private b: Uint8Array) {}
  private need(n: number) { if (this.i + n > this.b.length) throw new Error('short'); }
  u8() { this.need(1); return this.b[this.i++]; }
  u16() { this.need(2); const v = (this.b[this.i] << 8) | this.b[this.i + 1]; this.i += 2; return v; }
  u32() { this.need(4); const v = ((this.b[this.i] << 24) | (this.b[this.i + 1] << 16) | (this.b[this.i + 2] << 8) | this.b[this.i + 3]) >>> 0; this.i += 4; return v; }
  i32() { return this.u32() | 0; }
  bytes(n: number) { this.need(n); const v = this.b.slice(this.i, this.i + n); this.i += n; return v; }
  get left() { return this.b.length - this.i; }
}

// ---------------------------------------------------------------------------
// Keys, tags and the rider's own code
// ---------------------------------------------------------------------------

/** The ride tag for the 15-minute window holding `atSec`. */
export function rideTag(rideKey: Uint8Array, atSec: number): Uint8Array {
  const w = new Writer();
  w.u32(Math.floor(atSec / TAG_WINDOW_SEC));
  return hmac(sha256, rideKey, Uint8Array.from([...enc.encode('onmylead-nearby-tag'), ...w.done()])).slice(0, 4);
}

const opt = (v: number | null) => (v == null ? '' : String(v));

/**
 * The exact text the rider's code covers. The server builds the same text from the uploaded
 * numbers (whole numbers only, so nothing depends on how a decimal is printed).
 */
export function canonical(rideId: string, item: UnsignedItem): string {
  const base = `${rideId}|${item.userId}`;
  switch (item.kind) {
    case 'position':
      return `p|${base}|${item.latE7}|${item.lngE7}|${opt(item.accuracyM)}|${opt(item.speedCms)}|${opt(item.headingDd)}|${item.at}`;
    case 'status':
      return `s|${base}|${item.id}|${item.status}|${item.flags}|${opt(item.latE7)}|${opt(item.lngE7)}|${item.at}`;
    case 'reply':
      return `r|${base}|${item.id}|${item.body}|${item.at}`;
  }
}

export function riderMac(riderKey: Uint8Array, rideId: string, item: UnsignedItem): string {
  return toHex(hmac(sha256, riderKey, enc.encode(canonical(rideId, item))).slice(0, MAC_BYTES));
}

// ---------------------------------------------------------------------------
// Packets
// ---------------------------------------------------------------------------

const TYPE = { position: 1, status: 2, reply: 3 } as const;

function encodeBody(item: NearbyItem): Uint8Array {
  const w = new Writer();
  w.u8(TYPE[item.kind]);
  w.u8(item.kind === 'status' ? item.flags : 0);
  w.u8(item.hops);
  w.bytes(uuidBytes(item.userId));
  w.u32(item.at);
  w.bytes(fromHex(item.mac));
  if (item.kind === 'position') {
    w.i32(item.latE7);
    w.i32(item.lngE7);
    w.u16(item.accuracyM == null ? NONE_U16 : Math.min(NONE_U16 - 1, item.accuracyM));
    w.u16(item.speedCms == null ? NONE_U16 : Math.min(NONE_U16 - 1, item.speedCms));
    w.u16(item.headingDd == null ? NONE_U16 : item.headingDd);
  } else if (item.kind === 'status') {
    w.bytes(uuidBytes(item.id));
    w.u8(STATUS_KINDS.indexOf(item.status));
    w.i32(item.latE7 ?? NONE_I32);
    w.i32(item.lngE7 ?? NONE_I32);
  } else {
    w.bytes(uuidBytes(item.id));
    const text = enc.encode(item.body);
    w.u8(text.length);
    w.bytes(text);
  }
  return w.done();
}

function decodeBody(b: Uint8Array): NearbyItem | null {
  const r = new Reader(b);
  const type = r.u8();
  const flags = r.u8();
  const hops = r.u8();
  const userId = bytesUuid(r.bytes(16));
  const at = r.u32();
  const mac = toHex(r.bytes(MAC_BYTES));
  const common = { userId, at, hops, mac };
  if (type === TYPE.position) {
    const latE7 = r.i32();
    const lngE7 = r.i32();
    const acc = r.u16();
    const speed = r.u16();
    const heading = r.u16();
    if (Math.abs(latE7) > 900_000_000 || Math.abs(lngE7) > 1_800_000_000) return null;
    return {
      kind: 'position', ...common, latE7, lngE7,
      accuracyM: acc === NONE_U16 ? null : acc,
      speedCms: speed === NONE_U16 ? null : speed,
      headingDd: heading === NONE_U16 || heading > 3599 ? null : heading,
    };
  }
  if (type === TYPE.status) {
    const id = bytesUuid(r.bytes(16));
    // A kind added by a newer app version: this phone can't show it, so it drops it.
    const status = STATUS_KINDS[r.u8()];
    const lat = r.i32();
    const lng = r.i32();
    if (!status) return null;
    const hasSpot = lat !== NONE_I32 && lng !== NONE_I32;
    return { kind: 'status', ...common, id, status, flags, latE7: hasSpot ? lat : null, lngE7: hasSpot ? lng : null };
  }
  if (type === TYPE.reply) {
    const id = bytesUuid(r.bytes(16));
    const len = r.u8();
    if (len > MAX_REPLY_BYTES) return null;
    return { kind: 'reply', ...common, id, body: dec.decode(r.bytes(len)) };
  }
  return null;
}

/** Encrypts one item for the air. `nonce` must be 12 fresh random bytes. */
export function sealFrame(rideKey: Uint8Array, item: NearbyItem, nonce: Uint8Array, nowSec: number): Uint8Array {
  if (nonce.length !== 12) throw new Error('nonce must be 12 bytes');
  const header = new Writer();
  header.u8(MAGIC);
  header.u8(VERSION);
  header.bytes(rideTag(rideKey, nowSec));
  header.bytes(nonce);
  const h = header.done();
  const sealed = gcm(rideKey, nonce, h).encrypt(encodeBody(item));
  const out = new Uint8Array(h.length + sealed.length);
  out.set(h);
  out.set(sealed, h.length);
  return out;
}

/** Opens a packet from the air, or null if it isn't for this ride, was changed, or is malformed. */
export function openFrame(rideKey: Uint8Array, frame: Uint8Array, nowSec: number): NearbyItem | null {
  if (frame.length < HEADER + 16 || frame[0] !== MAGIC || frame[1] !== VERSION) return null;
  const tag = frame.slice(2, 6);
  // This window or the one before, so a packet sealed just before the change still opens.
  const ok = [nowSec, nowSec - TAG_WINDOW_SEC, nowSec + TAG_WINDOW_SEC].some((t) => sameBytes(rideTag(rideKey, t), tag));
  if (!ok) return null;
  try {
    const body = gcm(rideKey, frame.slice(6, HEADER), frame.slice(0, HEADER)).decrypt(frame.slice(HEADER));
    return decodeBody(body);
  } catch {
    return null;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Fits a quick reply into one packet, cutting at a whole character. */
export function fitReply(body: string): string {
  let out = body.trim();
  while (enc.encode(out).length > MAX_REPLY_BYTES) out = Array.from(out).slice(0, -1).join('');
  return out;
}

export const toE7 = (deg: number) => Math.round(deg * 1e7);
export const fromE7 = (v: number) => v / 1e7;

// ---------------------------------------------------------------------------
// What a phone keeps and passes on
// ---------------------------------------------------------------------------

const relaySec = (item: NearbyItem) =>
  item.kind === 'position' ? POSITION_RELAY_SEC : item.kind === 'status' && item.status === 'emergency' ? EMERGENCY_RELAY_SEC : EVENT_RELAY_SEC;

/** Sending order: emergencies first, then other taps, then spots (own first), then replies. */
function rank(item: NearbyItem, myId: string): number {
  if (item.kind === 'status') return item.status === 'emergency' ? 0 : 1;
  if (item.kind === 'position') return item.userId === myId ? 2 : 3;
  return 4;
}

export type Heard = { item: NearbyItem; heardAt: number; uploaded: boolean };

/**
 * One phone's view of the ride over Bluetooth: its own latest spot and taps, plus what it heard.
 * Keeps the newest spot per rider and each tap once, and decides what goes out each round.
 */
export class NearbyMesh {
  private positions = new Map<string, Heard>();
  private events = new Map<string, Heard>();

  readonly myId: string;

  constructor(readonly keys: RideKeys, myId: string) {
    // Ids go on the air as bytes and come back lower case; the codes must match either way.
    this.myId = myId.toLowerCase();
  }

  /** This rider's new fix. Returns the item, or null if it is not newer than the last one. */
  ownPosition(fix: { lat: number; lng: number; accuracyM: number | null; speedMps: number | null; headingDeg: number | null; at: number }): NearbyPosition | null {
    const base = {
      kind: 'position' as const,
      userId: this.myId,
      at: Math.floor(fix.at / 1000),
      latE7: toE7(fix.lat),
      lngE7: toE7(fix.lng),
      accuracyM: fix.accuracyM == null ? null : Math.round(fix.accuracyM),
      speedCms: fix.speedMps == null || fix.speedMps < 0 ? null : Math.round(fix.speedMps * 100),
      headingDd: fix.headingDeg == null || fix.headingDeg < 0 ? null : Math.round(fix.headingDeg * 10) % 3600,
    };
    const prev = this.positions.get(this.myId);
    if (prev && prev.item.at >= base.at) return null;
    const item: NearbyPosition = { ...base, hops: 0, mac: riderMac(this.keys.riderKey, this.keys.rideId, base) };
    // Our own spot never needs uploading from here: the phone sends it itself with service.
    this.positions.set(this.myId, { item, heardAt: fix.at, uploaded: true });
    return item;
  }

  /** Stops sending this rider's own spot (their share ended). */
  clearOwnPosition() {
    this.positions.delete(this.myId);
  }

  ownStatus(s: { id: string; status: RiderStatusKind; flags?: number; lat: number | null; lng: number | null; at: number }): NearbyStatus {
    const base = {
      kind: 'status' as const, userId: this.myId, id: s.id.toLowerCase(), status: s.status, flags: s.flags ?? 0,
      latE7: s.lat == null ? null : toE7(s.lat), lngE7: s.lng == null ? null : toE7(s.lng), at: Math.floor(s.at / 1000),
    };
    const item: NearbyStatus = { ...base, hops: 0, mac: riderMac(this.keys.riderKey, this.keys.rideId, base) };
    this.events.set(item.id, { item, heardAt: s.at, uploaded: true });
    return item;
  }

  ownReply(r: { id: string; body: string; at: number }): NearbyReply {
    const base = { kind: 'reply' as const, userId: this.myId, id: r.id.toLowerCase(), body: fitReply(r.body), at: Math.floor(r.at / 1000) };
    const item: NearbyReply = { ...base, hops: 0, mac: riderMac(this.keys.riderKey, this.keys.rideId, base) };
    this.events.set(item.id, { item, heardAt: r.at, uploaded: true });
    return item;
  }

  /** Drops a tap the rider cancelled, so it stops going out. */
  forget(id: string) {
    this.events.delete(id.toLowerCase());
  }

  /**
   * A packet from the air. Returns the item when it is new to this phone (show it), or null when
   * it is for another ride, too old, from the future, a repeat, or one of our own.
   */
  receive(frame: Uint8Array, now: number): NearbyItem | null {
    const nowSec = Math.floor(now / 1000);
    const item = openFrame(this.keys.rideKey, frame, nowSec);
    if (!item || item.userId === this.myId) return null;
    if (item.at > nowSec + MAX_CLOCK_SKEW_SEC || nowSec - item.at > relaySec(item)) return null;
    if (item.kind === 'position') {
      const prev = this.positions.get(item.userId);
      if (prev && prev.item.at >= item.at) return null;
      this.positions.set(item.userId, { item, heardAt: now, uploaded: false });
      return item;
    }
    if (this.events.has(item.id)) return null;
    this.events.set(item.id, { item, heardAt: now, uploaded: false });
    return item;
  }

  /** Everything still worth passing on, best first, aged out items dropped. */
  live(now: number): NearbyItem[] {
    const nowSec = Math.floor(now / 1000);
    for (const [k, h] of this.positions) if (nowSec - h.item.at > relaySec(h.item)) this.positions.delete(k);
    for (const [k, h] of this.events) if (nowSec - h.item.at > relaySec(h.item)) this.events.delete(k);
    return [...this.positions.values(), ...this.events.values()]
      .map((h) => h.item)
      .sort((a, b) => rank(a, this.myId) - rank(b, this.myId) || b.at - a.at);
  }

  /**
   * The packets for one broadcast round. Others' items go out with one more hop; ones that
   * already made MAX_HOPS stay here.
   */
  outgoing(now: number, nonce: () => Uint8Array): Uint8Array[] {
    const nowSec = Math.floor(now / 1000);
    return this.live(now)
      .filter((i) => i.userId === this.myId || i.hops < MAX_HOPS)
      .slice(0, MAX_FRAMES_PER_ROUND)
      .map((i) => sealFrame(this.keys.rideKey, i.userId === this.myId ? i : { ...i, hops: i.hops + 1 }, nonce(), nowSec));
  }

  /** Newest spot heard for each other rider. */
  heardPositions(): NearbyPosition[] {
    return [...this.positions.values()].map((h) => h.item as NearbyPosition).filter((p) => p.userId !== this.myId);
  }

  /** Others' spots and taps not yet given to the server (replies stay on the phones). */
  pendingUploads(): (NearbyPosition | NearbyStatus)[] {
    return [...this.positions.values(), ...this.events.values()]
      .filter((h) => !h.uploaded && h.item.kind !== 'reply')
      .map((h) => h.item as NearbyPosition | NearbyStatus);
  }

  markUploaded(items: NearbyItem[]) {
    for (const i of items) {
      const h = i.kind === 'position' ? this.positions.get(i.userId) : this.events.get(i.id);
      // Only if it is still the same item (a newer spot may have arrived during the upload).
      if (h && h.item.at === i.at) h.uploaded = true;
    }
  }
}

/** The JSON one item is uploaded as (supabase function nearby_upload). */
export function uploadRow(i: NearbyPosition | NearbyStatus) {
  return i.kind === 'position'
    ? { k: 'p', user_id: i.userId, lat_e7: i.latE7, lng_e7: i.lngE7, accuracy_m: i.accuracyM, speed_cms: i.speedCms, heading_dd: i.headingDd, at: i.at, mac: i.mac }
    : { k: 's', user_id: i.userId, id: i.id, status: i.status, flags: i.flags, lat_e7: i.latE7, lng_e7: i.lngE7, at: i.at, mac: i.mac };
}
