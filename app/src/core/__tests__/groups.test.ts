import { describe, expect, it } from 'vitest';

import {
  cleanGroupName, groupInviteMessage, groupLink, groupNameProblem, invitedLine, isGroupsNotSwitchedOn, leadersToFollow,
  namesLine, ridersLabel, sortRideMates, togetherLabel,
} from '../groups';

describe('group names', () => {
  it('tidies spaces and checks length', () => {
    expect(cleanGroupName('  Saturday   Crew ')).toBe('Saturday Crew');
    expect(groupNameProblem('   ')).toMatch(/name/);
    expect(groupNameProblem('x'.repeat(61))).toMatch(/60/);
    expect(groupNameProblem('Saturday Crew')).toBeNull();
  });
});

describe('namesLine', () => {
  it('reads naturally for any size', () => {
    expect(namesLine([])).toBe('Just you so far');
    expect(namesLine(['Finn'])).toBe('Finn');
    expect(namesLine(['Finn', 'Hana'])).toBe('Finn and Hana');
    expect(namesLine(['Finn', 'Hana', 'Gus'])).toBe('Finn, Hana and Gus');
    expect(namesLine(['Finn', 'Hana', 'Gus', 'Ivy', 'Jo'])).toBe('Finn, Hana and 3 more');
  });
  it('shows Rider for people without a name', () => {
    expect(namesLine(['', null])).toBe('Rider and Rider');
  });
});

describe('labels', () => {
  it('counts riders and rides', () => {
    expect(ridersLabel(1)).toBe('1 Rider');
    expect(ridersLabel(8)).toBe('8 Riders');
    expect(togetherLabel(1)).toBe('1 Ride Together');
    expect(togetherLabel(4)).toBe('4 Rides Together');
  });
  it('says what an invite did', () => {
    expect(invitedLine(0, 'Crew')).toMatch(/already/);
    expect(invitedLine(1, 'Crew')).toMatch(/^Invited 1 rider from Crew/);
    expect(invitedLine(7, 'Crew')).toMatch(/^Invited 7 riders/);
  });
});

describe('group link', () => {
  it('builds the web link and message', () => {
    expect(groupLink('https://onmylead.com/', 'ABC123')).toBe('https://onmylead.com/g/ABC123');
    expect(groupLink('', 'ABC123')).toBeNull();
    expect(groupInviteMessage('Crew', 'ABC123', 'https://onmylead.com/g/ABC123')).toContain('Open: https://onmylead.com/g/ABC123');
    expect(groupInviteMessage('Crew', 'ABC123', null)).toContain('Group code: ABC123');
  });
});

describe('sortRideMates', () => {
  it('puts the people you ride with most first', () => {
    const sorted = sortRideMates([
      { id: 'a', name: 'Ann', ridesTogether: 1, lastRideAt: '2026-10-01' },
      { id: 'b', name: 'Bo', ridesTogether: 3, lastRideAt: '2026-09-01' },
      { id: 'c', name: 'Cy', ridesTogether: 1, lastRideAt: '2026-10-05' },
      { id: 'd', name: 'Al', ridesTogether: 1, lastRideAt: '2026-10-05' },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('isGroupsNotSwitchedOn', () => {
  it('spots a database without riding groups', () => {
    expect(isGroupsNotSwitchedOn('relation "riding_groups" does not exist')).toBe(true);
    expect(isGroupsNotSwitchedOn('Could not find the function public.invite_group_to_ride(p_group, p_ride) in the schema cache')).toBe(true);
    expect(isGroupsNotSwitchedOn('x', 'PGRST205')).toBe(true);
    expect(isGroupsNotSwitchedOn('only the ride\'s organizers can invite a group')).toBe(false);
    expect(isGroupsNotSwitchedOn(null)).toBe(false);
  });
});

describe('leadersToFollow', () => {
  it('lists the organizer and leaders once, without you', () => {
    expect(leadersToFollow('org', ['lead', 'org'], 'me')).toEqual(['org', 'lead']);
    expect(leadersToFollow('org', ['lead'], 'org')).toEqual(['lead']);
  });
});
