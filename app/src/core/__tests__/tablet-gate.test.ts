import { describe, expect, it } from 'vitest';

import { tabletGateCovers } from '../tablet-gate';

const free = { bigScreen: true, signedIn: true, allowed: false };

describe('tablets and the website on Free', () => {
  it('covers the app on a tablet or the website for a signed-in Free rider', () => {
    expect(tabletGateCovers({ ...free, path: '/' })).toBe(true);
    expect(tabletGateCovers({ ...free, path: '/nav' })).toBe(true);
    expect(tabletGateCovers({ ...free, path: '/ride/new' })).toBe(true);
    expect(tabletGateCovers({ ...free, path: '/ride/abc/route' })).toBe(true);
  });

  it('never blocks joining a ride or following the leader', () => {
    expect(tabletGateCovers({ ...free, path: '/r/MOAB-2026' })).toBe(false);
    expect(tabletGateCovers({ ...free, path: '/ride/abc/live' })).toBe(false);
    expect(tabletGateCovers({ ...free, path: '/ride/abc/waypoints' })).toBe(false);
    expect(tabletGateCovers({ ...free, path: '/f/token' })).toBe(false);
    expect(tabletGateCovers({ ...free, path: '/e/RALLY' })).toBe(false);
  });

  it('keeps buying Pro, the account and the legal pages open', () => {
    for (const p of ['/pro', '/subscription', '/profile', '/sign-in', '/privacy', '/terms', '/rider-agreement', '/admin', '/admin/users']) {
      expect(tabletGateCovers({ ...free, path: p })).toBe(false);
    }
  });

  it('leaves phones, signed-out visitors and Pro alone', () => {
    expect(tabletGateCovers({ ...free, bigScreen: false, path: '/' })).toBe(false);
    expect(tabletGateCovers({ ...free, signedIn: false, path: '/' })).toBe(false);
    expect(tabletGateCovers({ ...free, allowed: true, path: '/' })).toBe(false);
  });
});
