import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  friendlyChatError, mergeMessages, messageActionsNotSwitchedOn, reconcileMessages, withoutMessage,
  type ChatMessage, type MessageAudience, type MessageKind, type PendingMessage,
} from '@/core/chat';
import { mergeVotes, pollsNotSwitchedOn, type PollVote } from '@/core/polls';
import {
  clearRideMessage, rideMessages, ridePollVotes, sendRideMessage, sendRidePoll, setMessageResolved, voteOnPoll,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { newChannel, supabase } from '@/lib/supabase';
import { useAcknowledge } from './use-broadcast';

/**
 * Ride chat for a joined rider: loads recent messages and keeps them live with a realtime
 * subscription. Pass enabled=false for people who are not on the ride (the database would
 * return nothing for them anyway). Also carries the votes on the ride's quick polls.
 *
 * What this rider sends shows at once as Sending, then Sent, or Not Sent with Retry. The
 * sender can clear a message for everyone or mark it resolved.
 */
/** How many of the newest messages a load reads. */
const PAGE = 100;

export function useRideChat(rideId: string | null | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<PollVote[]>([]);
  /** False until the database has the polls update; the composer says so instead of failing. */
  const [pollsOn, setPollsOn] = useState(true);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  /** False until the database has the Clear and Mark Resolved update. */
  const [actionsOn, setActionsOn] = useState(true);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const votesRef = useRef(votes);
  useEffect(() => {
    votesRef.current = votes;
  }, [votes]);

  // Ride Mode quick replies from other riders reached this phone: their card says Seen by.
  const { session } = useSession();
  const quickReplies = useMemo(
    () => messages.filter((m) => m.kind === 'status').map((m) => ({ id: m.id, user_id: m.user_id, at: m.created_at })),
    [messages],
  );
  useAcknowledge(enabled ? rideId : null, session?.user.id, quickReplies);

  const reload = useCallback(
    () =>
      rideId && enabled
        ? rideMessages(rideId, PAGE)
            .then((rows) => setMessages((prev) => reconcileMessages(prev, rows, PAGE)))
            .catch((e) => setError(friendlyChatError(e instanceof Error ? e.message : String(e))))
        : Promise.resolve(),
    [rideId, enabled],
  );

  const reloadVotes = useCallback(
    () =>
      rideId && enabled
        ? ridePollVotes(rideId)
            .then((rows) => {
              setPollsOn(true);
              setVotes((prev) => mergeVotes(prev, rows));
            })
            .catch((e) => {
              if (pollsNotSwitchedOn(e instanceof Error ? e.message : String(e))) setPollsOn(false);
            })
        : Promise.resolve(),
    [rideId, enabled],
  );

  useEffect(() => {
    if (!rideId || !enabled) return;
    reload();
    reloadVotes();
    const onVote = (payload: { new: unknown }) => {
      const v = payload.new as PollVote;
      if (v?.message_id) setVotes((prev) => mergeVotes(prev, [v]));
    };
    const channel = newChannel(`ride-chat-${rideId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` }, (payload) => {
        const m = payload.new as ChatMessage;
        if (!m?.id) return;
        setMessages((prev) => mergeMessages(prev, [m]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` }, (payload) => {
        const m = payload.new as ChatMessage;
        if (m?.id) setMessages((prev) => (prev.some((x) => x.id === m.id) ? mergeMessages(prev, [m]) : prev));
      })
      // Deletes carry only the id and can't be filtered by ride.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ride_messages' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (id) setMessages((prev) => withoutMessage(prev, id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_poll_votes', filter: `ride_id=eq.${rideId}` }, onVote)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_poll_votes', filter: `ride_id=eq.${rideId}` }, onVote)
      .subscribe();
    // Fallback for dropped realtime connections.
    const poll = setInterval(() => {
      reload();
      reloadVotes();
    }, 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [rideId, enabled, reload, reloadVotes]);

  const deliver = useCallback(
    async (item: PendingMessage) => {
      if (!rideId) return false;
      try {
        const row = await sendRideMessage(rideId, item.body, item.kind, new Date(item.at), item.audience);
        setMessages((prev) => mergeMessages(prev, [row]));
        setPending((prev) => prev.filter((p) => p.localId !== item.localId));
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return true;
      } catch (e) {
        const error = friendlyChatError(e instanceof Error ? e.message : String(e));
        setPending((prev) => prev.map((p) => (p.localId === item.localId ? { ...p, state: 'failed', error } : p)));
        return false;
      }
    },
    [rideId],
  );

  /** Shows the message as Sending right away; resolves true once the database has it. */
  const send = useCallback(
    async (body: string, kind: MessageKind = 'chat', audience: MessageAudience = 'everyone') => {
      if (!rideId) return false;
      setError(null);
      const item: PendingMessage = {
        localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        body, kind, audience, state: 'sending', at: new Date().toISOString(),
      };
      setPending((prev) => [...prev, item]);
      return deliver(item);
    },
    [rideId, deliver],
  );

  /** Tries a Not Sent message again, keeping the time it was first sent. */
  const retry = useCallback(
    (localId: string) => {
      const item = pendingRef.current.find((p) => p.localId === localId);
      if (!item || item.state === 'sending') return Promise.resolve(false);
      const again: PendingMessage = { ...item, state: 'sending', error: undefined };
      setPending((prev) => prev.map((p) => (p.localId === localId ? again : p)));
      return deliver(again);
    },
    [deliver],
  );

  /** Drops a Not Sent message without sending it. */
  const discard = useCallback((localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const actionFailed = useCallback((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    if (messageActionsNotSwitchedOn(message)) setActionsOn(false);
    setError(friendlyChatError(message));
  }, []);

  /** Marks one of my messages resolved (or open again) on screen at once; undoes it if saving fails. */
  const resolve = useCallback(
    async (messageId: string, resolved: boolean) => {
      setError(null);
      const before = messagesRef.current.find((m) => m.id === messageId);
      if (!before) return false;
      const optimistic = resolved ? new Date().toISOString() : null;
      setMessages((prev) => mergeMessages(prev, [{ ...before, resolved_at: optimistic }]));
      try {
        const at = await setMessageResolved(messageId, resolved);
        setActionsOn(true);
        setMessages((prev) => {
          const now = prev.find((m) => m.id === messageId);
          return now ? mergeMessages(prev, [{ ...now, resolved_at: at }]) : prev;
        });
        return true;
      } catch (e) {
        setMessages((prev) => (prev.some((m) => m.id === messageId) ? mergeMessages(prev, [before]) : prev));
        actionFailed(e);
        return false;
      }
    },
    [actionFailed],
  );

  /** Clears one of my messages for everyone. */
  const clear = useCallback(
    async (messageId: string) => {
      setError(null);
      try {
        await clearRideMessage(messageId);
        setActionsOn(true);
        setMessages((prev) => withoutMessage(prev, messageId));
        return true;
      } catch (e) {
        actionFailed(e);
        return false;
      }
    },
    [actionFailed],
  );

  const sendPoll = useCallback(
    async (question: string, choices: string[]) => {
      if (!rideId) return false;
      setError(null);
      try {
        const row = await sendRidePoll(rideId, question, choices);
        setMessages((prev) => mergeMessages(prev, [row]));
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (pollsNotSwitchedOn(message)) setPollsOn(false);
        setError(friendlyChatError(message));
        return false;
      }
    },
    [rideId],
  );

  /** Votes right away on screen, then saves; puts the old vote back if saving fails. */
  const vote = useCallback(
    async (messageId: string, choice: number, me: string) => {
      if (!rideId) return;
      setError(null);
      const before = votesRef.current;
      setVotes(mergeVotes(before, [{ message_id: messageId, ride_id: rideId, user_id: me, choice, voted_at: new Date().toISOString() }]));
      try {
        await voteOnPoll(messageId, choice);
      } catch (e) {
        setVotes(before);
        const message = e instanceof Error ? e.message : String(e);
        if (pollsNotSwitchedOn(message)) setPollsOn(false);
        setError(friendlyChatError(message));
      }
    },
    [rideId],
  );

  return {
    messages, send, error, reload, votes, vote, sendPoll, pollsOn, pending, retry, discard, resolve, clear, actionsOn,
  };
}
