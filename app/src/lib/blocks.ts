import { useEffect, useSyncExternalStore } from 'react';

import { blockPrompt, blocksNotSwitchedOn, BLOCKS_NOT_SWITCHED_ON, sortBlocked, type BlockedRider } from '@/core/blocks';
import { track } from './analytics';
import { confirmAsync, showNotice } from './confirm';
import { useSession } from './session';
import { supabase } from './supabase';

/**
 * The riders this rider has blocked (see core/blocks), kept in one small store so every chat
 * screen filters the same way. Loads once per signed-in rider. Until the server has the
 * blocked_riders table this fails soft: the list is empty, nothing is hidden, nothing is shown.
 */

type Blocks = { ids: ReadonlySet<string>; list: BlockedRider[]; loaded: boolean; off: boolean };

const EMPTY: Blocks = { ids: new Set(), list: [], loaded: false, off: false };
let current: Blocks = EMPTY;
let owner: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Blocks>) {
  const list = next.list ?? current.list;
  current = { ...current, ...next, list, ids: new Set(list.map((b) => b.userId)) };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

async function fetchBlocks(): Promise<BlockedRider[]> {
  const { data, error } = await supabase.from('blocked_riders').select('blocked_id, created_at');
  if (error) throw error;
  const rows = (data ?? []) as { blocked_id: string; created_at: string }[];
  if (!rows.length) return [];
  const { data: people } = await supabase.from('profiles').select('id, display_name').in('id', rows.map((r) => r.blocked_id));
  const names = new Map(((people ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  return sortBlocked(rows.map((r) => ({ userId: r.blocked_id, name: names.get(r.blocked_id)?.trim() || 'Rider', blockedAt: r.created_at })));
}

/** Loads (or with force, reloads) the blocks of whoever is signed in; null clears them on sign-out. */
export function loadBlocks(userId: string | null, force = false): Promise<void> {
  if (userId !== owner) {
    owner = userId;
    loading = null;
    current = EMPTY;
    listeners.forEach((l) => l());
  }
  if (!userId) return Promise.resolve();
  if (loading && !force) return loading;
  const mine = (loading = fetchBlocks()
    .then((list) => {
      if (owner === userId) set({ list, loaded: true, off: false });
    })
    .catch((e: { message?: string; code?: string }) => {
      if (owner !== userId) return;
      // Not on the server yet: nothing to hide. Anything else (no signal): keep what we had.
      if (blocksNotSwitchedOn(e?.message, e?.code)) set({ list: [], loaded: true, off: true });
      else set({ loaded: true });
      if (loading === mine) loading = null;
    }));
  return mine;
}

/** Who this rider has blocked, for code outside React (the message pop-ups). */
export const blockedIds = () => current.ids;

/** The signed-in rider's blocks, loading them on first use. */
export function useBlocks(): Blocks {
  const { session, loading: sessionLoading } = useSession();
  const me = session?.user.id ?? null;
  useEffect(() => {
    if (!sessionLoading) loadBlocks(me);
  }, [me, sessionLoading]);
  return useSyncExternalStore(subscribe, () => current, () => current);
}

class BlocksOffError extends Error {
  constructor() {
    super(BLOCKS_NOT_SWITCHED_ON);
  }
}

export async function blockRider(userId: string, name: string) {
  const { error } = await supabase.from('blocked_riders').insert({ blocked_id: userId });
  // 23505: already blocked, which is what they wanted.
  if (error && error.code !== '23505') {
    if (blocksNotSwitchedOn(error.message, error.code)) {
      set({ off: true });
      throw new BlocksOffError();
    }
    throw new Error(error.message);
  }
  if (!current.ids.has(userId)) {
    set({ list: sortBlocked([...current.list, { userId, name: name.trim() || 'Rider', blockedAt: new Date().toISOString() }]) });
  }
  track('rider_blocked');
}

export async function unblockRider(userId: string) {
  const { error } = await supabase.from('blocked_riders').delete().eq('blocked_id', userId);
  if (error) throw new Error(error.message);
  set({ list: current.list.filter((b) => b.userId !== userId) });
  track('rider_unblocked');
}

/** Asks first (they won't be told), then blocks. True once they're blocked. */
export async function confirmAndBlock(userId: string, name: string): Promise<boolean> {
  const p = blockPrompt(name);
  if (!(await confirmAsync(p.title, p.message, p.confirm))) return false;
  try {
    await blockRider(userId, name);
    return true;
  } catch (e) {
    if (e instanceof BlocksOffError) showNotice('Not Switched On Yet', e.message);
    else showNotice('Couldn’t Block This Rider', e instanceof Error ? e.message : 'Something went wrong. Try again.');
    return false;
  }
}
