import { useCallback, useEffect, useState } from 'react';

import { friendlyChatError, mergeMessages, type ChatMessage, type MessageKind } from '@/core/chat';
import { rideMessages, sendRideMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * Ride chat for a joined rider: loads recent messages and keeps them live with a realtime
 * subscription. Pass enabled=false for people who are not on the ride (the database would
 * return nothing for them anyway).
 */
export function useRideChat(rideId: string | null | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      rideId && enabled
        ? rideMessages(rideId)
            .then((rows) => setMessages((prev) => mergeMessages(prev, rows)))
            .catch((e) => setError(friendlyChatError(e instanceof Error ? e.message : String(e))))
        : Promise.resolve(),
    [rideId, enabled],
  );

  useEffect(() => {
    if (!rideId || !enabled) return;
    reload();
    const channel = supabase
      .channel(`ride-chat-${rideId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` }, (payload) => {
        const m = payload.new as ChatMessage;
        if (!m?.id) return;
        setMessages((prev) => mergeMessages(prev, [m]));
      })
      .subscribe();
    // Fallback for dropped realtime connections.
    const poll = setInterval(reload, 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [rideId, enabled, reload]);

  const send = useCallback(
    async (body: string, kind: MessageKind = 'chat') => {
      if (!rideId) return false;
      setError(null);
      try {
        const row = await sendRideMessage(rideId, body, kind);
        setMessages((prev) => mergeMessages(prev, [row]));
        return true;
      } catch (e) {
        setError(friendlyChatError(e instanceof Error ? e.message : String(e)));
        return false;
      }
    },
    [rideId],
  );

  return { messages, send, error, reload };
}
