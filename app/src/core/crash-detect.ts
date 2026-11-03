/**
 * Crash Alert: spots a likely crash from the phone's motion sensors and GPS speed while Ride Mode
 * is open, so the app can start an "I'm OK" countdown before telling the group.
 *
 * A crash here is a hard hit or a rollover while riding, followed by the vehicle stopping. A hard
 * bump that keeps rolling isn't one, and neither is a phone lifted out of its mount while parked:
 * the vehicle has to have been moving in the last few seconds. Dropping a phone can still look like
 * a crash, which is why the countdown exists. Pure logic: the screen feeds in samples.
 */

export type CrashSensitivity = 'low' | 'normal' | 'high';

export type CrashSettings = { enabled: boolean; sensitivity: CrashSensitivity };

export const DEFAULT_CRASH_SETTINGS: CrashSettings = { enabled: true, sensitivity: 'normal' };

export const CRASH_SENSITIVITIES: { value: CrashSensitivity; label: string; detail: string }[] = [
  { value: 'low', label: 'Low', detail: 'Only very hard hits and full rollovers. Fewer false alarms on rough trails.' },
  { value: 'normal', label: 'Normal', detail: 'Hard hits and rollovers. Recommended.' },
  { value: 'high', label: 'High', detail: 'Also smaller hits and steep tips. More false alarms.' },
];

const G = 9.81;

/** Hit size (g, without gravity) and tip angle (degrees) that count as a crash at each sensitivity. */
export const CRASH_THRESHOLDS: Record<CrashSensitivity, { impactG: number; rolloverDeg: number }> = {
  low: { impactG: 6, rolloverDeg: 75 },
  normal: { impactG: 4, rolloverDeg: 60 },
  high: { impactG: 2.5, rolloverDeg: 50 },
};

/** Faster than a walk: the vehicle was riding. */
export const RIDING_MPS = 2.2; // ~5 mph
/** The vehicle must have been riding this recently for a hit to count. */
export const RECENT_RIDING_MS = 10_000;
/** A tip past the rollover angle must last this long (a rock crawl lean that snaps back doesn't). */
export const ROLLOVER_HOLD_MS = 1_500;
/** After a hit, the vehicle has this long to come to a stop... */
export const SETTLE_WINDOW_MS = 15_000;
/** ...and must stay stopped this long. */
export const SETTLE_HOLD_MS = 3_000;
/** Stopped: slower than this. */
export const STOPPED_MPS = 1.0;
/** Riding on at this speed after a hit means it was a bump, not a crash. */
export const DROVE_ON_MPS = 4.5; // ~10 mph
/** The countdown before the group is told. */
export const COUNTDOWN_S = 30;
/** Quiet time after an alarm (cancelled or sent) before another can start. */
export const REARM_MS = 60_000;

export type CrashCause = 'impact' | 'rollover';

export type CrashSample = {
  /** Phone time, ms. */
  t: number;
  /** Acceleration without gravity, m/s², any axes (only its size is used). */
  userAccel: { x: number; y: number; z: number } | null;
  /** Tilt from the rider's Zero, degrees (null when not known). */
  roll: number | null;
  pitch: number | null;
  /** Latest GPS speed, m/s (null when not known). */
  speedMps: number | null;
};

export type CrashState = {
  lastRidingAt: number | null;
  tippedSince: number | null;
  suspect: null | { cause: CrashCause; at: number; stoppedSince: number | null };
  quietUntil: number;
};

export const INITIAL_CRASH: CrashState = { lastRidingAt: null, tippedSince: null, suspect: null, quietUntil: 0 };

export type CrashStep = { state: CrashState; alarm: CrashCause | null };

const mag = (v: { x: number; y: number; z: number }) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

export function crashStep(state: CrashState, s: CrashSample, sensitivity: CrashSensitivity): CrashStep {
  const th = CRASH_THRESHOLDS[sensitivity];
  const speed = s.speedMps != null && Number.isFinite(s.speedMps) && s.speedMps >= 0 ? s.speedMps : null;
  const lastRidingAt = speed != null && speed >= RIDING_MPS ? s.t : state.lastRidingAt;
  const ridingRecently = lastRidingAt != null && s.t - lastRidingAt <= RECENT_RIDING_MS;

  const tipped =
    (s.roll != null && Math.abs(s.roll) >= th.rolloverDeg) || (s.pitch != null && Math.abs(s.pitch) >= th.rolloverDeg);
  const tippedSince = tipped ? (state.tippedSince ?? s.t) : null;

  let suspect = state.suspect;
  const quiet = s.t < state.quietUntil;

  if (!suspect && !quiet && ridingRecently) {
    const g = s.userAccel ? mag(s.userAccel) / G : 0;
    if (Number.isFinite(g) && g >= th.impactG) suspect = { cause: 'impact', at: s.t, stoppedSince: null };
    else if (tippedSince != null && s.t - tippedSince >= ROLLOVER_HOLD_MS) suspect = { cause: 'rollover', at: s.t, stoppedSince: null };
  }

  if (suspect) {
    // Rode on: it was a bump.
    if (speed != null && speed >= DROVE_ON_MPS && s.t - suspect.at > 2_000) {
      return { state: { lastRidingAt, tippedSince, suspect: null, quietUntil: state.quietUntil }, alarm: null };
    }
    // Stopped (or no GPS speed at all, as when the phone is wedged under a seat): watch it stay put.
    const stopped = speed == null || speed < STOPPED_MPS;
    const stoppedSince = stopped ? (suspect.stoppedSince ?? s.t) : null;
    if (stoppedSince != null && s.t - stoppedSince >= SETTLE_HOLD_MS) {
      return {
        state: { lastRidingAt, tippedSince, suspect: null, quietUntil: s.t + REARM_MS },
        alarm: suspect.cause,
      };
    }
    if (s.t - suspect.at > SETTLE_WINDOW_MS) {
      return { state: { lastRidingAt, tippedSince, suspect: null, quietUntil: state.quietUntil }, alarm: null };
    }
    suspect = { ...suspect, stoppedSince };
  }

  return { state: { lastRidingAt, tippedSince, suspect, quietUntil: state.quietUntil }, alarm: null };
}

/** Starts the quiet time when the rider taps I'm OK, so one crash doesn't alarm twice. */
export function quietAfterAlarm(state: CrashState, now: number): CrashState {
  return { ...state, suspect: null, quietUntil: Math.max(state.quietUntil, now + REARM_MS) };
}

/** Seconds left on the countdown, never below zero. */
export function secondsLeft(startedAt: number, now: number, total = COUNTDOWN_S): number {
  return Math.max(0, Math.ceil(total - (now - startedAt) / 1000));
}

/** The chat message the group gets with the EMERGENCY alert. */
export function crashMessage(cause: CrashCause): string {
  return cause === 'rollover'
    ? 'Possible Crash: my phone detected a rollover and I didn’t answer the I’m OK check. Check on me.'
    : 'Possible Crash: my phone detected a hard hit and I didn’t answer the I’m OK check. Check on me.';
}

export function parseCrashSettings(raw: string | null): CrashSettings {
  if (!raw) return DEFAULT_CRASH_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<CrashSettings>;
    return {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_CRASH_SETTINGS.enabled,
      sensitivity: v.sensitivity === 'low' || v.sensitivity === 'high' || v.sensitivity === 'normal' ? v.sensitivity : 'normal',
    };
  } catch {
    return DEFAULT_CRASH_SETTINGS;
  }
}
