/**
 * Status taps and chat made without signal are kept here and sent on reconnect, stamped
 * with the time they were tapped so others see when it actually happened.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { QuickReply } from '@/core/chat';
import { sendRideMessage, sendRiderStatus } from './api';
import type { RiderStatusKind } from './types';

const KEY = 'ride.outbox.v1';

type Item =
  | { kind: 'status'; rideId: string; status: RiderStatusKind; lat: number | null; lng: number | null; tappedAt: string }
  | { kind: 'reply'; rideId: string; body: QuickReply; tappedAt: string };

async function read(): Promise<Item[]> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
}

/** Try to send now; queue if it fails. Returns true if it went out immediately. */
export async function sendStatusReliably(rideId: string, status: RiderStatusKind, at: { lat: number; lng: number } | null): Promise<boolean> {
  const item: Item = { kind: 'status', rideId, status, lat: at?.lat ?? null, lng: at?.lng ?? null, tappedAt: new Date().toISOString() };
  try {
    await deliver(item);
    return true;
  } catch {
    await AsyncStorage.setItem(KEY, JSON.stringify([...(await read()), item]));
    return false;
  }
}

/** Ride Mode quick reply: send now or queue it, like a status tap. */
export async function sendQuickReplyReliably(rideId: string, body: QuickReply): Promise<boolean> {
  const item: Item = { kind: 'reply', rideId, body, tappedAt: new Date().toISOString() };
  try {
    await deliver(item);
    return true;
  } catch {
    await AsyncStorage.setItem(KEY, JSON.stringify([...(await read()), item]));
    return false;
  }
}

export async function flushOutbox(): Promise<number> {
  const items = await read();
  const left: Item[] = [];
  for (const item of items) {
    try {
      await deliver(item);
    } catch {
      // A quick reply that still can't go out after 12 hours is no longer useful.
      const stale = item.kind === 'reply' && Date.now() - Date.parse(item.tappedAt) > 12 * 3600_000;
      if (!stale) left.push(item);
    }
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(left));
  return items.length - left.length;
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

async function deliver(item: Item): Promise<void> {
  if (item.kind === 'reply') {
    await sendRideMessage(item.rideId, item.body, 'status', new Date(item.tappedAt));
    return;
  }
  const at = item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null;
  return sendRiderStatus(item.rideId, item.status, at, new Date(item.tappedAt));
}
