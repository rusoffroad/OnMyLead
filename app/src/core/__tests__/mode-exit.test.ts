import { describe, expect, it } from 'vitest';

import { backPress, canEndRideHere, endRidePrompt, EXIT_LABEL, exitTarget, mapExitPrompt, rideExitAsks, rideExitPrompt } from '../mode-exit';

describe('Exit Ride Mode and Map Mode', () => {
  it('goes back where the rider came from, or Home when opened from a notification or link', () => {
    expect(exitTarget(true)).toBe('back');
    expect(exitTarget(false)).toBe('home');
    expect(EXIT_LABEL).toBe('Exit');
  });

  it('Ride Mode only asks while sharing, and never takes the rider off the ride', () => {
    expect(rideExitAsks(false)).toBe(false);
    expect(rideExitAsks(true)).toBe(true);
    const p = rideExitPrompt('Moab Saturday');
    expect(p.title).toBe('Exit Ride Mode?');
    expect(p.message).toContain('You stay on Moab Saturday');
    expect([p.keep, p.stop, p.stay]).toEqual(['Exit and Keep Sharing', 'Stop Sharing and Exit', 'Stay in Ride Mode']);
  });

  it('Exit offers Leave Ride to a rider who can leave, but Android back stays quick', () => {
    expect(rideExitAsks(false, true)).toBe(true);
    expect(rideExitAsks(false, true, true)).toBe(false);
    expect(rideExitAsks(true, true, true)).toBe(true);
    expect(rideExitAsks(false, false)).toBe(false);
    const p = rideExitPrompt('Moab Saturday', false);
    expect(p.message).toBe('You stay on Moab Saturday. Come back any time from Home or the ride page.');
    expect(p.keep).toBe('Exit Ride Mode');
    expect(p.stop).toBeNull();
    expect(p.done).toMatch(/Leaving takes you off it/);
  });

  it('offers End Ride for Everyone to the organizer and co-organizers of a live ride only', () => {
    const live = { status: 'live', organizer_id: 'org' };
    expect(canEndRideHere(live, 'org', null)).toBe(true);
    expect(canEndRideHere(live, 'co', { role: 'co_organizer' })).toBe(true);
    expect(canEndRideHere(live, 'lead', { role: 'leader' })).toBe(false);
    expect(canEndRideHere(live, 'r', { role: 'rider' })).toBe(false);
    expect(canEndRideHere(live, null, null)).toBe(false);
    for (const status of ['scheduled', 'ended', 'cancelled']) expect(canEndRideHere({ status, organizer_id: 'org' }, 'org', null)).toBe(false);
    expect(canEndRideHere(null, 'org', null)).toBe(false);
  });

  it('End Ride asks once and says what it does to the group', () => {
    const e = endRidePrompt('Moab Saturday');
    expect(e.label).toBe('End Ride for Everyone');
    expect(e.title).toBe('End the Ride for Everyone?');
    expect(e.message).toContain('Moab Saturday ends for the whole group');
    expect([e.confirm, e.stay]).toEqual(['End Ride', 'Keep Riding']);
    expect(rideExitPrompt('Moab Saturday', true, true).done).toMatch(/^Ride over\? End it for everyone/);
    expect(rideExitPrompt('Moab Saturday', true).done).toMatch(/Leaving takes you off it/);
  });

  it('Map Mode only asks while a recording is running', () => {
    expect(mapExitPrompt(null)).toBeNull();
    expect(mapExitPrompt({ paused: true })).toBeNull();
    const p = mapExitPrompt({ paused: false });
    expect(p?.confirm).toBe('Pause and Exit');
    expect(p?.stay).toBe('Stay in Map Mode');
  });

  it('Android back closes Full Map, then the search, then exits', () => {
    expect(backPress({ fullMap: true, searching: true })).toBe('close_full_map');
    expect(backPress({ fullMap: false, searching: true })).toBe('close_search');
    expect(backPress({ fullMap: false })).toBe('exit');
  });
});
