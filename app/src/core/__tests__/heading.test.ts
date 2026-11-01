import { describe, expect, it } from 'vitest';

import { riderHeading, screenAngle } from '../heading';

describe('riderHeading', () => {
  it('uses the GPS course while a live rider is moving', () => {
    expect(riderHeading({ speedMps: 8, headingDeg: 135 }, true)).toBe(135);
  });
  it('shows no arrow for a parked rider, even when Android reports due north', () => {
    expect(riderHeading({ speedMps: 0, headingDeg: 0 }, true)).toBeNull();
    expect(riderHeading({ speedMps: 1, headingDeg: 90 }, true)).toBeNull();
  });
  it('shows no arrow when the phone has no course (iPhone sends -1 or nothing)', () => {
    expect(riderHeading({ speedMps: 8, headingDeg: -1 }, true)).toBeNull();
    expect(riderHeading({ speedMps: 8, headingDeg: null }, true)).toBeNull();
    expect(riderHeading({ speedMps: null, headingDeg: 90 }, true)).toBeNull();
    expect(riderHeading({ speedMps: 8, headingDeg: Number.NaN }, true)).toBeNull();
  });
  it('shows no arrow on a last-seen position or with no fix', () => {
    expect(riderHeading({ speedMps: 8, headingDeg: 90 }, false)).toBeNull();
    expect(riderHeading(null, true)).toBeNull();
  });
  it('keeps the heading within 0 to 360', () => {
    expect(riderHeading({ speedMps: 8, headingDeg: 360 }, true)).toBe(0);
    expect(riderHeading({ speedMps: 8, headingDeg: 725 }, true)).toBe(5);
  });
});

describe('screenAngle', () => {
  it('is the heading on a north-up map', () => {
    expect(screenAngle(90, 0)).toBe(90);
    expect(screenAngle(90, null)).toBe(90);
  });
  it('turns with the map so the arrow stays true', () => {
    expect(screenAngle(90, 90)).toBe(0);
    expect(screenAngle(10, 300)).toBe(70);
    expect(screenAngle(350, 20)).toBe(330);
  });
});
