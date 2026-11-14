import { describe, expect, it } from 'vitest';

import {
  atSpot, defaultWhen, FIRST_RIDE_DEFAULTS, nearestQuickTime, parseRideDefaults, quickTimes, quickTimesOn, rememberSpot, timeOnDay, type RecentSpot,
} from '../quick-ride';

const at = (h: number, m: number) => new Date(2026, 10, 13, h, m, 0, 0);
const maverik: RecentSpot = { lat: 38.5733, lng: -109.5498, label: 'Maverik, Main St', state: 'UT' };
const gate: RecentSpot = { lat: 38.5755, lng: -109.5227, label: 'Sand Flats Gate', state: 'UT' };

describe('the day and time Create a Ride opens on', () => {
  it('is today at the next quarter hour', () => {
    expect(defaultWhen(at(20, 14))).toEqual({ day: new Date(2026, 10, 13), minutes: 20 * 60 + 15 });
    expect(defaultWhen(at(8, 1)).minutes).toBe(8 * 60 + 15);
  });

  it('moves on from a time that is already here', () => {
    expect(defaultWhen(at(20, 15)).minutes).toBe(20 * 60 + 30);
    expect(defaultWhen(at(9, 0)).minutes).toBe(9 * 60 + 15);
  });

  it('late at night is tomorrow morning', () => {
    expect(defaultWhen(at(23, 50))).toEqual({ day: new Date(2026, 10, 14), minutes: 8 * 60 });
    expect(defaultWhen(at(23, 44))).toEqual({ day: new Date(2026, 10, 13), minutes: 23 * 60 + 45 });
  });
});

describe('the time list', () => {
  it('offers every quarter hour of the day', () => {
    const all = quickTimes();
    expect(all).toHaveLength(96);
    expect(all[0]).toBe(0);
    expect(all[all.length - 1]).toBe(23 * 60 + 45);
  });

  it('leaves out times that have already passed today', () => {
    const today = quickTimesOn(new Date(2026, 10, 13), at(21, 18));
    expect(today[0]).toBe(21 * 60 + 30);
    expect(today).toHaveLength(10);
    expect(quickTimesOn(new Date(2026, 10, 13), at(21, 15))[0]).toBe(21 * 60 + 30);
    expect(quickTimesOn(new Date(2026, 10, 13), at(23, 50))).toEqual([]);
  });

  it('offers the whole day for any other day', () => {
    expect(quickTimesOn(new Date(2026, 10, 14), at(21, 18))).toHaveLength(96);
  });

  it('moves a passed time on when the ride moves to today', () => {
    const today = new Date(2026, 10, 13);
    expect(timeOnDay(today, 8 * 60, at(21, 18))).toBe(21 * 60 + 30);
    expect(timeOnDay(today, 22 * 60, at(21, 18))).toBe(22 * 60);
    expect(timeOnDay(new Date(2026, 10, 14), 8 * 60, at(21, 18))).toBe(8 * 60);
    expect(timeOnDay(today, null, at(21, 18))).toBeNull();
    expect(timeOnDay(today, 8 * 60, at(23, 50))).toBeNull();
  });

  it('marks the nearest quarter hour to a time picked elsewhere', () => {
    expect(nearestQuickTime(8 * 60 + 5)).toBe(8 * 60);
    expect(nearestQuickTime(8 * 60 + 10)).toBe(8 * 60 + 15);
    expect(nearestQuickTime(23 * 60 + 55)).toBe(23 * 60 + 45);
  });
});

describe('what the form remembers', () => {
  it('starts a first ride private, with nothing remembered', () => {
    expect(parseRideDefaults(null)).toEqual(FIRST_RIDE_DEFAULTS);
    expect(parseRideDefaults('{oops')).toEqual(FIRST_RIDE_DEFAULTS);
    expect(parseRideDefaults('"public"')).toEqual(FIRST_RIDE_DEFAULTS);
    expect(FIRST_RIDE_DEFAULTS.kind).toBe('private');
  });

  it('reads back the last ride and drops junk', () => {
    const saved = JSON.stringify({
      kind: 'public', vehicleTypes: ['Jeep/4x4', 7, ''], joinPolicy: 'approval',
      spots: [maverik, { lat: 999, lng: 0, label: 'Nowhere' }, { lat: 1, lng: 1, label: ' ' }, gate],
    });
    expect(parseRideDefaults(saved)).toEqual({ kind: 'public', vehicleTypes: ['Jeep/4x4'], joinPolicy: 'approval', spots: [maverik, gate] });
    expect(parseRideDefaults(JSON.stringify({ kind: 'unlisted', joinPolicy: 'invite_only', vehicleTypes: [] }))).toEqual(FIRST_RIDE_DEFAULTS);
  });

  it('keeps the newest three meeting points, each once', () => {
    const a = rememberSpot([], maverik);
    const b = rememberSpot(a, gate);
    expect(b.map((s) => s.label)).toEqual(['Sand Flats Gate', 'Maverik, Main St']);
    // The same gas station again, a few meters off and typed differently: it moves to the front.
    const c = rememberSpot(b, { ...maverik, lat: maverik.lat + 0.0002, label: 'Maverik' });
    expect(c.map((s) => s.label)).toEqual(['Maverik', 'Sand Flats Gate']);
    // The same name at a new pin replaces the old one.
    expect(rememberSpot(c, { ...gate, lat: 38.6 })).toHaveLength(2);
    const d = rememberSpot(rememberSpot(c, { lat: 39, lng: -110, label: 'Trailhead', state: 'UT' }), { lat: 40, lng: -111, label: 'Shop', state: 'UT' });
    expect(d.map((s) => s.label)).toEqual(['Shop', 'Trailhead', 'Maverik']);
  });

  it('does not remember a spot with no name', () => {
    expect(rememberSpot([maverik], { lat: 39, lng: -110, label: '  ', state: null })).toEqual([maverik]);
  });

  it('knows when the meeting point is a remembered spot', () => {
    expect(atSpot({ lat: maverik.lat, lng: maverik.lng }, maverik)).toBe(true);
    expect(atSpot({ lat: gate.lat, lng: gate.lng }, maverik)).toBe(false);
    expect(atSpot(null, maverik)).toBe(false);
  });
});
