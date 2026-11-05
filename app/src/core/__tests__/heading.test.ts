import { describe, expect, it } from 'vitest';

import { heldHeading, HELD_HEADING_MS, OWN_STOPPED_AFTER_MS, ownArrow, ownFix, ownMovingAt, ownStillMoving, ownStoppedAfterMs, riderHeading, screenAngle } from '../heading';
import { BATTERY_PLANS } from '../battery';

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

describe('ownFix', () => {
  it("adds the arrow to this phone's own dot while moving", () => {
    expect(ownFix({ latitude: 38.5, longitude: -109.5, speed: 9, heading: 270 })).toEqual({ lat: 38.5, lng: -109.5, headingDeg: 270 });
  });
  it('no arrow standing still or without a course (iPhone -1, Android 0 at rest)', () => {
    expect(ownFix({ latitude: 38.5, longitude: -109.5, speed: 0, heading: 0 })?.headingDeg).toBeNull();
    expect(ownFix({ latitude: 38.5, longitude: -109.5, speed: -1, heading: -1 })?.headingDeg).toBeNull();
  });
  it('ignores a dot with no position', () => {
    expect(ownFix(null)).toBeNull();
    expect(ownFix({ latitude: null, longitude: -109.5 })).toBeNull();
  });
});

describe('the arrow on your own dot always shows', () => {
  it('uses the GPS course while moving, the compass when stopped, else the last course', () => {
    expect(ownArrow({ speedMps: 10, headingDeg: 45 }, 300, null)).toEqual({ deg: 45, moving: true });
    expect(ownArrow({ speedMps: 0, headingDeg: -1 }, 300, 45)).toEqual({ deg: 300, moving: false });
    expect(ownArrow({ speedMps: 0, headingDeg: -1 }, null, 45)).toEqual({ deg: 45, moving: false });
    expect(ownArrow(null, -1, null)).toEqual({ deg: null, moving: false });
  });
});

describe("other riders' arrows stay on after they stop", () => {
  it('holds the last heading while live, for a while', () => {
    const h = heldHeading(null, { speedMps: 10, headingDeg: 90 }, true, 0);
    expect(h).toEqual({ deg: 90, at: 0 });
    expect(heldHeading(h, { speedMps: 0, headingDeg: -1 }, true, 60_000)).toBe(h);
    expect(heldHeading(h, { speedMps: 0, headingDeg: -1 }, true, HELD_HEADING_MS + 1)).toBeNull();
    expect(heldHeading(h, { speedMps: 10, headingDeg: 90 }, false, 1)).toBeNull();
  });
});

describe('own dot moving or stopped', () => {
  const start = { movingAt: null, fixAt: null };
  it('waits 5 s on a map with a fix every second, and longer than two fix gaps on Battery Saver', () => {
    expect(ownStoppedAfterMs(1000)).toBe(OWN_STOPPED_AFTER_MS);
    expect(ownStoppedAfterMs()).toBe(5000);
    expect(ownStoppedAfterMs(BATTERY_PLANS.saver.fixEveryMs)).toBeGreaterThan(2 * BATTERY_PLANS.saver.fixEveryMs);
    expect(ownStoppedAfterMs(Number.NaN)).toBe(5000);
    expect(ownStillMoving(0, 20_000, ownStoppedAfterMs(BATTERY_PLANS.saver.fixEveryMs))).toBe(true);
  });
  it('counts you moving from a moving fix until no new moving fix for a while', () => {
    const a = ownMovingAt(start, true, 1000, 1000);
    expect(a.movingAt).toBe(1000);
    expect(ownStillMoving(a.movingAt, 1000 + OWN_STOPPED_AFTER_MS - 1)).toBe(true);
    expect(ownStillMoving(a.movingAt, 1000 + OWN_STOPPED_AFTER_MS)).toBe(false);
  });
  it('a stopped fix means stopped at once', () => {
    const a = ownMovingAt(ownMovingAt(start, true, 1000, 1000), false, 3000, 3000);
    expect(ownStillMoving(a.movingAt, 3000)).toBe(false);
  });
  it('ignores a repeated fix (only the compass turned)', () => {
    const a = ownMovingAt(start, true, 1000, 1000);
    expect(ownMovingAt(a, true, 1000, 1500)).toBe(a);
    expect(ownMovingAt(a, false, 1000, 1500)).toBe(a);
  });
  it('an earlier fix time (a phone clock jump) still counts, so the dot never freezes', () => {
    const a = ownMovingAt(ownMovingAt(start, true, 9_000_000, 1000), true, 1000, 2000);
    expect(a.movingAt).toBe(2000);
  });
  it('times moving from the clock, not from the phone\'s fix time', () => {
    expect(ownMovingAt(start, true, 5, 1000).movingAt).toBe(1000);
  });
  it('was never moving with no moving fix', () => {
    expect(ownStillMoving(ownMovingAt(start, false, 1000, 1000).movingAt, 1000)).toBe(false);
  });
});
