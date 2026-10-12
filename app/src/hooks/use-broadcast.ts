import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  BROADCAST_SHOWN_MS, broadcastNotSwitchedOn, CANCELLED_SHOWN_MS, mergeReceipts, toAcknowledge,
  type Broadcast, type Receipt,
} from '@/core/broadcast';
import { ackRideItems, cancelRideItem, myReceipts } from '@/lib/api';
import { flushOutbox, pendingIds, removeFromOutbox } from '@/lib/outbox';
import { newChannel, supabase } from '@/lib/supabase';

const buzz = (style: 'tap' | 'done' | 'warn') => {
  if (Platform.OS === 'web') return;
  if (style === 'tap') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  else Haptics.notificationAsync(style === 'done' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
};

export const newTapId = () => Crypto.randomUUID();

type Fallback = (b: Broadcast) => Promise<void>;

/**
 * The tap this rider just sent from Ride Mode (a status button or a quick reply): it shows at
 * once, then who in the group has it, and Cancel takes it back.
 *
 * `send` puts the card up before anything touches the network, so the button answers the tap
 * right away. `fallback` runs when the database doesn't have the Cancel update yet.
 */
export function useBroadcast(rideId: string, me: string | null | undefined, fallback: Fallback) {
  const [card, setCard] = useState<Broadcast | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  /** False until the database has the receipts update; the card says so instead of guessing. */
  const [receiptsOn, setReceiptsOn] = useState(true);
  const cardRef = useRef(card);
  useEffect(() => {
    cardRef.current = card;
  }, [card]);
  // Cancel pressed while the first send was still out: cancel as soon as it lands.
  const cancelAfterSend = useRef<string | null>(null);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    fallbackRef.current = fallback;
  });

  const update = useCallback((id: string, patch: Partial<Broadcast>) => {
    setCard((c) => (c && c.id === id ? { ...c, ...patch } : c));
  }, []);

  const doCancel = useCallback(async (b: Broadcast) => {
    update(b.id, { state: 'cancelling' });
    try {
      await cancelRideItem(b.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!broadcastNotSwitchedOn(message)) {
        update(b.id, { state: 'sent' });
        throw e;
      }
      await fallbackRef.current(b);
    }
    buzz('done');
    update(b.id, { state: 'cancelled' });
  }, [update]);

  /** Shows the tap as Sending, runs the send, then Sent or Waiting for Signal. */
  const send = useCallback(
    async (b: Omit<Broadcast, 'state' | 'at'>, run: (id: string) => Promise<boolean>) => {
      buzz('tap');
      cancelAfterSend.current = null;
      setCard({ ...b, state: 'sending', at: new Date().toISOString() });
      const sent = await run(b.id).catch(() => false);
      if (cancelAfterSend.current === b.id) {
        cancelAfterSend.current = null;
        if (sent) await doCancel({ ...b, state: 'sent', at: '' }).catch(() => update(b.id, { state: 'sent' }));
        else {
          await removeFromOutbox(b.id);
          update(b.id, { state: 'cancelled' });
        }
        return sent;
      }
      update(b.id, { state: sent ? 'sent' : 'queued' });
      if (sent) buzz('done');
      return sent;
    },
    [doCancel, update],
  );

  /** Takes the tap back: from the outbox if it never left, else from the group. */
  const cancel = useCallback(async () => {
    const b = cardRef.current;
    if (!b || b.state === 'cancelling' || b.state === 'cancelled') return;
    if (b.state === 'sending') {
      cancelAfterSend.current = b.id;
      update(b.id, { state: 'cancelling' });
      return;
    }
    if (b.state === 'queued' && (await removeFromOutbox(b.id))) {
      buzz('done');
      update(b.id, { state: 'cancelled' });
      return;
    }
    await doCancel(b);
  }, [doCancel, update]);

  /** Waiting for Signal: try everything in the outbox again now. */
  const retry = useCallback(async () => {
    const b = cardRef.current;
    if (!b) return 0;
    update(b.id, { state: 'sending' });
    const sent = await flushOutbox().catch(() => 0);
    const left = await pendingIds().catch(() => [b.id]);
    update(b.id, { state: left.includes(b.id) ? 'queued' : 'sent' });
    return sent;
  }, [update]);

  const dismiss = useCallback(() => setCard(null), []);

  // A queued tap that went out on its own (a refresh flushed the outbox) becomes Sent.
  const checkQueued = useCallback(async () => {
    const b = cardRef.current;
    if (b?.state !== 'queued') return;
    const left = await pendingIds().catch(() => [b.id]);
    if (!left.includes(b.id)) update(b.id, { state: 'sent' });
  }, [update]);

  // Sent cards go away after a while; cancelled ones right after saying so.
  useEffect(() => {
    if (!card || (card.state !== 'sent' && card.state !== 'cancelled')) return;
    const wait = card.state === 'cancelled' ? CANCELLED_SHOWN_MS : Math.max(0, Date.parse(card.at) + BROADCAST_SHOWN_MS - Date.now());
    const t = setTimeout(() => setCard((c) => (c?.id === card.id && c.state === card.state ? null : c)), wait);
    return () => clearTimeout(t);
  }, [card]);

  // Who has it: load once the tap is out, then follow realtime (with a slow poll as a fallback).
  const liveId = card && (card.state === 'sent' || card.state === 'cancelling') ? card.id : null;
  useEffect(() => {
    if (!liveId || !me) return;
    let gone = false;
    const load = () =>
      myReceipts([liveId])
        .then((rows) => {
          if (gone) return;
          setReceiptsOn(true);
          setReceipts((prev) => mergeReceipts(prev, rows));
        })
        .catch((e) => {
          if (!gone && broadcastNotSwitchedOn(e instanceof Error ? e.message : String(e))) setReceiptsOn(false);
        });
    load();
    const onRow = (payload: { new: unknown }) => {
      const r = payload.new as Receipt;
      if (r?.item_id === liveId) setReceipts((prev) => mergeReceipts(prev, [r]));
    };
    const channel = newChannel(`ride-receipts-${liveId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_receipts', filter: `item_id=eq.${liveId}` }, onRow)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_receipts', filter: `item_id=eq.${liveId}` }, onRow)
      .subscribe();
    const poll = setInterval(load, 10_000);
    return () => {
      gone = true;
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [liveId, me]);

  return { card, receipts, receiptsOn, send, cancel, retry, dismiss, checkQueued };
}

/**
 * Tells other riders their taps reached this phone (their card then says Seen by). Pass every
 * tap this screen shows; each one is marked once. Quietly stops if the database doesn't have
 * the receipts update yet.
 */
export function useAcknowledge(
  rideId: string | null | undefined,
  me: string | null | undefined,
  items: { id?: string | null; user_id: string; at: string; cancelled?: boolean }[],
) {
  const done = useRef(new Set<string>());
  const off = useRef(false);
  const key = items.map((i) => i.id ?? '').join(',');
  useEffect(() => {
    if (!rideId || off.current) return;
    const ids = toAcknowledge(items, me, done.current, Date.now());
    if (!ids.length) return;
    for (const id of ids) done.current.add(id);
    ackRideItems(rideId, ids).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      if (broadcastNotSwitchedOn(message)) off.current = true;
      // Try these again next time (no signal); a not-switched-on database stops trying.
      else for (const id of ids) done.current.delete(id);
    });
    // items is read through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, me, key]);
}
