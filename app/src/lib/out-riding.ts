/**
 * Out Riding and direct messages (see core/out-riding and migration 20261101700000_out_riding.sql).
 *
 * My own status lives in one small store, so the Groups tab card, the Out Riding screen and the
 * refresh on app open agree. While it's on, opening the app sends a fresh rough area (one
 * while-using location fix, never background location); the database snaps it to about a mile
 * before saving. Until the migration runs, every call fails soft and the screens say so.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import {
  friendlyOutRidingError, isOut, outRidingNotSwitchedOn, NOT_SWITCHED_ON, REFRESH_EVERY_MS,
  type Audience, type DirectMessage, type DmThread, type MyOutRiding, type NearbyRider,
} from '@/core/out-riding';
import { track } from './analytics';
import { currentPosition } from './location';
import { useSession } from './session';
import { supabase } from './supabase';

import { tc } from '@/core/i18n';
export class OutRidingOffError extends Error {
  constructor() {
    super(NOT_SWITCHED_ON);
  }
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

function unwrap<T>(res: Res<T>): T {
  if (res.error) {
    if (outRidingNotSwitchedOn(res.error.message, res.error.code)) throw new OutRidingOffError();
    throw new Error(friendlyOutRidingError(res.error.message));
  }
  return res.data as T;
}

// ---------------------------------------------------------------------------
// My status
// ---------------------------------------------------------------------------

type Mine = { status: MyOutRiding | null; loaded: boolean; off: boolean; busy: boolean; error: string | null };
const EMPTY: Mine = { status: null, loaded: false, off: false, busy: false, error: null };
let mine: Mine = EMPTY;
let owner: string | null = null;
let lastRefresh = 0;
const listeners = new Set<() => void>();

function set(next: Partial<Mine>) {
  mine = { ...mine, ...next };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

async function loadMine(userId: string) {
  try {
    const row = unwrap<MyOutRiding | null>(
      await supabase.from('out_riding').select('audience, spot, started_at, refreshed_at, expires_at').eq('user_id', userId).maybeSingle(),
    );
    if (owner === userId) set({ status: row, loaded: true, off: false });
  } catch (e) {
    if (owner !== userId) return;
    set({ loaded: true, off: e instanceof OutRidingOffError });
  }
}

function setOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  lastRefresh = 0;
  mine = EMPTY;
  listeners.forEach((l) => l());
  if (userId) loadMine(userId);
}

/** A rough fix is plenty: the database snaps it to about a mile anyway. */
const roughPosition = () => currentPosition(Location.Accuracy.Balanced);

/** Switch Out Riding on (or change who sees me, the spot or how long). */
export async function goOutRiding(opts: { audience: Audience; spot: string | null; hours: number }) {
  set({ busy: true, error: null });
  try {
    const p = await roughPosition();
    const row = unwrap<MyOutRiding>(
      await supabase.rpc('set_out_riding', {
        p_lat: p.lat, p_lng: p.lng, p_audience: opts.audience, p_spot: opts.spot, p_hours: opts.hours, p_keep_spot: false,
      }),
    );
    lastRefresh = Date.now();
    set({ status: row, busy: false, off: false });
    track('out_riding_on', { audience: opts.audience, hours: opts.hours, spot: !!opts.spot });
  } catch (e) {
    set({ busy: false, off: e instanceof OutRidingOffError, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Change who sees me or the spot, without moving the end time. */
export async function updateOutRiding(opts: { audience?: Audience; spot?: string | null }) {
  const p = await roughPosition();
  const row = unwrap<MyOutRiding>(
    await supabase.rpc('set_out_riding', {
      p_lat: p.lat, p_lng: p.lng, p_audience: opts.audience ?? null, p_spot: opts.spot ?? null, p_hours: null,
      p_keep_spot: opts.spot === undefined,
    }),
  );
  lastRefresh = Date.now();
  set({ status: row, error: null });
}

/** Switch it off: the database deletes the status and the area with it. */
export async function stopOutRiding() {
  const before = mine.status;
  set({ status: null, error: null });
  try {
    unwrap(await supabase.rpc('stop_out_riding'));
    track('out_riding_off');
  } catch (e) {
    set({ status: before, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** While it's on, send a fresh rough area (at most every 10 minutes). Never throws. */
export async function refreshOutRiding(force = false) {
  if (!owner || !isOut(mine.status)) return;
  if (!force && Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
  lastRefresh = Date.now();
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    const p = await roughPosition();
    const row = unwrap<MyOutRiding>(await supabase.rpc('set_out_riding', { p_lat: p.lat, p_lng: p.lng }));
    set({ status: row });
  } catch {
    // No signal or rate limited: it stays listed at the last area until it idles out.
  }
}

/** My status, loaded for whoever is signed in. */
export function useMyOutRiding(): Mine {
  const { session, loading } = useSession();
  const me = session?.user.id ?? null;
  useEffect(() => {
    if (!loading) setOwner(me);
  }, [me, loading]);
  return useSyncExternalStore(subscribe, () => mine, () => mine);
}

/**
 * Mounted once for the whole app: keeps my status loaded, and while it's on refreshes the rough
 * area each time the app comes to the front (that's what keeps it from idling out).
 */
export function useOutRidingKeeper() {
  const status = useMyOutRiding();
  const on = isOut(status.status);
  useEffect(() => {
    if (!on) return;
    refreshOutRiding();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshOutRiding();
    });
    return () => sub.remove();
  }, [on]);
}

/** Who's out near me. Empty when I'm not Out Riding myself. */
export async function nearbyRiders(miles: number, scope: Audience): Promise<NearbyRider[]> {
  return unwrap<NearbyRider[]>(await supabase.rpc('nearby_riders', { p_miles: miles, p_scope: scope })) ?? [];
}

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

export async function myDmThreads(): Promise<DmThread[]> {
  return unwrap<DmThread[]>(await supabase.rpc('my_dm_threads')) ?? [];
}

/** My conversation with this rider, or null when we haven't talked yet. */
export async function dmThreadWith(userId: string): Promise<string | null> {
  return unwrap<string | null>(await supabase.rpc('dm_thread_with', { p_other: userId }));
}

/** The newest `limit` messages of a conversation I can see, oldest first, after I deleted it if I did. */
export async function directMessages(threadId: string, limit: number, after: string | null): Promise<DirectMessage[]> {
  let q = supabase.from('direct_messages').select('*').eq('thread_id', threadId);
  if (after) q = q.gt('created_at', after);
  const rows = unwrap<DirectMessage[]>(await q.order('created_at', { ascending: false }).limit(limit));
  return rows.reverse();
}

export async function sendDirectMessage(to: string, body: string, sentAt: Date): Promise<DirectMessage> {
  const row = unwrap<DirectMessage>(await supabase.rpc('send_direct_message', { p_to: to, p_body: body, p_sent_at: sentAt.toISOString() }));
  track('direct_message');
  return row;
}

export async function markDmRead(threadId: string) {
  unwrap(await supabase.rpc('mark_dm_read', { p_thread: threadId }));
}

export async function setDmMuted(threadId: string, muted: boolean) {
  unwrap(await supabase.rpc('set_dm_muted', { p_thread: threadId, p_muted: muted }));
  track('direct_message_muted', { muted });
}

/** Deletes the conversation from my list only; the other rider keeps theirs. */
export async function clearDmThread(threadId: string) {
  unwrap(await supabase.rpc('clear_dm_thread', { p_thread: threadId }));
  track('direct_message_cleared');
}

/** A rider's name, for a conversation opened before there's anything in the list. */
export async function riderName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return (data as { display_name?: string } | null)?.display_name?.trim() || tc('Rider');
}

/** The conversation open on screen right now, so its own push doesn't also show as a banner. */
let openDm: string | null = null;
export const setOpenDm = (userId: string | null) => {
  openDm = userId;
};
export const openDmWith = () => openDm;
