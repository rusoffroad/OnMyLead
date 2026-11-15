/**
 * Status taps and chat made without signal are kept here and sent on reconnect, stamped
 * with the time they were tapped so others see when it actually happened.
 *
 * Each tap carries the id the phone picked for it, so a send that timed out but landed anyway
 * counts as sent when it is retried, never as a second tap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEND_TIMEOUT_MS } from '@/core/broadcast';
import { isTransientError } from '@/core/errors';
import { cancelRideItem, sendRideMessage, sendRiderStatus } from './api';
import { nearbyCancel, nearbyReply, nearbyStatus } from './nearby';
import type { RiderStatusKind } from './types';

const KEY = 'ride.outbox.v1';

type Item =
  | { kind: 'status'; id?: string; rideId: string; status: RiderStatusKind; lat: number | null; lng: number | null; tappedAt: string }
  | { kind: 'reply'; id?: string; rideId: string; body: string; tappedAt: string }
  // Cancel pressed with no service: taken back for the group once there is signal. `itemId` is the
  // tap or message; it has no `id` of its own, so it never counts as a tap waiting to go out.
  | { kind: 'cancel'; id?: undefined; itemId: string; rideId: string; tappedAt: string };

async function read(): Promise<Item[]> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
}

/** Runs a send, or fails with 'timed out' when there is no answer within SEND_TIMEOUT_MS. */
async function withTimeout<T>(run: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), SEND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function queue(item: Item) {
  await AsyncStorage.setItem(KEY, JSON.stringify([...(await read()), item]));
}

/** Send now; with no answer within SEND_TIMEOUT_MS (no signal), queue it. True if it went out. */
async function sendOrQueue(item: Exclude<Item, { kind: 'cancel' }>): Promise<boolean> {
  // Nearby riders on the same ride hear it over Bluetooth right away (lib/nearby.ts), with or
  // without service: the ones with no service get it from this phone, and if this phone has no
  // service the first of their phones to get it passes it to the server.
  if (item.kind === 'status') nearbyStatus(item.rideId, item);
  else nearbyReply(item.rideId, item);
  try {
    await withTimeout(deliver(item));
    return true;
  } catch {
    await queue(item);
    return false;
  }
}

/**
 * Takes back a tap or message that went out, with or without service. Nearby riders hear the
 * cancel over Bluetooth at once (lib/nearby.ts). Returns true when the server has it now, false
 * when there was no signal and it is queued (it goes with the next flush). Any other answer from
 * the server (it refused) is thrown, and nothing is queued.
 */
export async function cancelReliably(rideId: string, itemId: string): Promise<boolean> {
  nearbyCancel(rideId, itemId);
  try {
    await withTimeout(cancelRideItem(itemId));
    return true;
  } catch (e) {
    if (!isNoAnswer(e)) throw e;
    await queue({ kind: 'cancel', itemId, rideId, tappedAt: new Date().toISOString() });
    return false;
  }
}

/** The send never got an answer: no signal (or ours timed out), so it is worth trying later. */
const isNoAnswer = (e: unknown) => isTransientError(e instanceof Error ? e.message : String(e));

/** Try to send now; queue if it fails. Returns true if it went out immediately. */
export function sendStatusReliably(
  rideId: string, status: RiderStatusKind, at: { lat: number; lng: number } | null, id?: string,
): Promise<boolean> {
  return sendOrQueue({ kind: 'status', id, rideId, status, lat: at?.lat ?? null, lng: at?.lng ?? null, tappedAt: new Date().toISOString() });
}

/** Ride Mode quick reply, or a message the rider typed there: send now or queue it, like a status tap. */
export function sendQuickReplyReliably(rideId: string, body: string, id?: string): Promise<boolean> {
  return sendOrQueue({ kind: 'reply', id, rideId, body, tappedAt: new Date().toISOString() });
}

export async function flushOutbox(): Promise<number> {
  const items = await read();
  if (!items.length) return 0;
  const done: Item[] = [];
  for (const item of items) {
    try {
      await deliver(item);
      done.push(item);
    } catch (e) {
      const age = Date.now() - Date.parse(item.tappedAt);
      // A quick reply that still can't go out after 12 hours is no longer useful.
      if (item.kind === 'reply' && age > 12 * 3600_000) done.push(item);
      // A cancel the server turned down (the tap may still be on its way from a nearby phone, so
      // it keeps trying for an hour), or one that is a day old, is dropped.
      if (item.kind === 'cancel' && ((!isNoAnswer(e) && age > 3600_000) || age > 24 * 3600_000)) done.push(item);
    }
  }
  // Read again: a tap may have been queued or cancelled while this ran.
  const now = await read();
  await AsyncStorage.setItem(KEY, JSON.stringify(now.filter((i) => !done.some((d) => sameItem(d, i)))));
  return done.length;
}

const sameItem = (a: Item, b: Item) => {
  if (a.kind === 'cancel' || b.kind === 'cancel') return a.kind === 'cancel' && b.kind === 'cancel' && a.itemId === b.itemId;
  return a.id && b.id ? a.id === b.id : a.tappedAt === b.tappedAt && a.kind === b.kind;
};

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

/** Ids of the taps still waiting for signal. */
export async function pendingIds(): Promise<string[]> {
  return (await read()).map((i) => (i.kind === 'cancel' ? undefined : i.id)).filter((id): id is string => !!id);
}

/**
 * Drops a queued tap (the rider cancelled it before it went out). True if it was still queued.
 * It already went to nearby phones over Bluetooth when it was tapped, so they hear the cancel too,
 * and the server is told as well (once there is signal) in case one of them already passed it on.
 */
export async function removeFromOutbox(id: string): Promise<boolean> {
  const items = await read();
  const it = items.find((i) => i.kind !== 'cancel' && i.id === id);
  if (!it) return false;
  const left = items.filter((i) => i !== it);
  await AsyncStorage.setItem(KEY, JSON.stringify(left));
  // Only when Bluetooth Sharing could have passed it on: else it never left this phone.
  if (nearbyCancel(it.rideId, id)) await queue({ kind: 'cancel', itemId: id, rideId: it.rideId, tappedAt: new Date().toISOString() });
  return true;
}

async function deliver(item: Item): Promise<void> {
  if (item.kind === 'cancel') {
    await cancelRideItem(item.itemId);
    return;
  }
  if (item.kind === 'reply') {
    await sendRideMessage(item.rideId, item.body, 'status', new Date(item.tappedAt), 'everyone', item.id);
    return;
  }
  const at = item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null;
  return sendRiderStatus(item.rideId, item.status, at, new Date(item.tappedAt), item.id);
}
