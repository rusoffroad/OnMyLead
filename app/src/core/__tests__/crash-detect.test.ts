import { describe, expect, it } from 'vitest';

import {
  COUNTDOWN_HIDDEN_MAX_MS,
  COUNTDOWN_S,
  countdownStart,
  INITIAL_CRASH,
  REARM_MS,
  crashMessage,
  crashStep,
  parseCrashSettings,
  properG,
  quietAfterAlarm,
  secondsLeft,
  type CrashSample,
  type CrashState,
} from '../crash-detect';

const G = 9.81;
const s = (t: number, o: Partial<CrashSample> = {}): CrashSample => ({ t, userAccel: { x: 0, y: 0, z: 0 }, roll: 0, pitch: 0, speedMps: 0, ...o });

/** Feeds samples in order; returns the final state and every alarm raised. */
function run(samples: CrashSample[], sens: 'low' | 'normal' | 'high' = 'normal', start: CrashState = INITIAL_CRASH) {
  let state = start;
  const alarms: string[] = [];
  for (const x of samples) {
    const r = crashStep(state, x, sens);
    state = r.state;
    if (r.alarm) alarms.push(r.alarm);
  }
  return { state, alarms };
}

describe('crashStep', () => {
  it('alarms on a hard hit while riding, then a stop', () => {
    const { alarms } = run([
      s(0, { speedMps: 12 }),
      s(500, { speedMps: 12, userAccel: { x: 5 * G, y: 0, z: 0 } }),
      s(1500, { speedMps: 0.2 }),
      s(3000, { speedMps: 0 }),
      s(4600, { speedMps: 0 }),
    ]);
    expect(alarms).toEqual(['impact']);
  });

  it('ignores a hard bump that keeps riding', () => {
    const { alarms } = run([
      s(0, { speedMps: 12 }),
      s(500, { speedMps: 12, userAccel: { x: 5 * G, y: 0, z: 0 } }),
      s(3000, { speedMps: 11 }),
      s(6000, { speedMps: 0 }),
      s(10_000, { speedMps: 0 }),
    ]);
    expect(alarms).toEqual([]);
  });

  it('ignores a hit while parked (phone pulled out of the mount)', () => {
    const { alarms } = run([
      s(0, { speedMps: 0 }),
      s(500, { speedMps: 0, userAccel: { x: 8 * G, y: 0, z: 0 } }),
      s(5000, { speedMps: 0 }),
    ]);
    expect(alarms).toEqual([]);
  });

  it('alarms on a rollover that holds', () => {
    const { alarms } = run([
      s(0, { speedMps: 4 }),
      s(500, { speedMps: 2, roll: 70 }),
      s(2100, { speedMps: 0, roll: 85 }),
      s(3000, { speedMps: 0, roll: 88 }),
      s(5200, { speedMps: 0, roll: 88 }),
    ]);
    expect(alarms).toEqual(['rollover']);
  });

  it('never calls a rollover without a tilt reading (not zeroed yet)', () => {
    const { alarms } = run([
      s(0, { speedMps: 4, roll: null, pitch: null }),
      s(2000, { speedMps: 0, roll: null, pitch: null }),
      s(6000, { speedMps: 0, roll: null, pitch: null }),
    ]);
    expect(alarms).toEqual([]);
  });

  it('ignores a steep lean that comes back', () => {
    const { alarms } = run([
      s(0, { speedMps: 3 }),
      s(500, { speedMps: 2, roll: 65 }),
      s(1200, { speedMps: 2, roll: 20 }),
      s(5000, { speedMps: 0, roll: 5 }),
    ]);
    expect(alarms).toEqual([]);
  });

  it('follows the sensitivity', () => {
    const hit = [s(0, { speedMps: 12 }), s(400, { speedMps: 10, userAccel: { x: 3 * G, y: 0, z: 0 } }), s(1000, { speedMps: 0 }), s(4200, { speedMps: 0 })];
    expect(run(hit, 'normal').alarms).toEqual([]);
    expect(run(hit, 'high').alarms).toEqual(['impact']);
    const big = [s(0, { speedMps: 12 }), s(400, { speedMps: 10, userAccel: { x: 5 * G, y: 0, z: 0 } }), s(1000, { speedMps: 0 }), s(4200, { speedMps: 0 })];
    expect(run(big, 'low').alarms).toEqual([]);
  });

  it('gives up when the vehicle never settles', () => {
    const { alarms } = run([
      s(0, { speedMps: 12 }),
      s(500, { speedMps: 12, userAccel: { x: 5 * G, y: 0, z: 0 } }),
      s(2000, { speedMps: 3 }),
      s(8000, { speedMps: 3 }),
      s(16_000, { speedMps: 3 }),
      s(17_000, { speedMps: 0 }),
      s(21_000, { speedMps: 0 }),
    ]);
    expect(alarms).toEqual([]);
  });

  it('stays quiet for a minute after an alarm', () => {
    const crash = (t0: number) => [
      s(t0, { speedMps: 12 }),
      s(t0 + 500, { speedMps: 12, userAccel: { x: 5 * G, y: 0, z: 0 } }),
      s(t0 + 1000, { speedMps: 0 }),
      s(t0 + 4100, { speedMps: 0 }),
    ];
    const first = run(crash(0));
    expect(first.alarms).toEqual(['impact']);
    expect(run(crash(10_000), 'normal', first.state).alarms).toEqual([]);
    expect(run(crash(4100 + REARM_MS), 'normal', first.state).alarms).toEqual(['impact']);
  });

  it('starts the quiet time when the rider taps I’m OK', () => {
    const q = quietAfterAlarm(INITIAL_CRASH, 1000);
    expect(q.quietUntil).toBe(1000 + REARM_MS);
  });
});

describe('countdown and settings', () => {
  it('counts down whole seconds and stops at zero', () => {
    expect(secondsLeft(0, 0)).toBe(COUNTDOWN_S);
    expect(secondsLeft(0, 400)).toBe(30);
    expect(secondsLeft(0, 1000)).toBe(29);
    expect(secondsLeft(0, 31_000)).toBe(0);
  });

  it('holds the clock while the countdown waits hidden, but never long enough to stop the alert', () => {
    // Shown at once: the clock starts at the alarm.
    expect(countdownStart(1000, 1200, 1200, 5000)).toBe(1000);
    // Still hidden 900 ms after mounting: the clock waits with it.
    expect(countdownStart(1000, 1200, null, 2100)).toBe(1900);
    // Shown 1.5 s after mounting: the rider still gets the whole window.
    expect(countdownStart(1000, 1200, 2700, 9000)).toBe(2500);
    expect(secondsLeft(countdownStart(1000, 1200, 2700, 2700), 2700)).toBe(COUNTDOWN_S);
    // Never shown: the wait is capped, so the alert still sends.
    expect(countdownStart(1000, 1200, null, 60_000)).toBe(1000 + COUNTDOWN_HIDDEN_MAX_MS);
    expect(secondsLeft(countdownStart(1000, 1200, null, 60_000), 60_000)).toBe(0);
  });

  it('names the cause in the group message', () => {
    expect(crashMessage('rollover')).toContain('rollover');
    expect(crashMessage('impact')).toContain('hard hit');
  });

  it('reads saved settings safely', () => {
    expect(parseCrashSettings(null)).toEqual({ enabled: true, sensitivity: 'normal' });
    expect(parseCrashSettings('{"enabled":false,"sensitivity":"high"}')).toEqual({ enabled: false, sensitivity: 'high' });
    expect(parseCrashSettings('{"sensitivity":"wild"}')).toEqual({ enabled: true, sensitivity: 'normal' });
    expect(parseCrashSettings('not json')).toEqual({ enabled: true, sensitivity: 'normal' });
  });
});

describe('dropped phone', () => {
  // 20 samples a second, like the motion feed.
  const every = (from: number, to: number, o: Partial<CrashSample>) => {
    const out: CrashSample[] = [];
    for (let t = from; t <= to; t += 50) out.push(s(t, o));
    return out;
  };

  it('ignores the landing hit after a free fall, even right after riding', () => {
    const { alarms } = run([
      ...every(0, 1000, { speedMps: 8, feltG: 1 }),
      ...every(1050, 1350, { speedMps: 3, feltG: 0.05 }), // falling ~300 ms
      s(1400, { speedMps: 1, feltG: 7, userAccel: { x: 7 * G, y: 0, z: 0 } }), // hits the floor
      ...every(1450, 9000, { speedMps: 0, feltG: 1, roll: 85, pitch: 10 }), // lies on its side
    ]);
    expect(alarms).toEqual([]);
  });

  it('a very short dip under 1 g (a bump) does not count as a drop', () => {
    const { alarms } = run([
      ...every(0, 1000, { speedMps: 12, feltG: 1 }),
      s(1050, { speedMps: 12, feltG: 0.1 }),
      s(1100, { speedMps: 12, feltG: 1, userAccel: { x: 5 * G, y: 0, z: 0 } }),
      ...every(1150, 6000, { speedMps: 0, feltG: 1 }),
    ]);
    expect(alarms).toEqual(['impact']);
  });

  it('counts hits again once the drop is a few seconds old', () => {
    const { alarms } = run([
      ...every(0, 500, { speedMps: 10, feltG: 1 }),
      ...every(550, 800, { speedMps: 10, feltG: 0.1 }),
      ...every(850, 5000, { speedMps: 10, feltG: 1 }),
      s(5050, { speedMps: 10, feltG: 6, userAccel: { x: 6 * G, y: 0, z: 0 } }),
      ...every(5100, 10_000, { speedMps: 0, feltG: 1 }),
    ]);
    expect(alarms).toEqual(['impact']);
  });

  it('no rollover until the dropped phone is back in its mount, then it counts again', () => {
    const before = run([
      ...every(0, 500, { speedMps: 10, feltG: 1 }),
      ...every(550, 800, { speedMps: 10, feltG: 0.1 }),
      ...every(850, 6000, { speedMps: 10, feltG: 1, roll: 70 }),
    ]);
    expect(before.alarms).toEqual([]);
    expect(before.state.displaced).toBe(true);
    const after = run(
      [
        ...every(6050, 8500, { speedMps: 10, feltG: 1, roll: 2 }), // back in the mount
        ...every(8550, 15_000, { speedMps: 0, feltG: 1, roll: 80 }), // a real rollover
      ],
      'normal',
      before.state,
    );
    expect(after.alarms).toEqual(['rollover']);
  });

  it('a crash that throws the phone out of the mount still alarms', () => {
    const { alarms } = run([
      ...every(0, 500, { speedMps: 12, feltG: 1 }),
      s(550, { speedMps: 12, feltG: 6, userAccel: { x: 6 * G, y: 0, z: 0 } }),
      ...every(600, 900, { speedMps: 2, feltG: 0.1 }),
      ...every(950, 6000, { speedMps: 0, feltG: 1, roll: 90 }),
    ]);
    expect(alarms).toEqual(['impact']);
  });
});

describe('properG', () => {
  const down = { x: 0, y: 0, z: -G };
  it('is about 1 g at rest and 0 in free fall, whichever way the platform signs acceleration', () => {
    expect(properG(down, { x: 0, y: 0, z: 0 })).toBeCloseTo(1);
    // Falling: acceleration cancels gravity one way (iOS) or doubles it the other (Android); either reads ~0.
    expect(properG(down, { x: 0, y: 0, z: G })).toBeCloseTo(0);
    expect(properG(down, { x: 0, y: 0, z: -G })).toBeCloseTo(0);
    expect(properG(null, null)).toBeNull();
  });
});
