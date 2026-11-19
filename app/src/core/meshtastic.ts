/**
 * Radio Sharing: the few messages a phone and a Meshtastic radio pass over Bluetooth, written for
 * OnMyLead from the public description of the protocol (meshtastic.org/docs/development/device/
 * client-api). No Meshtastic code and nothing generated from their .proto files is used: the
 * official libraries are GPL-3.0 and OnMyLead isn't. Only the handful of fields OnMyLead needs are
 * read or written; everything else a radio sends is skipped.
 *
 * Wire format (protobuf): each field is a key `(number << 3) | type` as a varint, then the value:
 * type 0 a varint, 1 eight bytes, 2 a length then that many bytes, 5 four bytes (little endian).
 *
 * The phone writes a ToRadio to the radio and reads FromRadio messages back:
 * - ToRadio: 1 packet (MeshPacket), 3 want_config_id (asks for the radio's settings and node list).
 * - FromRadio: 2 packet, 3 my_info, 4 node_info, 5 config, 7 config_complete_id, 8 rebooted,
 *   10 channel, 11 queue_status.
 * - MeshPacket: 1 from, 2 to, 6 id (fixed32), 3 channel, 4 decoded (Data), 9 hop_limit,
 *   10 want_ack, 11 priority, 15 hop_start.
 * - Data: 1 portnum, 2 payload, 9 bitfield (bit 0: OK to forward to the internet).
 *
 * lib/radio.ts drives the radio; core/radio-share.ts decides what goes out and when.
 */

/** Bluetooth service and characteristics every Meshtastic radio offers (client API docs). */
export const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
export const MESHTASTIC_TORADIO_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
export const MESHTASTIC_FROMRADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002';
export const MESHTASTIC_FROMNUM_UUID = 'ed9da18c-a800-4f66-a670-aa7547e34453';

/**
 * OnMyLead's port number. 256 to 511 are for private apps that don't register one; 256 and 257
 * are taken by Meshtastic's own examples, so OnMyLead uses one well clear of them. Radios pass
 * every port on; only OnMyLead reads this one, and other Meshtastic apps don't show it as text.
 */
export const ONMYLEAD_PORT = 287;

/** The most a Data payload can carry (mesh.options: Data.payload max_size). */
export const MAX_RADIO_PAYLOAD = 233;

/** Everyone in range. */
export const BROADCAST = 0xffffffff;

/** Sending priority (MeshPacket.Priority): higher goes first. */
export const PRIORITY = { background: 10, default: 64, reliable: 70, alert: 110 } as const;

/** Config.LoRaConfig.RegionCode values OnMyLead cares about. */
export const REGION_UNSET = 0;
export const REGION_US = 1;

/** Config.LoRaConfig.ModemPreset, by number. */
export type ModemPreset =
  | 'LONG_FAST' | 'LONG_SLOW' | 'VERY_LONG_SLOW' | 'MEDIUM_SLOW' | 'MEDIUM_FAST' | 'SHORT_SLOW'
  | 'SHORT_FAST' | 'LONG_MODERATE' | 'SHORT_TURBO' | 'LONG_TURBO' | 'MEDIUM_TURBO' | 'OTHER';

const PRESETS: Record<number, ModemPreset> = {
  0: 'LONG_FAST', 1: 'LONG_SLOW', 2: 'VERY_LONG_SLOW', 3: 'MEDIUM_SLOW', 4: 'MEDIUM_FAST', 5: 'SHORT_SLOW',
  6: 'SHORT_FAST', 7: 'LONG_MODERATE', 8: 'SHORT_TURBO', 9: 'LONG_TURBO', 16: 'MEDIUM_TURBO',
};

export function presetName(n: number): ModemPreset {
  return PRESETS[n] ?? 'OTHER';
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

class Out {
  private b: number[] = [];

  varint(v: number) {
    // Non-negative only (every field written here is). Numbers above 2^32 never occur.
    let n = Math.floor(v);
    if (n < 0) throw new Error('negative varint');
    while (n >= 0x80) {
      this.b.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.b.push(n);
  }

  key(field: number, type: number) {
    this.varint(field * 8 + type);
  }

  uint(field: number, v: number) {
    this.key(field, 0);
    this.varint(v);
  }

  bool(field: number, v: boolean) {
    if (v) this.uint(field, 1);
  }

  fixed32(field: number, v: number) {
    this.key(field, 5);
    const n = v >>> 0;
    this.b.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  }

  bytes(field: number, v: Uint8Array) {
    this.key(field, 2);
    this.varint(v.length);
    for (const x of v) this.b.push(x);
  }

  done() {
    return Uint8Array.from(this.b);
  }
}

export type OutgoingPacket = {
  /** Any 32-bit number, new for each packet. */
  id: number;
  payload: Uint8Array;
  /** How many radios may pass it on; the radio's own setting when left out. */
  hopLimit?: number;
  priority?: number;
  wantAck?: boolean;
};

/** The ToRadio that asks for the radio's settings, channels and node list, ending in config_complete_id = id. */
export function wantConfig(id: number): Uint8Array {
  const o = new Out();
  o.uint(3, id >>> 0);
  return o.done();
}

/** The ToRadio that sends an OnMyLead packet to everyone in range on the radio's main channel. */
export function toRadioPacket(p: OutgoingPacket): Uint8Array {
  if (p.payload.length > MAX_RADIO_PAYLOAD) throw new Error('payload too long');
  const data = new Out();
  data.uint(1, ONMYLEAD_PORT);
  data.bytes(2, p.payload);
  // bitfield present and 0: not OK to forward to the internet (MQTT).
  data.uint(9, 0);
  const pkt = new Out();
  pkt.fixed32(2, BROADCAST);
  pkt.bytes(4, data.done());
  pkt.fixed32(6, p.id);
  if (p.hopLimit != null) pkt.uint(9, p.hopLimit);
  pkt.bool(10, !!p.wantAck);
  if (p.priority != null) pkt.uint(11, p.priority);
  const o = new Out();
  o.bytes(1, pkt.done());
  return o.done();
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Field = { n: number; type: number; v: number; b?: Uint8Array };

/** Every field of one message, in order. Throws on malformed input. */
function fields(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  let i = 0;
  const varint = () => {
    let v = 0;
    let mul = 1;
    for (let k = 0; k < 10; k++) {
      if (i >= buf.length) throw new Error('short');
      const x = buf[i++];
      // Above 2^53 precision is lost, which only matters for fields OnMyLead never reads.
      v += (x & 0x7f) * mul;
      mul *= 0x80;
      if (x < 0x80) return v;
    }
    throw new Error('varint');
  };
  while (i < buf.length) {
    const k = varint();
    const n = Math.floor(k / 8);
    const type = k % 8;
    if (n < 1) throw new Error('field');
    if (type === 0) out.push({ n, type, v: varint() });
    else if (type === 1) {
      if (i + 8 > buf.length) throw new Error('short');
      i += 8;
      out.push({ n, type, v: 0 });
    } else if (type === 2) {
      const len = varint();
      if (i + len > buf.length) throw new Error('short');
      out.push({ n, type, v: len, b: buf.subarray(i, i + len) });
      i += len;
    } else if (type === 5) {
      if (i + 4 > buf.length) throw new Error('short');
      const v = (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) >>> 0;
      i += 4;
      out.push({ n, type, v });
    } else throw new Error('wire type');
  }
  return out;
}

const dec = new TextDecoder();

function get(fs: Field[], n: number): Field | undefined {
  // The last one wins, as in protobuf.
  for (let k = fs.length - 1; k >= 0; k--) if (fs[k].n === n) return fs[k];
  return undefined;
}

const num = (fs: Field[], n: number) => get(fs, n)?.v ?? 0;
const sub = (fs: Field[], n: number) => { const f = get(fs, n); return f?.b ? fields(f.b) : null; };
const str = (fs: Field[], n: number) => { const f = get(fs, n); return f?.b ? dec.decode(f.b) : ''; };

/** A 32-bit float from its bits (protobuf `float`, wire type 5). */
function f32(bits: number): number {
  const v = new DataView(new ArrayBuffer(4));
  v.setUint32(0, bits >>> 0, true);
  return v.getFloat32(0, true);
}

export type RadioPacket = {
  kind: 'packet';
  from: number;
  to: number;
  id: number;
  channel: number;
  portnum: number;
  payload: Uint8Array;
  hopLimit: number;
  hopStart: number;
};

export type RadioNode = {
  kind: 'node';
  num: number;
  longName: string;
  shortName: string;
  /** Licensed (ham) mode: no encryption allowed, so OnMyLead sends nothing. */
  isLicensed: boolean;
  /** 0 to 100, 101 = plugged in, null = not reported. */
  battery: number | null;
  /** Percent of the time the channel is busy, as this radio measures it. */
  channelUtil: number | null;
};

export type RadioLora = {
  kind: 'lora';
  region: number;
  usePreset: boolean;
  preset: ModemPreset;
  hopLimit: number;
  txEnabled: boolean;
};

export type FromRadio =
  | RadioPacket
  | RadioNode
  | RadioLora
  | { kind: 'myInfo'; nodeNum: number }
  | { kind: 'channel'; index: number; role: number; name: string }
  | { kind: 'configComplete'; id: number }
  | { kind: 'rebooted' }
  | { kind: 'queue'; free: number; maxlen: number }
  | { kind: 'other' };

/** Reads one FromRadio message, or null when it is malformed. */
export function readFromRadio(buf: Uint8Array): FromRadio | null {
  try {
    const fs = fields(buf);
    const pkt = sub(fs, 2);
    if (pkt) {
      const data = sub(pkt, 4);
      // Encrypted with a channel key this radio doesn't have (field 5): nothing to read.
      if (!data) return { kind: 'other' };
      return {
        kind: 'packet',
        from: num(pkt, 1) >>> 0,
        to: num(pkt, 2) >>> 0,
        id: num(pkt, 6) >>> 0,
        channel: num(pkt, 3),
        portnum: num(data, 1),
        payload: get(data, 2)?.b ?? new Uint8Array(),
        hopLimit: num(pkt, 9),
        hopStart: num(pkt, 15),
      };
    }
    const my = sub(fs, 3);
    if (my) return { kind: 'myInfo', nodeNum: num(my, 1) >>> 0 };
    const node = sub(fs, 4);
    if (node) {
      const user = sub(node, 2) ?? [];
      const metrics = sub(node, 6) ?? [];
      const battery = get(metrics, 1);
      const util = get(metrics, 3);
      return {
        kind: 'node',
        num: num(node, 1) >>> 0,
        longName: str(user, 2),
        shortName: str(user, 3),
        isLicensed: num(user, 6) === 1,
        battery: battery ? battery.v : null,
        channelUtil: util && util.type === 5 ? Math.round(f32(util.v) * 10) / 10 : null,
      };
    }
    const config = sub(fs, 5);
    if (config) {
      const lora = sub(config, 6);
      if (!lora) return { kind: 'other' };
      const hasTx = !!get(lora, 9);
      return {
        kind: 'lora',
        region: num(lora, 7),
        usePreset: num(lora, 1) === 1,
        preset: presetName(num(lora, 2)),
        hopLimit: num(lora, 8),
        // Proto3: a missing bool is false. Radios send tx_enabled = true unless it was turned off.
        txEnabled: hasTx ? num(lora, 9) === 1 : false,
      };
    }
    const channel = sub(fs, 10);
    if (channel) {
      const settings = sub(channel, 2) ?? [];
      return { kind: 'channel', index: num(channel, 1), role: num(channel, 3), name: str(settings, 3) };
    }
    if (get(fs, 7)) return { kind: 'configComplete', id: num(fs, 7) >>> 0 };
    if (num(fs, 8) === 1) return { kind: 'rebooted' };
    const q = sub(fs, 11);
    if (q) return { kind: 'queue', free: num(q, 2), maxlen: num(q, 3) };
    return { kind: 'other' };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Air time (how long one packet keeps the channel busy)
// ---------------------------------------------------------------------------

/** Spreading factor, bandwidth (kHz) and coding rate denominator of each preset (meshtastic.org radio settings). */
const MODEM: Record<Exclude<ModemPreset, 'OTHER'>, { sf: number; bw: number; cr: number }> = {
  SHORT_TURBO: { sf: 7, bw: 500, cr: 5 },
  SHORT_FAST: { sf: 7, bw: 250, cr: 5 },
  SHORT_SLOW: { sf: 8, bw: 250, cr: 5 },
  MEDIUM_TURBO: { sf: 9, bw: 500, cr: 5 },
  MEDIUM_FAST: { sf: 9, bw: 250, cr: 5 },
  MEDIUM_SLOW: { sf: 10, bw: 250, cr: 5 },
  LONG_TURBO: { sf: 11, bw: 500, cr: 8 },
  LONG_FAST: { sf: 11, bw: 250, cr: 5 },
  LONG_MODERATE: { sf: 11, bw: 125, cr: 8 },
  LONG_SLOW: { sf: 12, bw: 125, cr: 8 },
  VERY_LONG_SLOW: { sf: 12, bw: 62.5, cr: 8 },
};

/** Meshtastic's packet header on the air, and roughly what the Data wrapper adds to a payload. */
const RADIO_HEADER = 16;
const DATA_WRAPPER = 7;
const PREAMBLE = 16;

/**
 * Milliseconds one OnMyLead packet of `payloadBytes` keeps the channel busy (the LoRa time-on-air
 * formula, explicit header, CRC on). Unknown or custom settings count as the slowest common one.
 */
export function airtimeMs(payloadBytes: number, preset: ModemPreset): number {
  const m = preset === 'OTHER' ? MODEM.LONG_SLOW : MODEM[preset];
  const symbolMs = 2 ** m.sf / m.bw;
  const lowRate = symbolMs > 16 ? 1 : 0;
  const pl = payloadBytes + RADIO_HEADER + DATA_WRAPPER;
  const payloadSymbols = 8 + Math.max(Math.ceil((8 * pl - 4 * m.sf + 28 + 16) / (4 * (m.sf - 2 * lowRate))) * m.cr, 0);
  return (PREAMBLE + 4.25 + payloadSymbols) * symbolMs;
}
