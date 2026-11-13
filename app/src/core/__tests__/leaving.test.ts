import { describe, expect, it } from 'vitest';

import {
  friendlyLeaveError, handOffAndLeavePrompt, handOffCandidates, LEAVE_LABEL, leadsRide, leaveAloneCancelPrompt,
  leaveConfirm, leaveKind, spotLine,
} from '../leaving';

const m = (user_id: string, status: string, role = 'rider', name?: string) => ({
  user_id, status, role, profiles: name ? { display_name: name } : null,
});

describe('leaveKind', () => {
  const members = [m('org', 'joined', 'organizer'), m('a', 'joined'), m('p', 'pending'), m('w', 'waitlisted'), m('i', 'invited'), m('x', 'cancelled')];

  it('lets a joined rider leave, in any ride state', () => {
    expect(leaveKind(members, 'org', 'a', 'scheduled')).toBe('leave');
    expect(leaveKind(members, 'org', 'a', 'live')).toBe('leave');
    expect(leaveKind(members, 'org', 'a', 'ended')).toBe('leave');
  });

  it('lets a pending or waitlisted rider withdraw before the ride is over', () => {
    expect(leaveKind(members, 'org', 'p', 'scheduled')).toBe('withdraw');
    expect(leaveKind(members, 'org', 'w', 'live')).toBe('withdraw');
    expect(leaveKind(members, 'org', 'w', 'ended')).toBe('none');
  });

  it('lets an invited rider decline', () => {
    expect(leaveKind(members, 'org', 'i', 'scheduled')).toBe('decline');
    expect(leaveKind(members, 'org', 'i', 'cancelled')).toBe('none');
  });

  it('has nothing for someone not on the ride, already gone, or signed out', () => {
    expect(leaveKind(members, 'org', 'x', 'scheduled')).toBe('none');
    expect(leaveKind(members, 'org', 'stranger', 'scheduled')).toBe('none');
    expect(leaveKind(members, 'org', null, 'scheduled')).toBe('none');
  });

  it('makes the organizer hand the ride over when someone else has joined', () => {
    expect(leaveKind(members, 'org', 'org', 'live')).toBe('handOff');
  });

  it('makes a lone organizer cancel instead (pending and waitlisted riders cannot take over)', () => {
    const alone = [m('org', 'joined', 'organizer'), m('p', 'pending'), m('w', 'waitlisted')];
    expect(leaveKind(alone, 'org', 'org', 'scheduled')).toBe('cancel');
  });

  it('gives the organizer of a finished ride nothing to leave', () => {
    expect(leaveKind(members, 'org', 'org', 'ended')).toBe('none');
    expect(leaveKind(members, 'org', 'org', 'cancelled')).toBe('none');
  });

  it('labels every kind in Title Case', () => {
    expect(LEAVE_LABEL.leave).toBe('Leave Ride');
    expect(LEAVE_LABEL.withdraw).toBe('Withdraw');
    expect(LEAVE_LABEL.handOff).toBe('Leave Ride');
  });
});

describe('handOffCandidates', () => {
  it('lists joined riders other than me, leaders and co-organizers first, then by name', () => {
    const list = handOffCandidates(
      [
        m('org', 'joined', 'organizer', 'Org'),
        m('z', 'joined', 'rider', 'Zed'),
        m('b', 'joined', 'rider', 'Bea'),
        m('co', 'joined', 'co_organizer', 'Cody'),
        m('l', 'joined', 'leader', 'Lee'),
        m('p', 'pending', 'rider', 'Pat'),
      ],
      'org',
    );
    expect(list.map((x) => x.user_id)).toEqual(['l', 'co', 'b', 'z']);
  });
});

describe('leadsRide', () => {
  it('is the organizer unless someone was given the lead', () => {
    expect(leadsRide([m('org', 'joined', 'organizer')], 'org', 'org')).toBe(true);
    expect(leadsRide([m('org', 'joined', 'organizer'), m('l', 'joined', 'leader')], 'org', 'l')).toBe(true);
    expect(leadsRide([m('org', 'joined', 'organizer'), m('l', 'joined', 'leader')], 'org', 'org')).toBe(false);
  });
});

describe('prompts', () => {
  it('tells a live rider their sharing stops and they can rejoin', () => {
    const p = leaveConfirm('leave', 'Moab Loop', 'live');
    expect(p.title).toBe('Leave Moab Loop?');
    expect(p.message).toMatch(/stop sharing your location/);
    expect(p.confirm).toBe('Leave Ride');
  });

  it('mentions sharing for a scheduled ride only when this phone is sharing', () => {
    expect(leaveConfirm('leave', 'R', 'scheduled').message).not.toMatch(/sharing/);
    expect(leaveConfirm('leave', 'R', 'scheduled', { sharing: true }).message).toMatch(/location sharing for this ride stops/);
  });

  it('tells a leader the lead goes back to the organizer', () => {
    expect(leaveConfirm('leave', 'R', 'live', { leads: true }).message).toMatch(/lead goes back to the organizer/);
  });

  it('keeps the past-ride wording short', () => {
    expect(leaveConfirm('leave', 'R', 'ended', { leads: true }).message).toBe('It’s removed from your Past Rides.');
  });

  it('words withdraw for a request and for the waitlist', () => {
    expect(leaveConfirm('withdraw', 'R', 'scheduled').title).toBe('Withdraw Your Request?');
    expect(leaveConfirm('withdraw', 'R', 'scheduled', { waitlisted: true }).title).toBe('Leave the Waitlist?');
  });

  it('declines an invite', () => {
    expect(leaveConfirm('decline', 'R', 'scheduled').confirm).toBe('Decline');
  });

  it('confirms the hand-off and leaving in one step', () => {
    const p = handOffAndLeavePrompt('Moab Loop', 'Sam');
    expect(p.title).toBe('Give Moab Loop to Sam?');
    expect(p.message).toMatch(/Sam becomes the organizer and leader, and you leave/);
    expect(p.confirm).toBe('Give Ride and Leave');
  });

  it('explains a lone organizer cancels, and counts who hears about it', () => {
    expect(leaveAloneCancelPrompt('R', 0).message).toMatch(/^Nobody else has joined/);
    expect(leaveAloneCancelPrompt('R', 2).message).toMatch(/2 riders on this ride will get a notification/);
    expect(leaveAloneCancelPrompt('R', 1, false).message).toMatch(/^1 rider on this ride/);
  });
});

describe('friendlyLeaveError', () => {
  it('turns server errors into next steps', () => {
    expect(friendlyLeaveError('they need to have joined the ride first')).toMatch(/Pick someone else/);
    expect(friendlyLeaveError('this ride is over')).toBe('This ride is already over.');
    expect(friendlyLeaveError('TypeError: Network request failed')).toMatch(/No service/);
    expect(friendlyLeaveError('something odd')).toBe('something odd');
  });
});

describe('spotLine (Your Spot at the top of the ride page)', () => {
  it('tells a joined rider where they stand in every ride state', () => {
    expect(spotLine('leave', 'scheduled')?.title).toBe('You’re Going');
    expect(spotLine('leave', 'live')?.title).toBe('You’re Riding');
    expect(spotLine('leave', 'ended')?.title).toBe('You Rode This One');
    expect(spotLine('leave', 'cancelled')?.title).toBe('Still in Your Rides');
    expect(spotLine('leave', 'scheduled')?.detail).toMatch(/leave any time/);
    expect(spotLine('leave', 'scheduled')?.tone).toBe('in');
  });

  it('shows a request or waitlist spot as waiting', () => {
    expect(spotLine('withdraw', 'scheduled')).toMatchObject({ title: 'Request Sent', tone: 'waiting' });
    expect(spotLine('withdraw', 'live', { waitlisted: true })).toMatchObject({ title: 'You’re on the Waitlist', tone: 'waiting' });
  });

  it('warns the organizer what leaving does', () => {
    expect(spotLine('handOff', 'scheduled')?.detail).toMatch(/hands the ride/);
    expect(spotLine('cancel', 'live')?.detail).toMatch(/cancels the ride/);
  });

  it('shows nothing when there is nothing to leave, or for an invite (it has its own card)', () => {
    expect(spotLine('none', 'scheduled')).toBeNull();
    expect(spotLine('decline', 'scheduled')).toBeNull();
  });
});
