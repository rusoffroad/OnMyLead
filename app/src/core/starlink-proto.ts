/**
 * Just enough protobuf and gRPC-web to ask a Starlink dish for its status. Pure, no I/O.
 *
 * The dish's local API (192.168.100.1, gRPC on 9200, gRPC-web on 9201) is unofficial and
 * unsupported by SpaceX. Field numbers below come from the community-mapped
 * SpaceX.API.Device protos (as used by tools like starlink-grpc-tools). Firmware updates
 * have renamed or moved fields before, so every decoder here tolerates missing or unknown
 * fields and simply reports less.
 */

// --- Protobuf wire format ---------------------------------------------------

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

export type WireField =
  | { wire: 0; value: number }
  | { wire: 1; bytes: Uint8Array }
  | { wire: 2; bytes: Uint8Array }
  | { wire: 5; bytes: Uint8Array };

export type Message = Map<number, WireField[]>;

export function encodeVarint(n: number): number[] {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`varint out of range: ${n}`);
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return out;
}

/** Reads a varint. Values above 2^53 lose precision, which is fine for what we read. */
function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let mult = 1;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new Error('truncated varint');
    const b = buf[pos++];
    result += (b & 0x7f) * mult;
    if (b < 0x80) return [result, pos];
    mult *= 0x80;
  }
  throw new Error('varint too long');
}

/** An empty sub-message at a field number, e.g. Request{ get_status: {} }. */
export const emptyField = (field: number) => [...encodeVarint((field << 3) | WIRE_LEN), 0];

/** Parse one message level into fields. Throws on malformed input. */
export function decodeMessage(buf: Uint8Array): Message {
  const out: Message = new Map();
  let pos = 0;
  while (pos < buf.length) {
    const [tag, p1] = readVarint(buf, pos);
    pos = p1;
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 0) throw new Error('field 0 is not valid');
    let f: WireField;
    if (wire === WIRE_VARINT) {
      const [v, p2] = readVarint(buf, pos);
      pos = p2;
      f = { wire: 0, value: v };
    } else if (wire === WIRE_LEN) {
      const [len, p2] = readVarint(buf, pos);
      if (p2 + len > buf.length) throw new Error('truncated field');
      f = { wire: 2, bytes: buf.subarray(p2, p2 + len) };
      pos = p2 + len;
    } else if (wire === WIRE_I32) {
      if (pos + 4 > buf.length) throw new Error('truncated fixed32');
      f = { wire: 5, bytes: buf.subarray(pos, pos + 4) };
      pos += 4;
    } else if (wire === WIRE_I64) {
      if (pos + 8 > buf.length) throw new Error('truncated fixed64');
      f = { wire: 1, bytes: buf.subarray(pos, pos + 8) };
      pos += 8;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
    const list = out.get(field);
    if (list) list.push(f);
    else out.set(field, [f]);
  }
  return out;
}

const last = (m: Message | null, field: number) => {
  const list = m?.get(field);
  return list ? list[list.length - 1] : undefined;
};

const f32 = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);

export function getFloat(m: Message | null, field: number): number | null {
  const f = last(m, field);
  if (f?.wire === WIRE_I32) return f32(f.bytes);
  if (f?.wire === WIRE_I64) return new DataView(f.bytes.buffer, f.bytes.byteOffset, 8).getFloat64(0, true);
  return null;
}

export function getUint(m: Message | null, field: number): number | null {
  const f = last(m, field);
  return f?.wire === WIRE_VARINT ? f.value : null;
}

export function getBool(m: Message | null, field: number): boolean | null {
  const v = getUint(m, field);
  return v == null ? null : v !== 0;
}

export function getString(m: Message | null, field: number): string | null {
  const f = last(m, field);
  if (f?.wire !== WIRE_LEN) return null;
  try {
    return utf8(f.bytes);
  } catch {
    return null;
  }
}

export function getMessage(m: Message | null, field: number): Message | null {
  const f = last(m, field);
  if (f?.wire !== WIRE_LEN) return null;
  try {
    return decodeMessage(f.bytes);
  } catch {
    return null;
  }
}

/** Repeated float, packed (one length-delimited run) or not. */
export function getFloats(m: Message | null, field: number): number[] {
  const out: number[] = [];
  for (const f of m?.get(field) ?? []) {
    if (f.wire === WIRE_LEN) {
      for (let i = 0; i + 4 <= f.bytes.length; i += 4) out.push(f32(f.bytes.subarray(i, i + 4)));
    } else if (f.wire === WIRE_I32) {
      out.push(f32(f.bytes));
    }
  }
  return out;
}

function utf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

// --- gRPC-web framing ---------------------------------------------------------

/** One data frame: flag 0, 4-byte big-endian length, then the message. */
export function grpcWebFrame(message: number[] | Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + message.length);
  const n = message.length;
  out[1] = (n >>> 24) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 8) & 0xff;
  out[4] = n & 0xff;
  out.set(message, 5);
  return out;
}

export type GrpcWebReply = { message: Uint8Array | null; status: number | null; statusMessage: string | null };

/** Split a gRPC-web response body into its data message and trailer status. */
export function parseGrpcWeb(body: Uint8Array): GrpcWebReply {
  let pos = 0;
  let message: Uint8Array | null = null;
  let status: number | null = null;
  let statusMessage: string | null = null;
  while (pos + 5 <= body.length) {
    const flag = body[pos];
    const len = ((body[pos + 1] << 24) >>> 0) + (body[pos + 2] << 16) + (body[pos + 3] << 8) + body[pos + 4];
    const start = pos + 5;
    if (start + len > body.length) throw new Error('truncated gRPC-web frame');
    const chunk = body.subarray(start, start + len);
    if (flag & 0x80) {
      for (const line of utf8(chunk).split(/\r?\n/)) {
        const at = line.indexOf(':');
        if (at < 0) continue;
        const k = line.slice(0, at).trim().toLowerCase();
        const v = line.slice(at + 1).trim();
        if (k === 'grpc-status') status = Number(v);
        if (k === 'grpc-message') statusMessage = safeDecode(v);
      }
    } else if (!message) {
      message = chunk;
    }
    pos = start + len;
  }
  return { message, status, statusMessage };
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// --- Requests ----------------------------------------------------------------

/** Request oneof field numbers. */
export const REQ_GET_STATUS = 1004;
export const REQ_GET_HISTORY = 1007;
/** Response oneof field numbers. */
export const RES_DISH_GET_STATUS = 2004;
export const RES_DISH_GET_HISTORY = 2006;

export const statusRequest = () => grpcWebFrame(emptyField(REQ_GET_STATUS));
export const historyRequest = () => grpcWebFrame(emptyField(REQ_GET_HISTORY));

// --- Status ------------------------------------------------------------------

export type DishAlert = { code: string; text: string };

export type DishStatus = {
  online: boolean;
  state: string;
  deviceId: string | null;
  hardwareVersion: string | null;
  softwareVersion: string | null;
  countryCode: string | null;
  uptimeS: number | null;
  latencyMs: number | null;
  dropRate: number | null;
  downlinkBps: number | null;
  uplinkBps: number | null;
  obstructionFraction: number | null;
  currentlyObstructed: boolean | null;
  azimuthDeg: number | null;
  elevationDeg: number | null;
  gpsValid: boolean | null;
  gpsSats: number | null;
  ethSpeedMbps: number | null;
  outageCause: string | null;
  alerts: DishAlert[];
};

const ALERTS: Record<number, [string, string]> = {
  1: ['motors_stuck', 'Motors stuck: the dish cannot move to aim'],
  2: ['thermal_shutdown', 'Too hot: the dish shut down to cool off'],
  3: ['thermal_throttle', 'Running hot: speed is reduced'],
  4: ['unexpected_location', 'Location does not match your service address'],
  5: ['mast_not_near_vertical', 'Dish is tilted: mount it level, facing up'],
  6: ['slow_ethernet_speeds', 'Slow Ethernet link: check the cable'],
  7: ['roaming', 'Roaming'],
  8: ['install_pending', 'Software update waiting to install'],
  9: ['is_heating', 'Melting snow (heater on, using more power)'],
  10: ['power_supply_thermal_throttle', 'Power supply is hot: speed is reduced'],
  11: ['is_power_save_idle', 'Power save mode is idling the dish'],
  12: ['moving_while_not_mobile', 'Moving without a mobile / in-motion plan'],
  13: ['moving_too_fast_for_policy', 'Moving faster than your plan allows'],
  15: ['low_motor_current', 'Low motor current'],
  16: ['lower_signal_than_predicted', 'Signal is weaker than expected'],
};

const OUTAGE_CAUSES: Record<number, string> = {
  1: 'Starting up',
  2: 'Stowed',
  3: 'Too hot (thermal shutdown)',
  4: 'Waiting for a satellite schedule',
  5: 'No satellites in view',
  6: 'Obstructed',
  7: 'No downlink',
  8: 'No ping responses',
  9: 'Moving the motors',
  10: 'Cable reset',
  11: 'Sleeping (power save)',
};

/** Find the reply's payload: the expected field, or failing that any 2000-range sub-message. */
function payload(reply: Message, field: number): Message | null {
  const direct = getMessage(reply, field);
  if (direct) return direct;
  for (const [n, list] of reply) {
    if (n >= 2000 && n < 3000 && list[0]?.wire === WIRE_LEN) return getMessage(reply, n);
  }
  return null;
}

/** Decode a Response message (the gRPC-web data frame) into the bits a rider cares about. */
export function decodeStatus(responseBytes: Uint8Array): DishStatus {
  const s = payload(decodeMessage(responseBytes), RES_DISH_GET_STATUS);
  if (!s) throw new Error('The dish answered, but not with a status we understand.');
  const info = getMessage(s, 1);
  const state = getMessage(s, 2);
  const obstruction = getMessage(s, 1004);
  const alertsMsg = getMessage(s, 1005);
  const outage = getMessage(s, 1014);
  const gps = getMessage(s, 1015);

  const alerts: DishAlert[] = [];
  for (const [n, list] of alertsMsg ?? []) {
    const f = list[list.length - 1];
    if (f.wire !== WIRE_VARINT || f.value === 0) continue;
    const known = ALERTS[n];
    alerts.push(known ? { code: known[0], text: known[1] } : { code: `alert_${n}`, text: `Dish alert (code ${n})` });
  }

  const dropRate = getFloat(s, 1003);
  const causeNum = outage ? (getUint(outage, 1) ?? 0) : null;
  const outageCause = causeNum == null ? null : OUTAGE_CAUSES[causeNum] ?? 'Offline';
  const online = !outage && (dropRate == null || dropRate < 1);

  return {
    online,
    state: online ? 'Online' : outageCause ?? 'Searching for satellites',
    deviceId: getString(info, 1),
    hardwareVersion: getString(info, 2),
    softwareVersion: getString(info, 3),
    countryCode: getString(info, 4),
    uptimeS: getUint(state, 1),
    latencyMs: getFloat(s, 1009),
    dropRate,
    downlinkBps: getFloat(s, 1007),
    uplinkBps: getFloat(s, 1008),
    obstructionFraction: getFloat(obstruction, 1),
    currentlyObstructed: getBool(obstruction, 5),
    azimuthDeg: getFloat(s, 1011),
    elevationDeg: getFloat(s, 1012),
    gpsValid: getBool(gps, 1),
    gpsSats: getUint(gps, 2),
    ethSpeedMbps: getUint(s, 1016),
    outageCause,
    alerts,
  };
}

// --- History -----------------------------------------------------------------

/** One minute of the dish's recent history, oldest first in DishHistory.timeline. */
export type HistoryMinute = {
  avgDownlinkBps: number | null;
  avgUplinkBps: number | null;
  avgLatencyMs: number | null;
  dropRate: number | null;
  /** Seconds in this minute with every ping dropped (no connection). */
  outageSeconds: number;
};

export type DishHistory = {
  minutes: number;
  samples: number;
  avgLatencyMs: number | null;
  avgDropRate: number | null;
  avgDownlinkBps: number | null;
  peakDownlinkBps: number | null;
  avgUplinkBps: number | null;
  peakUplinkBps: number | null;
  /** Separate stretches with no connection (every ping dropped) and their total length. */
  outages: number;
  outageSeconds: number;
  longestOutageS: number;
  /** Per-minute buckets, oldest first; the newest may be partial. */
  timeline: HistoryMinute[];
};

/** The newest `n` entries of a ring buffer whose total write count is `current`. */
export function ringTail(values: number[], current: number, n: number): number[] {
  const len = values.length;
  if (!len) return [];
  const have = Math.min(len, Math.max(0, current), n);
  const out: number[] = [];
  for (let i = have; i >= 1; i--) out.push(values[(((current - i) % len) + len) % len]);
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);

/** Summarize the last `seconds` of the per-second history (default 15 minutes). */
export function decodeHistory(responseBytes: Uint8Array, seconds = 900): DishHistory {
  const h = payload(decodeMessage(responseBytes), RES_DISH_GET_HISTORY);
  if (!h) throw new Error('The dish answered, but not with history we understand.');
  const current = getUint(h, 1) ?? 0;
  const drop = ringTail(getFloats(h, 1001), current, seconds);
  const latency = ringTail(getFloats(h, 1002), current, seconds);
  const down = ringTail(getFloats(h, 1003), current, seconds);
  const up = ringTail(getFloats(h, 1004), current, seconds);
  // Latency is meaningless for seconds where every ping dropped.
  const okLatency = latency.filter((v, i) => Number.isFinite(v) && v > 0 && (drop[i] ?? 0) < 1);
  const samples = Math.max(drop.length, latency.length, down.length, up.length);
  const runs = outageRuns(drop);
  return {
    samples,
    minutes: Math.round(samples / 60),
    avgLatencyMs: mean(okLatency),
    avgDropRate: mean(drop),
    avgDownlinkBps: mean(down),
    peakDownlinkBps: max(down),
    avgUplinkBps: mean(up),
    peakUplinkBps: max(up),
    outages: runs.length,
    outageSeconds: runs.reduce((a, b) => a + b, 0),
    longestOutageS: max(runs) ?? 0,
    timeline: minuteBuckets(drop, latency, down, up),
  };
}

/** Lengths in seconds of each run of fully dropped seconds. */
export function outageRuns(drop: number[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const d of drop) {
    if (d >= 1) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs;
}

/** Group per-second samples into minutes, aligned so the newest second ends the last bucket. */
export function minuteBuckets(drop: number[], latency: number[], down: number[], up: number[]): HistoryMinute[] {
  const n = Math.max(drop.length, latency.length, down.length, up.length);
  const out: HistoryMinute[] = [];
  // Series may differ in length; align them all on their newest sample.
  const at = (xs: number[], i: number) => xs[xs.length - n + i];
  for (let end = n; end > 0; end -= 60) {
    const start = Math.max(0, end - 60);
    const d: number[] = [], l: number[] = [], dn: number[] = [], u: number[] = [];
    let outageSeconds = 0;
    for (let i = start; i < end; i++) {
      const di = at(drop, i), li = at(latency, i), dni = at(down, i), ui = at(up, i);
      if (Number.isFinite(di)) {
        d.push(di);
        if (di >= 1) outageSeconds++;
      }
      if (Number.isFinite(li) && li > 0 && !(di >= 1)) l.push(li);
      if (Number.isFinite(dni)) dn.push(dni);
      if (Number.isFinite(ui)) u.push(ui);
    }
    out.unshift({ avgDownlinkBps: mean(dn), avgUplinkBps: mean(u), avgLatencyMs: mean(l), dropRate: mean(d), outageSeconds });
  }
  return out;
}

// --- Display -----------------------------------------------------------------

export function formatMbps(bps: number | null): string {
  if (bps == null || !Number.isFinite(bps)) return '—';
  const mbps = bps / 1e6;
  return `${mbps >= 10 ? Math.round(mbps) : mbps.toFixed(1)} Mbps`;
}

export function formatUptime(s: number | null): string {
  if (s == null) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Which way the dish faces, e.g. -12.5 (degrees from north) -> "N". */
export function compassPoint(deg: number | null): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const d = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(d / 45) % 8];
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** One plain sentence on how the dish is doing right now, for the top of the card. */
export function dishHeadline(s: DishStatus): string {
  if (!s.online) return s.outageCause ? `Offline: ${s.outageCause.toLowerCase()}.` : 'Offline: searching for satellites.';
  if (s.currentlyObstructed) return 'Online, but something is blocking the sky right now.';
  if (s.alerts.length) return `Online with ${s.alerts.length === 1 ? 'an alert' : `${s.alerts.length} alerts`}.`;
  if ((s.dropRate ?? 0) >= 0.05 || (s.obstructionFraction ?? 0) >= 0.05) return 'Online, but the connection is patchy.';
  return 'Online and working well.';
}

export const formatPercent = (f: number | null, digits = 1) =>
  f == null || !Number.isFinite(f) ? '—' : `${(f * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
