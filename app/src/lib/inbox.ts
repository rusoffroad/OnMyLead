/**
 * The Notifications inbox (see core/inbox and migration 20261102100000_notification_inbox.sql).
 *
 * One small store for the signed-in rider, so the bell on the Rides tab and the Notifications
 * screen always agree. It reloads when the app comes back to the front, when a push arrives, and
 * live from the database while the app is open. Clearing here also clears the same notifications
 * from the phone's own list (notification-tray). Until the migration runs, every call fails soft
 * and the screen says so.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { INBOX_NOT_SWITCHED_ON, inboxNotSwitchedOn, notificationKey, unreadCount, type InboxItem } from '@/core/inbox';
import { track } from './analytics';
import { clearTray, clearTrayFor } from './notification-tray';
import { useSession } from './session';
import { newChannel, supabase } from './supabase';

type Store = { items: InboxItem[]; unread: number; loaded: boolean; off: boolean; error: string | null };
const EMPTY: Store = { items: [], unread: 0, loaded: false, off: false, error: null };
let store: Store = EMPTY;
let owner: string | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  if (next.items) store.unread = unreadCount(store.items);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };
function check<T>(res: Res<T>): T {
  if (res.error) {
    if (inboxNotSwitchedOn(res.error.message, res.error.code)) throw new Error(INBOX_NOT_SWITCHED_ON);
    throw new Error(/network|fetch/i.test(res.error.message) ? 'No signal. Check your connection and try again.' : res.error.message);
  }
  return res.data as T;
}

/** Load (or reload) my notifications. Never throws. */
export async function refreshInbox() {
  const me = owner;
  if (!me) return;
  try {
    const items = check<InboxItem[]>(
      await supabase
        .from('rider_notifications')
        .select('id, kind, title, body, data, count, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ) ?? [];
    if (owner === me) set({ items, loaded: true, off: false, error: null });
  } catch (e) {
    if (owner !== me) return;
    const msg = (e as Error).message;
    set({ loaded: true, off: msg === INBOX_NOT_SWITCHED_ON, error: msg === INBOX_NOT_SWITCHED_ON ? null : msg });
  }
}

function setOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  store = EMPTY;
  listeners.forEach((l) => l());
  if (userId) refreshInbox();
}

/** My notifications and the unread count, for whoever is signed in. */
export function useInbox(): Store {
  const { session, loading } = useSession();
  const me = session?.user.id ?? null;
  useEffect(() => {
    if (!loading) setOwner(me);
  }, [me, loading]);
  return useSyncExternalStore(subscribe, () => store, () => store);
}

/**
 * Keeps the inbox fresh while signed in: live from the database, and again whenever the app
 * comes back to the front. Mounted once, with the message pop-ups.
 */
export function useInboxSync() {
  const { session, loading } = useSession();
  const me = session?.user.id ?? null;
  useEffect(() => {
    if (!loading) setOwner(me);
    if (!me) return;
    const channel = newChannel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_notifications', filter: `user_id=eq.${me}` }, () => {
        refreshInbox();
      })
      .subscribe();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshInbox();
    });
    return () => {
      supabase.removeChannel(channel);
      sub.remove();
    };
  }, [me, loading]);
}

/** Everything I can see now counts as read: the bell's number goes away. */
export async function markInboxRead(ids?: string[]) {
  const now = new Date().toISOString();
  const hit = (i: InboxItem) => !i.read_at && (!ids || ids.includes(i.id));
  if (!store.items.some(hit)) return;
  set({ items: store.items.map((i) => (hit(i) ? { ...i, read_at: now } : i)) });
  try {
    check(await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null }));
  } catch {
    refreshInbox();
  }
}

/** A push was tapped: its inbox row counts as read. */
export function markReadForPush(data: unknown) {
  const key = notificationKey(data);
  if (!key) return;
  const ids = store.items.filter((i) => !i.read_at && notificationKey(i.data) === key).map((i) => i.id);
  if (ids.length) markInboxRead(ids);
  else refreshInbox();
}

/** Clear some rows (and the same notifications on this phone). Throws if the server said no. */
export async function clearInboxItems(ids: string[]) {
  const gone = store.items.filter((i) => ids.includes(i.id));
  set({ items: store.items.filter((i) => !ids.includes(i.id)) });
  clearTrayFor(gone);
  try {
    check(await supabase.rpc('clear_notifications', { p_ids: ids }));
    track('inbox_clear', { count: ids.length });
  } catch (e) {
    await refreshInbox();
    throw e;
  }
}

/** Clear All: every row, every OnMyLead notification on this phone, and the icon badge. */
export async function clearInbox() {
  set({ items: [] });
  clearTray();
  try {
    check(await supabase.rpc('clear_notifications', { p_ids: null }));
    track('inbox_clear_all');
  } catch (e) {
    await refreshInbox();
    throw e;
  }
}
