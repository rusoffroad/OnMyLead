import { describe, expect, it } from 'vitest';

import { backPress, EXIT_LABEL, exitTarget, mapExitPrompt, rideExitAsks, rideExitPrompt } from '../mode-exit';

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
