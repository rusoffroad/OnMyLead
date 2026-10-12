import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  friendlyGroupChatError, mergeGroupMessages, reconcileGroupMessages, type ChatRide, type GroupMessage, type PendingGroupMessage,
} from '@/core/group-chat';
import {
  clearGroupMessage, GroupChatOffError, groupChatRides, groupMessages, markGroupChatRead, sendGroupMessage,
} from '@/lib/group-chat';
import { newChannel, supabase } from '@/lib/supabase';

/** How many of the newest messages a load reads. */
const PAGE = 200;

/**
 * A riding group's chat: loads the newest messages and keeps them live. What this rider sends
 * shows at once as Sending, then Sent, or Not Sent with Retry. Opening it marks it read.
 */
export function useGroupChat(groupId: string | undefined) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [rides, setRides] = useState<ChatRide[]>([]);
  const [pending, setPending] = useState<PendingGroupMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const knownRides = useRef(new Set<string>());

  const fail = useCallback((e: unknown) => {
    if (e instanceof GroupChatOffError) setOff(true);
    else setError(friendlyGroupChatError(e instanceof Error ? e.message : String(e)));
  }, []);

  const loadRides = useCallback(() => {
    if (!groupId) return;
    groupChatRides(groupId)
      .then((r) => {
        knownRides.current = new Set(r.map((x) => x.id));
        setRides(r);
      })
      .catch(() => {});
  }, [groupId]);

  const reload = useCallback(
    () =>
      groupId
        ? groupMessages(groupId, PAGE)
            .then((page) => {
              setOff(false);
              setMessages((prev) => reconcileGroupMessages(prev, page, PAGE));
              markGroupChatRead(groupId).catch(() => {});
            })
            .catch(fail)
            .finally(() => setLoaded(true))
        : Promise.resolve(),
    [groupId, fail],
  );

  useEffect(() => {
    if (!groupId) return;
    reload();
    loadRides();
    const channel = newChannel(`group-chat-${groupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` }, (payload) => {
        const m = payload.new as GroupMessage;
        if (!m?.id) return;
        setMessages((prev) => mergeGroupMessages(prev, [m]));
        if (m.ride_id && !knownRides.current.has(m.ride_id)) loadRides();
        markGroupChatRead(groupId).catch(() => {});
      })
      // Deletes carry only the id and can't be filtered by group.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe();
    // Fallback for dropped realtime connections.
    const poll = setInterval(reload, 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [groupId, reload, loadRides]);

  const deliver = useCallback(
    async (item: PendingGroupMessage) => {
      if (!groupId) return false;
      try {
        const row = await sendGroupMessage(groupId, item.body, item.rideId, new Date(item.at));
        setMessages((prev) => mergeGroupMessages(prev, [row]));
        setPending((prev) => prev.filter((p) => p.localId !== item.localId));
        if (row.ride_id && !knownRides.current.has(row.ride_id)) loadRides();
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return true;
      } catch (e) {
        if (e instanceof GroupChatOffError) setOff(true);
        const err = friendlyGroupChatError(e instanceof Error ? e.message : String(e));
        setPending((prev) => prev.map((p) => (p.localId === item.localId ? { ...p, state: 'failed', error: err } : p)));
        return false;
      }
    },
    [groupId, loadRides],
  );

  /** Shows the message as Sending right away; resolves true once the database has it. */
  const send = useCallback(
    (body: string, rideId: string | null) => {
      setError(null);
      const item: PendingGroupMessage = {
        localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        body, rideId, state: 'sending', at: new Date().toISOString(),
      };
      setPending((prev) => [...prev, item]);
      return deliver(item);
    },
    [deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = pendingRef.current.find((p) => p.localId === localId);
      if (!item || item.state === 'sending') return;
      const again: PendingGroupMessage = { ...item, state: 'sending', error: undefined };
      setPending((prev) => prev.map((p) => (p.localId === localId ? again : p)));
      deliver(again);
    },
    [deliver],
  );

  const discard = useCallback((localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const clear = useCallback(
    async (messageId: string) => {
      setError(null);
      try {
        await clearGroupMessage(messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  return { messages, rides, pending, loaded, off, error, send, retry, discard, clear, reload };
}
