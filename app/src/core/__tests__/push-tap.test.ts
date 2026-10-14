import { describe, expect, it } from 'vitest';

import { tapData, tapTarget } from '../push-tap';

const status = { type: 'status', rideId: 'ride-1', inviteCode: 'ABC123', status: 'help' };
const chat = { type: 'message', rideId: 'ride-1', inviteCode: 'ABC123', messageId: 'm1' };

describe('push tap data', () => {
  it('reads the object as iPhone and Android in Expo format deliver it', () => {
    expect(tapData(status)).toEqual(status);
  });

  it('reads raw Android FCM data with the object as a JSON string', () => {
    const raw = { title: 'Need Help', message: 'Sam needs help', body: JSON.stringify(status), channelId: 'ride-alerts' };
    expect(tapData(raw)).toEqual(status);
    expect(tapData({ dataString: JSON.stringify(chat) })).toEqual(chat);
    expect(tapData(JSON.stringify(chat))).toEqual(chat);
  });

  it('ignores junk', () => {
    expect(tapData(undefined)).toBeUndefined();
    expect(tapData(null)).toBeUndefined();
    expect(tapData([1])).toBeUndefined();
    expect(tapData({ body: 'not json' })).toEqual({ body: 'not json' });
    expect(tapTarget(tapData({ body: '{broken' }))).toBeNull();
  });
});

describe('push tap target', () => {
  it('opens Ride Mode for status taps, quick replies, cancellations and a ride going live', () => {
    expect(tapTarget(status)).toBe('/ride/ride-1/live');
    expect(tapTarget({ type: 'cancelled', rideId: 'ride-1', itemId: 'i1' })).toBe('/ride/ride-1/live');
    expect(tapTarget({ ...chat, itemId: 'i1' })).toBe('/ride/ride-1/live');
    expect(tapTarget({ type: 'ride', change: 'live', rideId: 'ride-1', inviteCode: 'ABC123' })).toBe('/ride/ride-1/live');
  });

  it('opens the ride chat for a chat message and the ride page for other ride news', () => {
    expect(tapTarget(chat)).toBe('/r/ABC123?section=chat');
    expect(tapTarget({ type: 'ride', change: 'moved', rideId: 'ride-1', inviteCode: 'ABC123' })).toBe('/r/ABC123');
    expect(tapTarget({ type: 'member', change: 'joined', rideId: 'ride-1', inviteCode: 'ABC123' })).toBe('/r/ABC123');
    expect(tapTarget({ type: 'reminder', rideId: 'ride-1', inviteCode: 'ABC123' })).toBe('/r/ABC123');
  });

  it('opens a riding group chat for group messages', () => {
    expect(tapTarget({ type: 'group_message', groupId: 'g1' })).toBe('/groups/g1/chat');
  });

  it('routes the same from every delivery shape', () => {
    const android = { title: 'Ride Chat', message: 'Hi', body: JSON.stringify(chat) };
    expect(tapTarget(tapData(android))).toBe(tapTarget(tapData(chat)));
  });

  it('stays put when the push is not about a ride or group', () => {
    expect(tapTarget(undefined)).toBeNull();
    expect(tapTarget({ type: 'trial' })).toBeNull();
    expect(tapTarget({ type: 'status', rideId: '' })).toBeNull();
    expect(tapTarget({ type: 'group_message', groupId: 5 })).toBeNull();
  });
});
