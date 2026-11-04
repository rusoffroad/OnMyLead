import { describe, expect, it } from 'vitest';

import { inboxLook, notificationKey } from '../inbox';
import { tapTarget } from '../push-tap';

// "Lou added a new waypoint: Fuel Stop" (migration 20261104150000_waypoint_alerts.sql).
describe('new shared waypoint notifications', () => {
  const data = { type: 'waypoint', rideId: 'r1', inviteCode: 'ABC', waypointId: 'w1', collapseId: 'waypoint:w1' };

  it('opens Ride Mode with that waypoint', () => {
    expect(tapTarget(data)).toBe('/ride/r1/live?waypoint=w1');
    expect(tapTarget({ type: 'waypoint', rideId: 'r1' })).toBe('/ride/r1/live');
  });

  it('shows a pin in the inbox', () => {
    expect(inboxLook({ kind: 'waypoint', data })).toEqual({ icon: 'pin', tone: 'ride' });
  });

  it('matches its own inbox row only', () => {
    expect(notificationKey(data)).toBe('waypoint:w1');
    expect(notificationKey({ ...data, waypointId: 'w2' })).not.toBe(notificationKey(data));
  });
});
