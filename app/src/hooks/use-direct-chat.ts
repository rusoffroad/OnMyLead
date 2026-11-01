import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { friendlyOutRidingError, mergeDirectMessages, type DirectMessage, type DmThread } from '@/core/out-riding';
import { directMessages, dmThreadWith, markDmRead, myDmThreads, OutRidingOffError, sendDirectMessage } from '@/lib/out-riding';
import { newChannel, supabase } from '@/lib/supabase';

const PAGE = 200;

export type PendingDm = { localId: string; body: string; state: 'sending' | 'failed'; error?: string; at: string };

/**
 * A conversation with one rider: finds it (it may not exist yet), loads the newest messages after
 * I last deleted it, keeps them live, and sends with Sending, Sent, or Not Sent with Retry. The
 * first message sent starts the conversation.
 */
export function useDirectChat(otherId: string | undefined) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [summary, setSummary] = useState<DmThread | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [pending, setPending] = useState<PendingDm[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const fail = useCallback((e: unknown) => {
    if (e instanceof OutRidingOffError) setOff(true);
    else setError(friendlyOutRidingError(e instanceof Error ? e.message : String(e)));
  }, []);

  const reload = useCallback(async () => {
    if (!otherId) return;
    try {
      const id = await dmThreadWith(otherId);
      setThreadId(id);
      if (id) {
        const all = await myDmThreads();
        const mine = all.find((t) => t.thread_id === id) ?? null;
        setSummary(mine);
        const page = await directMessages(id, PAGE, mine?.cleared_at ?? null);
        setMessages(page);
        markDmRead(id).catch(() => {});
      }
      setOff(false);
    } catch (e) {
      fail(e);
    } finally {
      setLoaded(true);
    }
  }, [otherId, fail]);

  useEffect(() => {
    const t = setTimeout(reload, 0);
    const poll = setInterval(reload, 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [reload]);

  useEffect(() => {
    if (!threadId) return;
    const channel = newChannel(`dm-${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const m = payload.new as DirectMessage;
        if (!m?.id) return;
        setMessages((prev) => mergeDirectMessages(prev, [m]));
        markDmRead(threadId).catch(() => {});
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  const deliver = useCallback(
    async (item: PendingDm) => {
      if (!otherId) return false;
      try {
        const row = await sendDirectMessage(otherId, item.body, new Date(item.at));
        setThreadId(row.thread_id);
        setMessages((prev) => mergeDirectMessages(prev, [row]));
        setPending((prev) => prev.filter((p) => p.localId !== item.localId));
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return true;
      } catch (e) {
        if (e instanceof OutRidingOffError) setOff(true);
        const err = friendlyOutRidingError(e instanceof Error ? e.message : String(e));
        setPending((prev) => prev.map((p) => (p.localId === item.localId ? { ...p, state: 'failed', error: err } : p)));
        return false;
      }
    },
    [otherId],
  );

  const send = useCallback(
    (body: string) => {
      setError(null);
      const item: PendingDm = { localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, body, state: 'sending', at: new Date().toISOString() };
      setPending((prev) => [...prev, item]);
      return deliver(item);
    },
    [deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = pendingRef.current.find((p) => p.localId === localId);
      if (!item || item.state === 'sending') return;
      const again: PendingDm = { ...item, state: 'sending', error: undefined };
      setPending((prev) => prev.map((p) => (p.localId === localId ? again : p)));
      deliver(again);
    },
    [deliver],
  );

  const discard = useCallback((localId: string) => setPending((prev) => prev.filter((p) => p.localId !== localId)), []);

  return { threadId, summary, messages, pending, loaded, off, error, send, retry, discard, reload, setMessages };
}
