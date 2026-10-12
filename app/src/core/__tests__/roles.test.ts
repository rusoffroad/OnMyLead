import { describe, expect, it } from 'vitest';

import { friendlyRoleError, handOffPrompt, rosterActions, tailGunnerId } from '../roles';

const m = (user_id: string, role: string, status = 'joined') => ({ user_id, role, status });
const roster = [m('o', 'organizer'), m('co', 'co_organizer'), m('a', 'rider'), m('b', 'rider'), m('w', 'rider', 'waitlisted')];

describe('tailGunnerId', () => {
  it('finds the joined rider at the rear', () => {
    expect(tailGunnerId([m('o', 'organizer'), m('a', 'sweep')])).toBe('a');
    expect(tailGunnerId([m('o', 'organizer'), m('a', 'sweep', 'cancelled')])).toBeNull();
    expect(tailGunnerId(roster)).toBeNull();
  });
});

describe('rosterActions', () => {
  it('lets the organizer give away the ride, name a leader and a tail gunner', () => {
    expect(rosterActions(roster, 'o', 'o', 'a')).toEqual({ handOff: 'ride', leader: true, tailGunner: true });
  });

  it('lets the organizer give the ride to a co-organizer but not demote them', () => {
    expect(rosterActions(roster, 'o', 'o', 'co')).toEqual({ handOff: 'ride', leader: false, tailGunner: false });
  });

  it('gives a co-organizer roles but not the hand-off', () => {
    expect(rosterActions(roster, 'o', 'co', 'a')).toEqual({ handOff: null, leader: true, tailGunner: true });
  });

  it('lets an assigned Leader hand over the lead and pick the tail gunner', () => {
    const r = [m('o', 'organizer'), m('l', 'leader'), m('a', 'rider')];
    expect(rosterActions(r, 'o', 'l', 'a')).toEqual({ handOff: 'lead', leader: false, tailGunner: true });
    expect(rosterActions(r, 'o', 'l', 'o')).toEqual({ handOff: 'lead', leader: false, tailGunner: false });
  });

  it('gives plain riders nothing', () => {
    expect(rosterActions(roster, 'o', 'a', 'b')).toEqual({ handOff: null, leader: false, tailGunner: false });
  });

  it('gives nothing on yourself, on people who have not joined, or once the ride is over', () => {
    const none = { handOff: null, leader: false, tailGunner: false };
    expect(rosterActions(roster, 'o', 'o', 'o')).toEqual(none);
    expect(rosterActions(roster, 'o', 'o', 'w')).toEqual(none);
    expect(rosterActions(roster, 'o', 'o', 'a', true)).toEqual(none);
    expect(rosterActions(roster, 'o', null, 'a')).toEqual(none);
  });
});

describe('handOffPrompt', () => {
  it('says what happens to each side', () => {
    expect(handOffPrompt('ride', 'Ben').title).toBe('Give the ride to Ben?');
    expect(handOffPrompt('ride', 'Ben').message).toContain('You stay on the ride as a rider');
    expect(handOffPrompt('lead', 'Ben').message).toContain('messages to the leader go to them');
  });
});

describe('friendlyRoleError', () => {
  it('explains a missing migration and the database refusals', () => {
    expect(friendlyRoleError('Could not find the function public.hand_off_ride(p_ride, p_to) in the schema cache')).toContain('switched on yet');
    expect(friendlyRoleError('they need to have joined the ride first')).toBe('They need to join the ride first.');
    expect(friendlyRoleError('the leader and organizers can\'t also be tail gunner')).toContain('pick another rider');
    expect(friendlyRoleError('network down')).toBe('network down');
  });
});
