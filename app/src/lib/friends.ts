/**
 * Friends (see core/friends and migration 20261101800000_friends.sql).
 *
 * My friends list lives in one small store, so the Groups tab card, the Friends screen, Out
 * Riding and the Add Friend buttons agree, and a change in one shows in the others straight away.
 * Until the migration runs, every call fails soft and the screens say so.
 */
import { useEffect, useSyncExternalStore } from 'react';

import {
  friendlyFriendError, friendsNotSwitchedOn, FRIENDS_NOT_SWITCHED_ON,
  type Friend, type FriendPreview, type FriendSuggestion, type RequestResult,
} from '@/core/friends';
import { track } from './analytics';
import { useSession } from './session';
import { supabase } from './supabase';

export class FriendsOffError extends Error {
  constructor() {
    super(FRIENDS_NOT_SWITCHED_ON);
  }
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

function unwrap<T>(res: Res<T>): T {
  if (res.error) {
    if (friendsNotSwitchedOn(res.error.message, res.error.code)) throw new FriendsOffError();
    throw new Error(friendlyFriendError(res.error.message));
  }
  return res.data as T;
}

// ---------------------------------------------------------------------------
// My friends
// ---------------------------------------------------------------------------

type Store = { list: Friend[]; loaded: boolean; off: boolean; error: string | null };
const EMPTY: Store = { list: [], loaded: false, off: false, error: null };
let store: Store = EMPTY;
let owner: string | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Load (or reload) my friends and requests. Never throws. */
export async function refreshFriends() {
  const me = owner;
  if (!me) return;
  try {
    const list = unwrap<Friend[]>(await supabase.rpc('my_friends')) ?? [];
    if (owner === me) set({ list, loaded: true, off: false, error: null });
  } catch (e) {
    if (owner !== me) return;
    set({ loaded: true, off: e instanceof FriendsOffError, error: e instanceof FriendsOffError ? null : (e as Error).message });
  }
}

function setOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  store = EMPTY;
  listeners.forEach((l) => l());
  if (userId) refreshFriends();
}

/** My friends and requests, loaded for whoever is signed in. */
export function useFriends(): Store {
  const { session, loading } = useSession();
  const me = session?.user.id ?? null;
  useEffect(() => {
    if (!loading) setOwner(me);
  }, [me, loading]);
  return useSyncExternalStore(subscribe, () => store, () => store);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Ask a rider I know, can see Out Riding, or have messaged. */
export async function sendFriendRequest(userId: string): Promise<RequestResult> {
  const r = unwrap<RequestResult>(await supabase.rpc('send_friend_request', { p_to: userId }));
  track('friend_request', { via: 'rider', result: r });
  await refreshFriends();
  return r;
}

/** Ask the rider whose friend link this is. */
export async function sendFriendRequestByCode(code: string): Promise<RequestResult> {
  const r = unwrap<RequestResult>(await supabase.rpc('send_friend_request_by_code', { p_code: code }));
  track('friend_request', { via: 'link', result: r });
  await refreshFriends();
  return r;
}

export async function respondFriendRequest(userId: string, accept: boolean) {
  // Show it straight away; the reload puts it right if it didn't go through.
  set({
    list: accept
      ? store.list.map((f) => (f.user_id === userId ? { ...f, status: 'friends' as const } : f))
      : store.list.filter((f) => f.user_id !== userId),
  });
  try {
    unwrap(await supabase.rpc('respond_friend_request', { p_from: userId, p_accept: accept }));
    track(accept ? 'friend_accept' : 'friend_decline');
  } finally {
    await refreshFriends();
  }
}

/** Remove a friend, or cancel a request I sent. The other rider isn't told. */
export async function removeFriend(userId: string) {
  set({ list: store.list.filter((f) => f.user_id !== userId) });
  try {
    unwrap(await supabase.rpc('remove_friend', { p_other: userId }));
    track('friend_removed');
  } finally {
    await refreshFriends();
  }
}

// ---------------------------------------------------------------------------
// Friend link and suggestions
// ---------------------------------------------------------------------------

export async function myFriendCode(): Promise<string> {
  return unwrap<string>(await supabase.rpc('my_friend_code'));
}

/** A new link; the old one stops working. */
export async function resetFriendCode(): Promise<string> {
  const code = unwrap<string>(await supabase.rpc('reset_friend_code'));
  track('friend_link_reset');
  return code;
}

/** Who a friend link belongs to, or null when it doesn't work. */
export async function friendPreview(code: string): Promise<FriendPreview | null> {
  const rows = unwrap<FriendPreview[]>(await supabase.rpc('friend_preview', { p_code: code })) ?? [];
  return rows[0] ?? null;
}

/** Riders I've ridden with or share a riding group with, not friends or asked yet. */
export async function friendSuggestions(): Promise<FriendSuggestion[]> {
  return unwrap<FriendSuggestion[]>(await supabase.rpc('friend_suggestions')) ?? [];
}
