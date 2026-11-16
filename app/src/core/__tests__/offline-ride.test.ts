import { describe, expect, it } from 'vitest';

import { dropQueuedRideAction, leaveWorksOffline, leftHere, QUEUED_RIDE_ACTION_MS, startedHere, startStillWanted } from '../offline-ride';

describe('Start Ride Mode with no service', () => {
  it('treats a ride waiting to start as live on this phone', () => {
    expect(startedHere({ id: 'r', status: 'scheduled' as const })).toEqual({ id: 'r', status: 'live' });
  });

  it('leaves a ride that is already live, over or unknown as it is', () => {
    expect(startedHere({ id: 'r', status: 'live' as const })?.status).toBe('live');
    expect(startedHere({ id: 'r', status: 'ended' as const })?.status).toBe('ended');
    expect(startedHere({ id: 'r', status: 'cancelled' as const })?.status).toBe('cancelled');
    expect(startedHere(null)).toBeNull();
  });

  it('only starts a ride on the server that is still waiting to start', () => {
    expect(startStillWanted('scheduled')).toBe(true);
    // Someone else started, ended or cancelled it meanwhile: a late start never brings it back.
    expect(startStillWanted('live')).toBe(false);
    expect(startStillWanted('ended')).toBe(false);
    expect(startStillWanted('cancelled')).toBe(false);
    expect(startStillWanted(null)).toBe(false);
    expect(startStillWanted(undefined)).toBe(false);
  });
});

describe('Leave Ride with no service', () => {
  it('takes only this rider off the ride on this phone', () => {
    const members = [
      { user_id: 'me', status: 'joined', role: 'rider' },
      { user_id: 'a', status: 'joined', role: 'leader' },
    ];
    expect(leftHere(members, 'me')).toEqual([
      { user_id: 'me', status: 'cancelled', role: 'rider' },
      { user_id: 'a', status: 'joined', role: 'leader' },
    ]);
    expect(members[0].status).toBe('joined');
  });

  it('waits for signal only for leaving yourself; handing over and cancelling still need service', () => {
    expect(leaveWorksOffline('leave')).toBe(true);
    expect(leaveWorksOffline('withdraw')).toBe(true);
    expect(leaveWorksOffline('handOff')).toBe(false);
    expect(leaveWorksOffline('cancel')).toBe(false);
    expect(leaveWorksOffline('decline')).toBe(false);
    expect(leaveWorksOffline('none')).toBe(false);
  });
});

describe('queued start or leave', () => {
  it('keeps trying while there is no answer, for a day', () => {
    expect(dropQueuedRideAction('no_answer', 60_000)).toBe(false);
    expect(dropQueuedRideAction('no_answer', QUEUED_RIDE_ACTION_MS - 1)).toBe(false);
    expect(dropQueuedRideAction('no_answer', QUEUED_RIDE_ACTION_MS + 1)).toBe(true);
  });

  it('is done once the server took it or turned it down', () => {
    expect(dropQueuedRideAction('sent', 0)).toBe(true);
    expect(dropQueuedRideAction('refused', 0)).toBe(true);
  });
});
