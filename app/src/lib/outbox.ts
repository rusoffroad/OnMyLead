/**
 * Status taps and chat made without signal are kept here and sent on reconnect, stamped
 * with the time they were tapped so others see when it actually happened.
 *
 * Each tap carries the id the phone picked for it, so a send that timed out but landed anyway
 * counts as sent when it is retried, never as a second tap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEND_TIMEOUT_MS } from '@/core/broadcast';
import type { QuickReply } from '@/core/chat';
import { sendRideMessage, sendRiderStatus } from './api';
import type { RiderStatusKind } from './types';

const KEY = 'ride.outbox.v1';

type Item =
  | { kind: 'status'; id?: string; rideId: string; status: RiderStatusKind; lat: number | null; lng: number | null; tappedAt: string }
  | { kind: 'reply'; id?: string; rideId: string; body: QuickReply; tappedAt: string };

async function read(): Promise<Item[]> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
}

/** Send now; with no answer within SEND_TIMEOUT_MS (no signal), queue it. True if it went out. */
async function sendOrQueue(item: Item): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), SEND_TIMEOUT_MS);
  });
  try {
    await Promise.race([deliver(item), timeout]);
    return true;
  } catch {
    await AsyncStorage.setItem(KEY, JSON.stringify([...(await read()), item]));
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Try to send now; queue if it fails. Returns true if it went out immediately. */
export function sendStatusReliably(
  rideId: string, status: RiderStatusKind, at: { lat: number; lng: number } | null, id?: string,
): Promise<boolean> {
  return sendOrQueue({ kind: 'status', id, rideId, status, lat: at?.lat ?? null, lng: at?.lng ?? null, tappedAt: new Date().toISOString() });
}

/** Ride Mode quick reply: send now or queue it, like a status tap. */
export function sendQuickReplyReliably(rideId: string, body: QuickReply, id?: string): Promise<boolean> {
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
    } catch {
      // A quick reply that still can't go out after 12 hours is no longer useful.
      if (item.kind === 'reply' && Date.now() - Date.parse(item.tappedAt) > 12 * 3600_000) done.push(item);
    }
  }
  // Read again: a tap may have been queued or cancelled while this ran.
  const now = await read();
  await AsyncStorage.setItem(KEY, JSON.stringify(now.filter((i) => !done.some((d) => sameItem(d, i)))));
  return done.length;
}

const sameItem = (a: Item, b: Item) => (a.id && b.id ? a.id === b.id : a.tappedAt === b.tappedAt && a.kind === b.kind);

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

/** Ids of the taps still waiting for signal. */
export async function pendingIds(): Promise<string[]> {
  return (await read()).map((i) => i.id).filter((id): id is string => !!id);
}

/** Drops a queued tap (the rider cancelled it before it went out). True if it was still queued. */
export async function removeFromOutbox(id: string): Promise<boolean> {
  const items = await read();
  const left = items.filter((i) => i.id !== id);
  if (left.length === items.length) return false;
  await AsyncStorage.setItem(KEY, JSON.stringify(left));
  return true;
}

async function deliver(item: Item): Promise<void> {
  if (item.kind === 'reply') {
    await sendRideMessage(item.rideId, item.body, 'status', new Date(item.tappedAt), 'everyone', item.id);
    return;
  }
  const at = item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null;
  return sendRiderStatus(item.rideId, item.status, at, new Date(item.tappedAt), item.id);
}
