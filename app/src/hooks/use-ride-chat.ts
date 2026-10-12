import { useCallback, useEffect, useRef, useState } from 'react';

import { friendlyChatError, mergeMessages, type ChatMessage, type MessageAudience, type MessageKind } from '@/core/chat';
import { mergeVotes, pollsNotSwitchedOn, type PollVote } from '@/core/polls';
import { rideMessages, ridePollVotes, sendRideMessage, sendRidePoll, voteOnPoll } from '@/lib/api';
import { newChannel, supabase } from '@/lib/supabase';

/**
 * Ride chat for a joined rider: loads recent messages and keeps them live with a realtime
 * subscription. Pass enabled=false for people who are not on the ride (the database would
 * return nothing for them anyway). Also carries the votes on the ride's quick polls.
 */
export function useRideChat(rideId: string | null | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<PollVote[]>([]);
  /** False until the database has the polls update; the composer says so instead of failing. */
  const [pollsOn, setPollsOn] = useState(true);
  const votesRef = useRef(votes);
  useEffect(() => {
    votesRef.current = votes;
  }, [votes]);

  const reload = useCallback(
    () =>
      rideId && enabled
        ? rideMessages(rideId)
            .then((rows) => setMessages((prev) => mergeMessages(prev, rows)))
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

  const send = useCallback(
    async (body: string, kind: MessageKind = 'chat', audience: MessageAudience = 'everyone') => {
      if (!rideId) return false;
      setError(null);
      try {
        const row = await sendRideMessage(rideId, body, kind, new Date(), audience);
        setMessages((prev) => mergeMessages(prev, [row]));
        return true;
      } catch (e) {
        setError(friendlyChatError(e instanceof Error ? e.message : String(e)));
        return false;
      }
    },
    [rideId],
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

  return { messages, send, error, reload, votes, vote, sendPoll, pollsOn };
}
