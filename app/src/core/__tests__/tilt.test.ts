import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TILT_LIMITS,
  EMPTY_MAX,
  FLAT_CALIBRATION,
  INITIAL_WARN,
  WARN_HOLD_MS,
  WARN_REPEAT_MS,
  calibrate,
  clampLimit,
  describeTilt,
  overallLevel,
  parseCalibration,
  parseLimits,
  smoothTilt,
  stepWarning,
  tiltFrom,
  tiltLevel,
  trackMax,
  type Vec3,
} from '../tilt';

const rad = (d: number) => (d * Math.PI) / 180;
/** Rotates a vector about an axis (Rodrigues), to fake a tilted phone. */
function rotate(v: Vec3, axis: Vec3, deg: number): Vec3 {
  const n = Math.hypot(axis.x, axis.y, axis.z);
  const k = { x: axis.x / n, y: axis.y / n, z: axis.z / n };
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const d = k.x * v.x + k.y * v.y + k.z * v.z;
  const cr = { x: k.y * v.z - k.z * v.y, y: k.z * v.x - k.x * v.z, z: k.x * v.y - k.y * v.x };
  return {
    x: v.x * c + cr.x * s + k.x * d * (1 - c),
    y: v.y * c + cr.y * s + k.y * d * (1 - c),
    z: v.z * c + cr.z * s + k.z * d * (1 - c),
  };
}

describe('tiltFrom', () => {
  it('reads level on a flat phone with no Zero yet', () => {
    const t = tiltFrom({ x: 0, y: 0, z: -9.81 }, FLAT_CALIBRATION)!;
    expect(t.roll).toBeCloseTo(0);
    expect(t.pitch).toBeCloseTo(0);
  });

  it('reads roll right and nose up on a flat phone', () => {
    // Right side low: gravity swings toward the phone's right edge (+x).
    const right = tiltFrom(rotate({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, -20), FLAT_CALIBRATION)!;
    expect(right.roll).toBeCloseTo(20);
    expect(right.pitch).toBeCloseTo(0);
    // Nose up: gravity swings toward the bottom of the phone (-y).
    const up = tiltFrom({ x: 0, y: -Math.sin(rad(15)), z: -Math.cos(rad(15)) }, FLAT_CALIBRATION)!;
    expect(up.pitch).toBeCloseTo(15);
    expect(up.roll).toBeCloseTo(0);
  });

  it('zeroes out a phone standing up in a dash mount', () => {
    const level: Vec3 = { x: 0, y: -9.81, z: 0 };
    const cal = calibrate(level)!;
    const t = tiltFrom(level, cal)!;
    expect(t.roll).toBeCloseTo(0);
    expect(t.pitch).toBeCloseTo(0);
    // Truck rolls right: in the phone's view gravity swings to its right edge.
    const rolled = tiltFrom({ x: Math.sin(rad(25)), y: -Math.cos(rad(25)), z: 0 }, cal)!;
    expect(rolled.roll).toBeCloseTo(25);
    expect(rolled.pitch).toBeCloseTo(0);
    // Nose up: gravity swings toward the screen side (+z, toward the driver).
    const climb = tiltFrom({ x: 0, y: -Math.cos(rad(30)), z: Math.sin(rad(30)) }, cal)!;
    expect(climb.pitch).toBeCloseTo(30);
    expect(climb.roll).toBeCloseTo(0);
  });

  it('works for a phone mounted at an odd angle once zeroed', () => {
    // Phone leaned back 35° and twisted 10° in its mount.
    let mount: Vec3 = { x: 0, y: -1, z: 0 };
    mount = rotate(mount, { x: 1, y: 0, z: 0 }, 35);
    mount = rotate(mount, { x: 0, y: 0, z: 1 }, 10);
    const cal = calibrate(mount)!;
    const t = tiltFrom(mount, cal)!;
    expect(Math.abs(t.roll)).toBeLessThan(1e-9);
    expect(Math.abs(t.pitch)).toBeLessThan(1e-9);
    // Any lean away from the zero shows up as tilt of the same size.
    const leaned = rotate(mount, cal.forward, 12);
    const lt = tiltFrom(leaned, cal)!;
    expect(Math.hypot(lt.roll, lt.pitch)).toBeCloseTo(12);
    expect(Math.abs(lt.roll)).toBeCloseTo(12);
  });

  it('ignores unusable readings', () => {
    expect(tiltFrom({ x: 0, y: 0, z: 0 }, FLAT_CALIBRATION)).toBeNull();
    expect(tiltFrom({ x: Number.NaN, y: 0, z: 1 }, FLAT_CALIBRATION)).toBeNull();
    expect(calibrate({ x: 0, y: 0, z: 0 })).toBeNull();
  });
});

describe('levels and text', () => {
  it('goes amber near the limit and red at it', () => {
    expect(tiltLevel(10, 25)).toBe('ok');
    expect(tiltLevel(-20, 25)).toBe('caution');
    expect(tiltLevel(25, 25)).toBe('warn');
    expect(overallLevel({ roll: 5, pitch: 31 }, DEFAULT_TILT_LIMITS)).toBe('warn');
    expect(overallLevel({ roll: 21, pitch: 0 }, DEFAULT_TILT_LIMITS)).toBe('caution');
    expect(overallLevel({ roll: 0, pitch: 0 }, DEFAULT_TILT_LIMITS)).toBe('ok');
  });

  it('describes the lean in words', () => {
    expect(describeTilt({ roll: -4.4, pitch: 2.2 })).toBe('Roll 4° Left · Pitch 2° Up');
    expect(describeTilt({ roll: 0.3, pitch: -0.2 })).toBe('Roll 0° · Pitch 0°');
  });

  it('keeps limits in range', () => {
    expect(clampLimit(5, 25)).toBe(10);
    expect(clampLimit(60, 25)).toBe(45);
    expect(clampLimit(27.6, 25)).toBe(28);
    expect(clampLimit(Number.NaN, 25)).toBe(25);
  });

  it('smooths jitter', () => {
    expect(smoothTilt(null, { roll: 10, pitch: 0 })).toEqual({ roll: 10, pitch: 0 });
    expect(smoothTilt({ roll: 0, pitch: 0 }, { roll: 10, pitch: -10 }, 0.5)).toEqual({ roll: 5, pitch: -5 });
  });

  it('remembers the biggest lean each way', () => {
    let m = trackMax(EMPTY_MAX, { roll: -12, pitch: 8 });
    m = trackMax(m, { roll: 20, pitch: -3 });
    expect(m).toEqual({ rollLeft: 12, rollRight: 20, pitchUp: 8, pitchDown: 3 });
    expect(trackMax(m, { roll: 1, pitch: 1 })).toBe(m);
  });
});

describe('stepWarning', () => {
  const limits = DEFAULT_TILT_LIMITS;
  it('waits for the lean to hold before warning', () => {
    let s = stepWarning(INITIAL_WARN, { roll: 27, pitch: 0 }, limits, 0);
    expect(s.announce).toBeNull();
    s = stepWarning(s.state, { roll: 28, pitch: 0 }, limits, WARN_HOLD_MS);
    expect(s.announce).toEqual({ axis: 'roll', text: 'Roll 28 right' });
  });

  it('ignores a quick rock past the limit', () => {
    let s = stepWarning(INITIAL_WARN, { roll: 0, pitch: -32 }, limits, 0);
    s = stepWarning(s.state, { roll: 0, pitch: 5 }, limits, 300);
    s = stepWarning(s.state, { roll: 0, pitch: -32 }, limits, 400);
    expect(s.announce).toBeNull();
  });

  it('repeats while the lean stays past the limit, but not too often', () => {
    let s = stepWarning(INITIAL_WARN, { roll: -30, pitch: 0 }, limits, 0);
    s = stepWarning(s.state, { roll: -30, pitch: 0 }, limits, WARN_HOLD_MS);
    expect(s.announce?.text).toBe('Roll 30 left');
    s = stepWarning(s.state, { roll: -30, pitch: 0 }, limits, WARN_HOLD_MS + 1000);
    expect(s.announce).toBeNull();
    s = stepWarning(s.state, { roll: -30, pitch: 0 }, limits, WARN_HOLD_MS + WARN_REPEAT_MS);
    expect(s.announce?.text).toBe('Roll 30 left');
  });

  it('warns fresh after the lean comes back well under the limit', () => {
    let s = stepWarning(INITIAL_WARN, { roll: 0, pitch: 33 }, limits, 0);
    s = stepWarning(s.state, { roll: 0, pitch: 33 }, limits, WARN_HOLD_MS);
    expect(s.announce?.text).toBe('Pitch 33 up');
    // Hovering just under the limit doesn't re-arm.
    s = stepWarning(s.state, { roll: 0, pitch: 29 }, limits, 1000);
    s = stepWarning(s.state, { roll: 0, pitch: 31 }, limits, 1100);
    s = stepWarning(s.state, { roll: 0, pitch: 31 }, limits, 1100 + WARN_HOLD_MS);
    expect(s.announce).toBeNull();
    // Back to level, then over again: warns without waiting for the repeat time.
    s = stepWarning(s.state, { roll: 0, pitch: 5 }, limits, 2000);
    s = stepWarning(s.state, { roll: 0, pitch: 34 }, limits, 2100);
    s = stepWarning(s.state, { roll: 0, pitch: 34 }, limits, 2100 + WARN_HOLD_MS);
    expect(s.announce?.text).toBe('Pitch 34 up');
  });
});

describe('saved tilt settings', () => {
  it('reads limits safely', () => {
    expect(parseLimits(null)).toEqual(DEFAULT_TILT_LIMITS);
    expect(parseLimits('{"roll":30,"pitch":99}')).toEqual({ roll: 30, pitch: 45 });
    expect(parseLimits('oops')).toEqual(DEFAULT_TILT_LIMITS);
  });
  it('rebuilds a saved Zero', () => {
    const cal = parseCalibration(JSON.stringify({ gravity: { x: 0, y: -9.8, z: 0 } }))!;
    expect(cal.forward.z).toBeCloseTo(-1);
    expect(parseCalibration('{"gravity":{"x":"a"}}')).toBeNull();
    expect(parseCalibration(null)).toBeNull();
  });
});
