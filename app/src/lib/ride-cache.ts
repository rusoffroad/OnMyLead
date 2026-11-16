/**
 * The last ride, riders, regroup point and status taps this phone saw for each ride, so Ride Mode
 * opens with no service (the route is kept by lib/api getRideRoute, the Bluetooth keys by
 * lib/nearby). Saved on this phone only, in AsyncStorage, and replaced whenever the server answers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { leftHere, startedHere } from '@/core/offline-ride';
import type { Ride, RideMember } from './types';

const key = (rideId: string) => `ride.cache.v1.${rideId}`;

export type CachedRide = {
  ride: Ride | null;
  members: RideMember[];
  /** Ride Mode's own extras (regroup point, taps, positions), when Ride Mode saved it. */
  extra?: Record<string, unknown>;
};

export async function cachedRide(rideId: string): Promise<CachedRide | null> {
  try {
    const raw = await AsyncStorage.getItem(key(rideId));
    return raw ? (JSON.parse(raw) as CachedRide) : null;
  } catch {
    return null;
  }
}

/** Saves what the server just said. The ride page saves the ride and riders; Ride Mode adds its extras. */
export async function rememberRide(rideId: string, next: CachedRide): Promise<void> {
  if (!next.ride) return;
  const extra = next.extra ?? (await cachedRide(rideId))?.extra;
  await AsyncStorage.setItem(key(rideId), JSON.stringify({ ...next, extra })).catch(() => {});
}

async function change(rideId: string, fn: (c: CachedRide) => CachedRide) {
  const c = await cachedRide(rideId);
  if (c) await AsyncStorage.setItem(key(rideId), JSON.stringify(fn(c))).catch(() => {});
}

/** Start Ride Mode went in the queue: the ride is live on this phone until the server says otherwise. */
export const rememberStarted = (rideId: string) => change(rideId, (c) => ({ ...c, ride: startedHere(c.ride) }));

/** Leave Ride went in the queue: this phone no longer counts the rider as on the ride. */
export const rememberLeft = (rideId: string, me: string) => change(rideId, (c) => ({ ...c, members: leftHere(c.members, me) }));
