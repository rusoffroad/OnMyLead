import { describe, expect, it } from 'vitest';

import {
  dayLabel, friendlyGroupChatError, groupChatNotSwitchedOn, mergeGroupMessages, previewLine, reconcileGroupMessages,
  ridesTalkedAbout, rideWhen, talkableRides, threadRows, unreadLabel, type ChatRide, type GroupMessage,
} from '../group-chat';

const at = (iso: string) => iso;
const msg = (id: string, user: string, created: string, ride: string | null = null): GroupMessage => ({
  id, group_id: 'g', user_id: user, body: id, ride_id: ride, sent_at: created, created_at: created,
});
const ride = (id: string, status: string, meet: string): ChatRide => ({ id, name: id, meet_at: meet, status, invite_code: id.toUpperCase() });
const NOW = Date.parse('2026-10-14T18:00:00');

describe('group chat', () => {
  it('merges without duplicates, oldest first', () => {
    const a = msg('a', 'u1', '2026-10-14T10:00:00Z');
    const b = msg('b', 'u2', '2026-10-14T10:01:00Z');
    expect(mergeGroupMessages([b], [a, b]).map((m) => m.id)).toEqual(['a', 'b']);
    expect(mergeGroupMessages([a, b], [msg('c', 'u1', '2026-10-14T10:02:00Z')], 2).map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('drops cleared messages on reload but keeps newer ones', () => {
    const a = msg('a', 'u1', '2026-10-14T10:00:00Z');
    const b = msg('b', 'u1', '2026-10-14T10:01:00Z');
    const c = msg('c', 'u1', '2026-10-14T10:05:00Z');
    expect(reconcileGroupMessages([a, b, c], [a, c], 100).map((m) => m.id)).toEqual(['a', 'c']);
    expect(reconcileGroupMessages([a], [], 100)).toEqual([]);
  });

  it('labels days', () => {
    expect(dayLabel(at('2026-10-14T08:00:00'), NOW)).toBe('Today');
    expect(dayLabel(at('2026-10-13T23:00:00'), NOW)).toBe('Yesterday');
    expect(dayLabel(at('2026-10-10T12:00:00'), NOW)).toBe('Sat, Oct 10');
    expect(dayLabel(at('2025-10-10T12:00:00'), NOW)).toMatch(/2025/);
  });

  it('groups one person’s messages into runs, split by day, gap, sender and ride', () => {
    const rows = threadRows([
      msg('1', 'u1', '2026-10-13T20:00:00'),
      msg('2', 'u1', '2026-10-14T08:00:00'),
      msg('3', 'u1', '2026-10-14T08:02:00'),
      msg('4', 'u2', '2026-10-14T08:03:00'),
      msg('5', 'u2', '2026-10-14T08:20:00'),
      msg('6', 'u2', '2026-10-14T08:21:00', 'r'),
    ], NOW);
    expect(rows.map((r) => r.day)).toEqual(['Yesterday', 'Today', null, null, null, null]);
    expect(rows.map((r) => r.firstInRun)).toEqual([true, true, false, true, true, true]);
    expect(rows.map((r) => r.lastInRun)).toEqual([true, false, true, true, true, true]);
    expect(rows.map((r) => r.newRide)).toEqual([false, false, false, false, false, true]);
    const same = threadRows([msg('a', 'u1', '2026-10-14T08:00:00', 'r'), msg('b', 'u2', '2026-10-14T08:01:00', 'r'), msg('c', 'u2', '2026-10-14T08:02:00')], NOW);
    expect(same.map((r) => r.newRide)).toEqual([true, false, false]);
  });

  it('describes when a ride is', () => {
    expect(rideWhen(ride('a', 'live', '2026-10-14T08:00:00'), NOW)).toBe('Riding Now');
    expect(rideWhen(ride('a', 'ended', '2026-10-01T08:00:00'), NOW)).toBe('Ride Over');
    expect(rideWhen(ride('a', 'cancelled', '2026-10-20T08:00:00'), NOW)).toBe('Cancelled');
    expect(rideWhen(ride('a', 'scheduled', '2026-10-17T08:00:00'), NOW)).toBe('Sat, Oct 17, 8:00 AM');
  });

  it('offers live, then upcoming, then recent past rides', () => {
    const out = talkableRides([
      ride('old', 'ended', '2026-08-01T08:00:00'),
      ride('past', 'ended', '2026-10-10T08:00:00'),
      ride('later', 'scheduled', '2026-10-30T08:00:00'),
      ride('soon', 'scheduled', '2026-10-17T08:00:00'),
      ride('now', 'live', '2026-10-14T08:00:00'),
      ride('off', 'cancelled', '2026-10-18T08:00:00'),
    ], NOW);
    expect(out.map((r) => r.id)).toEqual(['now', 'soon', 'later', 'past']);
  });

  it('lists rides talked about, newest mention first, once each', () => {
    const rides = [ride('a', 'scheduled', '2026-10-17T08:00:00'), ride('b', 'ended', '2026-10-10T08:00:00')];
    const ms = [msg('1', 'u', '2026-10-14T08:00:00', 'a'), msg('2', 'u', '2026-10-14T08:01:00', 'b'), msg('3', 'u', '2026-10-14T08:02:00', 'a'), msg('4', 'u', '2026-10-14T08:03:00', 'gone')];
    expect(ridesTalkedAbout(ms, rides).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('labels unread and previews', () => {
    expect(unreadLabel(0)).toBeNull();
    expect(unreadLabel(3)).toBe('3 New');
    expect(unreadLabel(140)).toBe('99+ New');
    expect(previewLine({ last_body: 'Hi', last_user_id: 'me' }, 'me', () => 'X')).toBe('You: Hi');
    expect(previewLine({ last_body: 'Hi', last_user_id: 'u' }, 'me', () => 'Dusty')).toBe('Dusty: Hi');
    expect(previewLine({ last_body: null, last_user_id: null }, 'me', () => 'X')).toBeNull();
    expect(previewLine({ last_body: 'Hi', last_user_id: 'u' }, 'me', () => 'Dusty', new Set(['u']))).toBeNull();
    expect(previewLine({ last_body: 'Hi', last_user_id: 'me' }, 'me', () => 'X', new Set(['me']))).toBe('You: Hi');
  });

  it('knows when the server update is missing', () => {
    expect(groupChatNotSwitchedOn('relation "public.group_messages" does not exist')).toBe(true);
    expect(groupChatNotSwitchedOn('Could not find the function public.my_group_chats without parameters in the schema cache')).toBe(true);
    expect(groupChatNotSwitchedOn('x', 'PGRST205')).toBe(true);
    expect(groupChatNotSwitchedOn('new row violates row-level security policy for table "group_messages"')).toBe(false);
    expect(friendlyGroupChatError('new row violates row-level security policy for table "group_messages"')).toMatch(/Only riders in this group/);
    expect(friendlyGroupChatError('slow down: too many messages')).toMatch(/Wait a minute/);
  });
});
