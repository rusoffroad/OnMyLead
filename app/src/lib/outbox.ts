/**
 * Status taps and chat made without signal are kept here and sent on reconnect, stamped
 * with the time they were tapped so others see when it actually happened.
 *
 * Each tap carries the id the phone picked for it, so a send that timed out but landed anyway
 * counts as sent when it is retried, never as a second tap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { SEND_TIMEOUT_MS } from '@/core/broadcast';
import { isTransientError } from '@/core/errors';
import { dropQueuedRideAction, startStillWanted } from '@/core/offline-ride';
import { cancelRideItem, getRide, leaveRide, sendRideMessage, sendRiderStatus, setRideStatus } from './api';
import { rememberLeft, rememberStarted } from './ride-cache';
import { supabase } from './supabase';
import { nearbyCancel, nearbyReply, nearbyStatus } from './nearby';
import type { RiderStatusKind } from './types';

const KEY = 'ride.outbox.v1';

type Item =
  | { kind: 'status'; id?: string; rideId: string; status: RiderStatusKind; lat: number | null; lng: number | null; tappedAt: string }
  | { kind: 'reply'; id?: string; rideId: string; body: string; tappedAt: string }
  // Cancel pressed with no service: taken back for the group once there is signal. `itemId` is the
  // tap or message; it has no `id` of its own, so it never counts as a tap waiting to go out.
  | { kind: 'cancel'; id?: undefined; itemId: string; rideId: string; tappedAt: string }
  // Start Ride Mode or Leave Ride pressed with no service: done on this phone at once, and told to
  // the server once there is signal (core/offline-ride). No `id`, so never a tap waiting to go out.
  | { kind: 'start'; id?: undefined; rideId: string; tappedAt: string }
  | { kind: 'leave'; id?: undefined; rideId: string; tappedAt: string };

type RideAction = Extract<Item, { kind: 'start' | 'leave' }>;

async function read(): Promise<Item[]> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
}

/** Runs a send, or fails with 'timed out' when there is no answer within SEND_TIMEOUT_MS. */
export async function withTimeout<T>(run: Promise<T>): Promise<T> {
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
async function sendOrQueue(item: Extract<Item, { kind: 'status' | 'reply' }>): Promise<boolean> {
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

/**
 * Start Ride Mode (organizers). With no answer within SEND_TIMEOUT_MS (no signal) it is queued and
 * the ride counts as live on this phone, so Ride Mode opens anyway. True when the server has it
 * now. A turn-down from the server is thrown, and nothing is queued.
 */
export async function startRideReliably(rideId: string): Promise<boolean> {
  try {
    await withTimeout(setRideStatus(rideId, 'live'));
    return true;
  } catch (e) {
    if (!isNoAnswer(e)) throw e;
    await queueRideAction({ kind: 'start', rideId, tappedAt: new Date().toISOString() });
    await rememberStarted(rideId);
    return false;
  }
}

/**
 * Leave Ride (or leave a waitlist or request). With no answer within SEND_TIMEOUT_MS it is queued
 * and the rider is off the ride on this phone at once; the server hears once there is signal.
 * True when the server has it now. A turn-down from the server is thrown, and nothing is queued.
 */
export async function leaveRideReliably(rideId: string, me: string): Promise<boolean> {
  try {
    await withTimeout(leaveRide(rideId));
    return true;
  } catch (e) {
    if (!isNoAnswer(e)) throw e;
    await queueRideAction({ kind: 'leave', rideId, tappedAt: new Date().toISOString() });
    await rememberLeft(rideId, me);
    return false;
  }
}

/** Joined again: a leave still waiting for signal must not take the rider back off the ride. */
export async function dropQueuedLeave(rideId: string): Promise<void> {
  const items = await read();
  const left = items.filter((i) => !(i.kind === 'leave' && i.rideId === rideId));
  if (left.length !== items.length) await AsyncStorage.setItem(KEY, JSON.stringify(left));
}

async function queueRideAction(item: RideAction) {
  const items = await read();
  // Pressed twice with no service: once is enough.
  if (!items.some((i) => sameItem(i, item))) await queue(item);
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

/** Screens that show a ride (the ride page) hear when a queued start or leave for it reached the server. */
const sentListeners = new Set<(rideId: string) => void>();
export function onRideActionSent(fn: (rideId: string) => void): () => void {
  sentListeners.add(fn);
  return () => {
    sentListeners.delete(fn);
  };
}

export async function flushOutbox(): Promise<number> {
  const items = await read();
  if (!items.length) return 0;
  const done: Item[] = [];
  for (const item of items) {
    try {
      // Each send gets the same no-answer cap as a live tap: one request left hanging when the
      // signal dropped must not hold every later tap, start and leave in the queue (3.1 build 20
      // test: a hung flush kept a queued start from ever going out until the app was killed).
      await withTimeout(deliver(item));
      done.push(item);
    } catch (e) {
      const age = Date.now() - Date.parse(item.tappedAt);
      // A quick reply that still can't go out after 12 hours is no longer useful.
      if (item.kind === 'reply' && age > 12 * 3600_000) done.push(item);
      // A cancel the server turned down (the tap may still be on its way from a nearby phone, so
      // it keeps trying for an hour), or one that is a day old, is dropped.
      if (item.kind === 'cancel' && ((!isNoAnswer(e) && age > 3600_000) || age > 24 * 3600_000)) done.push(item);
      if ((item.kind === 'start' || item.kind === 'leave') && dropQueuedRideAction(isNoAnswer(e) ? 'no_answer' : 'refused', age)) done.push(item);
    }
  }
  // Read again: a tap may have been queued or cancelled while this ran.
  const now = await read();
  await AsyncStorage.setItem(KEY, JSON.stringify(now.filter((i) => !done.some((d) => sameItem(d, i)))));
  // A start or leave that went out changed the ride: a ride page open since there was no service
  // still shows the old status (3.1 build 22 test: "Start Ride Mode" after the ride had gone live).
  for (const d of done) {
    if (d.kind !== 'start' && d.kind !== 'leave') continue;
    sentListeners.forEach((fn) => {
      try {
        fn(d.rideId);
      } catch {
        // A screen's refresh must never break the queue.
      }
    });
  }
  return done.length;
}

const sameItem = (a: Item, b: Item) => {
  if (a.kind === 'start' || a.kind === 'leave' || b.kind === 'start' || b.kind === 'leave') return a.kind === b.kind && a.rideId === b.rideId;
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
  if (item.kind === 'leave') {
    await leaveRide(item.rideId);
    return;
  }
  if (item.kind === 'start') {
    // Only a ride still waiting to start: never bring back one that ended or was cancelled since.
    if (startStillWanted((await getRide(item.rideId))?.status)) await setRideStatus(item.rideId, 'live');
    return;
  }
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

let flushing: Promise<unknown> | null = null;

/**
 * Sends what is waiting once there is signal, on any screen: a rider who left a ride with no
 * service may never open Ride Mode again. Tries every 30 s while something is queued, and when the
 * app comes back to the front. Returns the stop function.
 */
export function startOutboxSync(): () => void {
  const tryNow = () => {
    if (flushing) return;
    // Only once signed in (the saved sign-in loads after launch): the server would turn a start down.
    flushing = Promise.all([pendingCount(), supabase.auth.getSession()])
      .then(([n, { data }]) => (n && data.session ? flushOutbox() : 0))
      .catch(() => 0)
      .finally(() => {
        flushing = null;
      });
  };
  tryNow();
  const timer = setInterval(tryNow, 30_000);
  const sub = AppState.addEventListener('change', (s) => s === 'active' && tryNow());
  return () => {
    clearInterval(timer);
    sub.remove();
  };
}
