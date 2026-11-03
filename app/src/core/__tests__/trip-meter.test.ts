import { describe, expect, it } from 'vitest';

import {
  addTripFix, compassPoint, dashHeading, EMPTY_TRIP, headingReadout, movingReadout, parseTrip, TRIP_BREAK_M, type TripFix,
} from '../trip-meter';

// About 111 m per 0.001° of latitude.
const fix = (latOff: number, t: number, over: Partial<TripFix> = {}): TripFix => ({
  lat: 39 + latOff, lng: -105, accuracy: 5, speedMps: 10, timestamp: t * 1000, ...over,
});

const ride = (fixes: TripFix[]) => fixes.reduce(addTripFix, EMPTY_TRIP);

describe('addTripFix', () => {
  it('the first fix only sets the anchor', () => {
    const t = addTripFix(EMPTY_TRIP, fix(0, 0));
    expect(t.distanceM).toBe(0);
    expect(t.last).not.toBeNull();
  });

  it('adds the miles and moving time between fixes', () => {
    const t = ride([fix(0, 0), fix(0.001, 10), fix(0.002, 20)]);
    expect(t.distanceM).toBeGreaterThan(220);
    expect(t.distanceM).toBeLessThan(225);
    expect(t.movingS).toBe(20);
  });

  it('a parked phone wandering a few meters adds nothing', () => {
    const still = { speedMps: 0 };
    const t = ride([fix(0, 0, still), fix(0.00003, 5, still), fix(-0.00002, 10, still), fix(0.00004, 15, still)]);
    expect(t.distanceM).toBe(0);
    expect(t.movingS).toBe(0);
  });

  it('a slow walk still counts once it passes the jitter step', () => {
    const slow = { speedMps: 0.8 };
    const t = ride([fix(0, 0, slow), fix(0.0001, 15, slow)]);
    expect(t.distanceM).toBeGreaterThan(10);
    // Slower than the moving speed: miles count, moving time doesn't.
    expect(t.movingS).toBe(0);
  });

  it('skips poor fixes', () => {
    const t = ride([fix(0, 0), fix(0.001, 10, { accuracy: 80 }), fix(0.002, 20)]);
    expect(t.distanceM).toBeGreaterThan(220);
    expect(t.movingS).toBe(20);
  });

  it('a GPS jump or a long gap restarts from the new spot instead of adding it', () => {
    const jump = ride([fix(0, 0), fix(TRIP_BREAK_M / 111_000 + 0.01, 60)]);
    expect(jump.distanceM).toBe(0);
    const tooFast = ride([fix(0, 0), fix(0.01, 5)]); // 1.1 km in 5 s
    expect(tooFast.distanceM).toBe(0);
  });

  it('a gap with the screen off adds distance but not moving time', () => {
    const t = ride([fix(0, 0), fix(0.005, 300)]);
    expect(t.distanceM).toBeGreaterThan(500);
    expect(t.movingS).toBe(0);
  });

  it('ignores fixes that go back in time or are broken', () => {
    const a = ride([fix(0, 10)]);
    expect(addTripFix(a, fix(0.001, 5))).toBe(a);
    expect(addTripFix(a, fix(NaN, 20))).toBe(a);
  });
});

describe('parseTrip', () => {
  it('keeps the totals and drops the anchor', () => {
    expect(parseTrip({ distanceM: 1200, movingS: 300, last: { lat: 1, lng: 2, timestamp: 3 } })).toEqual({ distanceM: 1200, movingS: 300, last: null });
  });
  it('starts fresh on junk', () => {
    expect(parseTrip(null)).toEqual(EMPTY_TRIP);
    expect(parseTrip('x')).toEqual(EMPTY_TRIP);
    expect(parseTrip({ distanceM: -5, movingS: 'a' })).toEqual(EMPTY_TRIP);
  });
});

describe('compass readouts', () => {
  it('names the eight points', () => {
    expect([0, 44, 46, 90, 135, 180, 225, 270, 315, 337, 338, 359, -45, 720].map(compassPoint)).toEqual([
      'N', 'NE', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'NW', 'N', 'N', 'NW', 'N',
    ]);
  });
  it('reads the heading with its degrees, or a dash', () => {
    expect(headingReadout(312.4)).toEqual(['NW', '312°']);
    expect(headingReadout(359.7)).toEqual(['N', '0°']);
    expect(headingReadout(null)).toEqual(['–', '']);
  });
  it('prefers the GPS course, then the compass', () => {
    expect(dashHeading(90, 200)).toBe(90);
    expect(dashHeading(null, 200)).toBe(200);
    expect(dashHeading(null, -1)).toBeNull();
    expect(dashHeading(null, null)).toBeNull();
  });
});

describe('movingReadout', () => {
  it('minutes, then hours and minutes', () => {
    expect(movingReadout(0)).toEqual(['0', 'min']);
    expect(movingReadout(42 * 60 + 59)).toEqual(['42', 'min']);
    expect(movingReadout(65 * 60)).toEqual(['1:05', 'hr']);
  });
});
