/**
 * Radio Sharing: which Bluetooth Sharing packets a phone hands to its Meshtastic radio, and when.
 *
 * The radio is a second way out for the same sealed packets Bluetooth Sharing makes (core/nearby.ts:
 * one packet is at most 180 bytes, well under the radio's 233). The packets, the encryption and the
 * mesh rules don't change. What is different is the air: one radio talks at a time on a channel
 * shared by everyone in range, at about 1 kilobit a second on Meshtastic's default setting, and
 * radios relay for each other. So this file keeps the radio's share of the channel small:
 *
 * - EMERGENCY first, always, and never held back by the budget.
 * - Taps, cancels and messages go out when they are new, then once more a minute later in case the
 *   first copy was lost. Receipts go once.
 * - Spots go out at most once per interval per rider (longer on slower settings), sooner when the
 *   rider has moved MOVE_M. The rider's own spot comes first.
 * - Anything this phone heard from the radio is not sent back to the radio (the radios already
 *   relay it). What it heard over phone Bluetooth, or from the server as a gateway, is.
 * - A rolling budget of air time per minute, shared out between the radios heard on the ride, for
 *   everything but EMERGENCY, the rider's own spot (which its interval already spaces out) and the
 *   first copy of the rider's own taps, and
 *   when the radio says the channel is busy, only the rider's own items and taps go.
 *
 * Pure, so it is unit tested (core/__tests__/radio-share.test.ts). lib/radio.ts calls pick().
 */
import { airtimeMs, type ModemPreset } from './meshtastic';
import { roundKey, type NearbyItem } from './nearby';
import { distanceM } from './geo';

/** The air time this phone may use per minute, before sharing out (25% of a minute). */
export const BUDGET_MS_PER_MIN = 15_000;
/** Each packet is roughly sent this many times as radios relay it. */
export const RELAY_FACTOR = 3;
/** Above this channel use (percent, as the radio measures it), only taps, messages and the own spot go. */
export const BUSY_UTIL = 25;
/** A rider who moved this far since their last spot over the radio goes again early. */
export const MOVE_M = 150;
/** A new tap or message goes again this long after the first copy, once. */
export const REPEAT_EVENT_MS = 60_000;
/** Never sooner than this for the same spot, however fast the setting. */
const MIN_SPOT_MS = 15_000;

/**
 * Time between spots per rider on each setting, sized for a group of about ten radios, and
 * stretched for bigger groups so the channel keeps room for taps and messages.
 */
export function spotIntervalMs(preset: ModemPreset, radioPeers = 0): number {
  return baseSpotMs(preset) * Math.max(1, (radioPeers + 1) / GROUP_SIZE);
}

/** The group size the intervals are sized for. */
export const GROUP_SIZE = 10;

function baseSpotMs(preset: ModemPreset): number {
  switch (preset) {
    case 'SHORT_TURBO':
    case 'SHORT_FAST':
      return 15_000;
    case 'SHORT_SLOW':
    case 'MEDIUM_TURBO':
      return 30_000;
    case 'MEDIUM_FAST':
      return 45_000;
    case 'MEDIUM_SLOW':
    case 'LONG_TURBO':
      return 90_000;
    case 'LONG_FAST':
      return 120_000;
    default:
      return 300_000;
  }
}

export type RadioSent = {
  /** When this key last went to the radio, and how many times. */
  at: number;
  times: number;
  /** For spots: where it was. */
  lat?: number;
  lng?: number;
};

export type RadioPickInput = {
  /** What Bluetooth Sharing would pass on now (NearbyMesh.live), best first. */
  items: NearbyItem[];
  myId: string;
  now: number;
  preset: ModemPreset;
  /** roundKeys of items this phone heard from the radio. */
  fromRadio: Set<string>;
  /** By roundKey (a message part adds `#part`). */
  sent: Map<string, RadioSent>;
  /** Air time this phone already used in the last minute. */
  usedMs: number;
  /** Other riders' radios heard on this ride lately. */
  radioPeers: number;
  /** The radio's own measure of how busy the channel is, percent. */
  channelUtil: number | null;
  /** Bytes of each item once sealed (core/nearby sealFrame). */
  sizeOf: (i: NearbyItem) => number;
};

export type RadioPick = { item: NearbyItem; key: string; airMs: number; urgent: boolean };

/** The key a picked item is tracked under: message parts separately. */
export function radioKey(i: NearbyItem): string {
  return i.kind === 'reply' ? `${roundKey(i)}#${i.part}` : roundKey(i);
}

const isEmergency = (i: NearbyItem) => i.kind === 'status' && i.status === 'emergency';

/** The order things go: EMERGENCY, own taps and cancels, own spot, own messages, then others'. */
function order(i: NearbyItem, myId: string): number {
  const own = i.userId === myId;
  if (isEmergency(i)) return 0;
  if (i.kind === 'status' || i.kind === 'cancel') return own ? 1 : 4;
  if (i.kind === 'position') return own ? 2 : 6;
  if (i.kind === 'reply') return own ? 3 : 5;
  return 7;
}

function due(i: NearbyItem, key: string, input: RadioPickInput): boolean {
  const last = input.sent.get(key);
  if (i.kind === 'position') {
    if (!last) return true;
    const age = input.now - last.at;
    if (age < MIN_SPOT_MS) return false;
    if (age >= spotIntervalMs(input.preset, input.radioPeers)) return true;
    if (last.lat == null || last.lng == null) return false;
    return distanceM({ lat: last.lat, lng: last.lng }, { lat: i.latE7 / 1e7, lng: i.lngE7 / 1e7 }) >= MOVE_M;
  }
  if (!last) return true;
  if (i.kind === 'ack') return false;
  return last.times < 2 && input.now - last.at >= REPEAT_EVENT_MS;
}

/** The packets to hand the radio now, in sending order. */
export function pick(input: RadioPickInput): RadioPick[] {
  const share = Math.max(1, input.radioPeers + 1);
  let budget = BUDGET_MS_PER_MIN / RELAY_FACTOR / share - input.usedMs;
  const busy = input.channelUtil != null && input.channelUtil >= BUSY_UTIL;
  const candidates = input.items
    .filter((i) => !input.fromRadio.has(roundKey(i)))
    .map((i) => ({ i, key: radioKey(i) }))
    .filter(({ i, key }) => due(i, key, input))
    .filter(({ i }) => !busy || i.userId === input.myId || i.kind === 'status' || i.kind === 'cancel')
    .sort((a, b) => order(a.i, input.myId) - order(b.i, input.myId) || b.i.at - a.i.at);
  const out: RadioPick[] = [];
  for (const { i, key } of candidates) {
    const airMs = airtimeMs(input.sizeOf(i), input.preset);
    const urgent = isEmergency(i);
    // The rider's own spot is already spaced out by its interval (stretched for big groups), so it
    // always goes when due: the budget would otherwise keep a big group's spots off the air.
    // The first copy of the rider's own tap (Need Help, Stopped, a cancel) goes too: taps are rare.
    const own = i.userId === input.myId;
    const ownSpot = own && i.kind === 'position';
    const ownTap = own && (i.kind === 'status' || i.kind === 'cancel') && !input.sent.has(key);
    if (!urgent && !ownSpot && !ownTap && airMs > budget) continue;
    out.push({ item: i, key, airMs, urgent });
    budget -= airMs;
  }
  return out;
}

/** Records what went to the radio (call for each pick handed to the radio). */
export function markSent(sent: Map<string, RadioSent>, p: RadioPick, now: number) {
  const prev = sent.get(p.key);
  const i = p.item;
  sent.set(p.key, {
    at: now,
    times: (prev?.times ?? 0) + 1,
    ...(i.kind === 'position' ? { lat: i.latE7 / 1e7, lng: i.lngE7 / 1e7 } : {}),
  });
}

/** Air time used in the last minute, from a log of [when, ms]. Drops older entries in place. */
export function usedLastMinute(log: [number, number][], now: number): number {
  while (log.length && now - log[0][0] > 60_000) log.shift();
  return log.reduce((t, [, ms]) => t + ms, 0);
}
