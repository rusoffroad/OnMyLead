import { describe, expect, it } from 'vitest';

import { groupRideDetail, groupRideHref } from '../nav-solo';

describe('Make It a Group Ride', () => {
  it('sends the trail and the rider’s spot to the ride form', () => {
    expect(groupRideHref({ trailId: 'abc', at: { lat: 38.5733112, lng: -109.549812 } })).toBe('/ride/new?trail=abc&lat=38.57331&lng=-109.54981&spot=Meet%20Point');
    expect(groupRideHref({ at: { lat: 1, lng: 2 }, spot: "Hell's Gate & Back" })).toBe("/ride/new?lat=1.00000&lng=2.00000&spot=Hell's%20Gate%20%26%20Back");
  });

  it('gives the ride form a spot it accepts', async () => {
    const { spotFromParams } = await import('../spots');
    const q = Object.fromEntries(new URLSearchParams(groupRideHref({ at: { lat: 38.5, lng: -109.5 }, spot: 'Hell’s Gate' }).split('?')[1]));
    expect(spotFromParams(q)).toMatchObject({ name: 'Hell’s Gate', lat: 38.5, lng: -109.5 });
  });

  it('works without a spot or a trail', () => {
    expect(groupRideHref({ trailId: 'abc' })).toBe('/ride/new?trail=abc');
    expect(groupRideHref({ at: { lat: NaN, lng: 0 } })).toBe('/ride/new');
    expect(groupRideHref({})).toBe('/ride/new');
  });

  it('says what it will use', () => {
    expect(groupRideDetail({ recording: true, following: 'x' })).toMatch(/recording/);
    expect(groupRideDetail({ recording: false, following: 'x' })).toMatch(/^This trail/);
    expect(groupRideDetail({ recording: false, following: null })).toMatch(/^Your spot/);
  });
});
