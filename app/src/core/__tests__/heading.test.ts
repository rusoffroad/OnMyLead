import { describe, expect, it } from 'vitest';

import { heldHeading, HELD_HEADING_MS, OWN_MOVE_START, OWN_STOPPED_AFTER_MS, OWN_STOPPED_UNKNOWN_MS, ownArrow, ownFix, ownMoveStep, ownMoveTimedOut, ownStopWaitMs, riderHeading, screenAngle } from '../heading';
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

describe('ownFix time', () => {
  it('keeps the fix\'s own time when the map gives one', () => {
    expect(ownFix({ latitude: 1, longitude: 2, speed: 0, heading: 0, timestamp: 1234 })?.atMs).toBe(1234);
    expect(ownFix({ latitude: 1, longitude: 2, speed: 0, heading: 0 })?.atMs).toBeUndefined();
    expect(ownFix({ latitude: 1, longitude: 2, speed: 0, heading: 0, timestamp: Number.NaN })?.atMs).toBeUndefined();
  });
});

describe('own dot moving or stopped', () => {
  const ride = (gapMs: number, n: number, from = OWN_MOVE_START, t0 = 0) => {
    let s = from;
    for (let k = 0; k < n; k++) s = ownMoveStep(s, true, t0 + k * gapMs, t0 + k * gapMs);
    return s;
  };
  it('a moving fix means moving; a stopped fix means stopped at once', () => {
    const s = ownMoveStep(OWN_MOVE_START, true, 1000, 1000);
    expect(s.moving).toBe(true);
    expect(ownMoveStep(s, false, 2000, 2000).moving).toBe(false);
  });
  it('before a fix gap is known: the map\'s interval if it has one, else just over Battery Saver', () => {
    const first = ownMoveStep(OWN_MOVE_START, true, 0, 0);
    expect(OWN_STOPPED_UNKNOWN_MS).toBeGreaterThan(BATTERY_PLANS.saver.fixEveryMs);
    expect(ownStopWaitMs(first)).toBe(OWN_STOPPED_UNKNOWN_MS);
    expect(ownStopWaitMs(first, BATTERY_PLANS.saver.fixEveryMs)).toBe(37_500);
    expect(ownStopWaitMs(first, BATTERY_PLANS.balanced.fixEveryMs)).toBe(25_000);
    expect(ownStopWaitMs(first, 1000)).toBe(OWN_STOPPED_AFTER_MS);
    expect(ownStopWaitMs(first, Number.NaN)).toBe(OWN_STOPPED_UNKNOWN_MS);
  });
  it('then 2.5 of the longest recent gap between moving fixes, at least 5 s', () => {
    expect(ownStopWaitMs(ride(1000, 5), 15_000)).toBe(OWN_STOPPED_AFTER_MS);
    expect(ownStopWaitMs(ride(15_000, 3))).toBe(37_500);
    expect(ownStopWaitMs(ownMoveStep(ride(15_000, 3), true, 30_500, 30_500))).toBe(37_500);
  });
  it('a stop, a quiet spell or a dead spot never counts as a fix gap', () => {
    const atLight = ownMoveStep(ride(1000, 5), false, 4500, 4500);
    expect(ownStopWaitMs(ownMoveStep(atLight, true, 44_500, 44_500))).toBe(OWN_STOPPED_AFTER_MS);
    const quiet = ownMoveTimedOut(ride(1000, 5));
    expect(quiet.moving).toBe(false);
    expect(ownStopWaitMs(ownMoveStep(quiet, true, 20_000, 20_000))).toBe(OWN_STOPPED_AFTER_MS);
    expect(ownStopWaitMs(ownMoveStep(ride(1000, 3), true, 40_000, 40_000))).toBe(OWN_STOPPED_AFTER_MS);
  });
  it('measures gaps by the fixes\' own times, so a held-back burst keeps its real spacing', () => {
    let s = ownMoveStep(OWN_MOVE_START, true, 0, 100_000);
    for (let k = 1; k <= 3; k++) s = ownMoveStep(s, true, k * 15_000, 100_000 + k);
    expect(ownStopWaitMs(s)).toBe(37_500);
  });
  it('a fix with no time of its own is never taken for a repeat', () => {
    const s = ownMoveStep(OWN_MOVE_START, true, null, 1000);
    const t = ownMoveStep(s, false, null, 1000);
    expect(t).not.toBe(s);
    expect(t.moving).toBe(false);
  });
  it('ignores a repeated fix (only the compass turned)', () => {
    const s = ownMoveStep(OWN_MOVE_START, true, 1000, 1000);
    expect(ownMoveStep(s, true, 1000, 1500)).toBe(s);
    expect(ownMoveStep(s, false, 1000, 1500)).toBe(s);
  });
  it('an earlier fix time (a phone clock jump) still counts, so the dot never freezes', () => {
    const s = ownMoveStep(ownMoveStep(OWN_MOVE_START, true, 9_000_000, 1000), false, 1000, 2000);
    expect(s.moving).toBe(false);
  });
});
