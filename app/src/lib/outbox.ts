/**
 * Status taps and chat made without signal are kept here and sent on reconnect, stamped
 * with the time they were tapped so others see when it actually happened.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sendRiderStatus } from './api';
import type { RiderStatusKind } from './types';

const KEY = 'ride.outbox.v1';

type Item = { kind: 'status'; rideId: string; status: RiderStatusKind; lat: number | null; lng: number | null; tappedAt: string };

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

export async function flushOutbox(): Promise<number> {
  const items = await read();
  const left: Item[] = [];
  for (const item of items) {
    try {
      await deliver(item);
    } catch {
      left.push(item);
    }
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(left));
  return items.length - left.length;
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

function deliver(item: Item) {
  const at = item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null;
  return sendRiderStatus(item.rideId, item.status, at, new Date(item.tappedAt));
}
