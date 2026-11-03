/**
 * Roll and pitch meter (inclinometer): how far the vehicle is leaning side to side (roll) and
 * tipping nose up or down (pitch), from the phone's motion sensors. Pure math, no sensors here:
 * the screen hands in the gravity vector the phone reports, in the phone's own axes.
 *
 * The phone sits in a mount at some unknown angle, so the rider parks on level ground and taps
 * Zero. That reading of "down" becomes the vehicle's level. The vehicle's forward direction is
 * taken from the way the phone faces: a phone standing in a dash mount faces the driver, so
 * forward is out the back of the phone; a phone lying flat points its top forward.
 *
 * Angles: roll is positive when the right side is low, pitch is positive when the nose is up.
 */

export type Vec3 = { x: number; y: number; z: number };

/** The vehicle's axes in the phone's coordinates, from a Zero (calibration) reading. */
export type TiltCalibration = { forward: Vec3; right: Vec3; down: Vec3 };

export type Tilt = { roll: number; pitch: number };

export type TiltLevel = 'ok' | 'caution' | 'warn';

export type TiltLimits = { roll: number; pitch: number };

/** Warn at these angles unless the rider sets their own (degrees). */
export const DEFAULT_TILT_LIMITS: TiltLimits = { roll: 25, pitch: 30 };
/** Limits riders can pick from, in degrees. */
export const TILT_LIMIT_MIN = 10;
export const TILT_LIMIT_MAX = 45;
/** Turn amber at this share of the limit. */
export const CAUTION_SHARE = 0.8;

const RAD = 180 / Math.PI;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (a: Vec3) => Math.sqrt(dot(a, a));

/** The vector scaled to length 1, or null when it's too short or not a number. */
export function unit(a: Vec3): Vec3 | null {
  const n = length(a);
  if (!Number.isFinite(n) || n < 1e-6) return null;
  return scale(a, 1 / n);
}

/** The part of `a` at right angles to unit vector `n`, as a unit vector (null if `a` is along `n`). */
function flatten(a: Vec3, n: Vec3): Vec3 | null {
  const v = sub(a, scale(n, dot(a, n)));
  return length(v) < 0.3 ? null : unit(v);
}

/** Phone axes, as the sensors report them: x to the right of the screen, y to its top, z out of the screen. */
const PHONE_BACK: Vec3 = { x: 0, y: 0, z: -1 };
const PHONE_TOP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * A level reference (no mount angle): the phone lying flat, screen up, top of the phone forward.
 * Used until the rider taps Zero.
 */
export const FLAT_CALIBRATION: TiltCalibration = calibrate({ x: 0, y: 0, z: -1 })!;

const AXES: Vec3[] = [
  { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
];

/**
 * Level until the rider taps Zero: the phone's nearest plain position (flat, standing upright in
 * portrait, or on its side in landscape). A phone standing in a dash mount then reads close to
 * level instead of 90° nose up. Null when the reading is unusable.
 */
export function defaultCalibration(gravity: Vec3): TiltCalibration | null {
  const g = unit(gravity);
  if (!g) return null;
  let best = AXES[0];
  for (const a of AXES) if (dot(g, a) > dot(g, best)) best = a;
  return calibrate(best);
}

/**
 * The vehicle's level, from the phone's "down" (gravity) at the moment the rider taps Zero on level
 * ground. Null when the reading is unusable (no sensor data).
 */
export function calibrate(gravity: Vec3): TiltCalibration | null {
  const down = unit(gravity);
  if (!down) return null;
  // Standing up in a mount: forward is out the back of the phone. Lying flat: out the top.
  const forward = flatten(PHONE_BACK, down) ?? flatten(PHONE_TOP, down);
  if (!forward) return null;
  const right = cross(down, forward);
  return { forward, right, down };
}

/** Roll and pitch in degrees for a gravity reading, against the rider's Zero. */
export function tiltFrom(gravity: Vec3, cal: TiltCalibration): Tilt | null {
  const g = unit(gravity);
  if (!g) return null;
  const f = dot(g, cal.forward);
  const r = dot(g, cal.right);
  const d = dot(g, cal.down);
  // Nose up: "down" swings toward the back of the vehicle. Right side low: it swings to the right.
  const pitch = Math.atan2(-f, Math.sqrt(r * r + d * d)) * RAD;
  const roll = Math.atan2(r, d) * RAD;
  return { roll: clean(roll), pitch: clean(pitch) };
}

const clean = (v: number) => (Object.is(v, -0) ? 0 : v);

/**
 * Smooths jittery readings (bumps and engine buzz) toward the new one. `alpha` is how much of the
 * new reading to take (0 to 1). Returns the new reading when there's no previous one.
 */
export function smoothTilt(prev: Tilt | null, next: Tilt, alpha = 0.2): Tilt {
  if (!prev) return next;
  const a = Math.min(1, Math.max(0, alpha));
  return { roll: prev.roll + (next.roll - prev.roll) * a, pitch: prev.pitch + (next.pitch - prev.pitch) * a };
}

/** Keeps a rider-entered limit within the allowed range, whole degrees. */
export function clampLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.min(TILT_LIMIT_MAX, Math.max(TILT_LIMIT_MIN, value)));
}

/** Green, amber near the limit, red at or past it. */
export function tiltLevel(angle: number, limit: number): TiltLevel {
  const a = Math.abs(angle);
  if (a >= limit) return 'warn';
  if (a >= limit * CAUTION_SHARE) return 'caution';
  return 'ok';
}

/** The worse of the roll and pitch levels. */
export function overallLevel(t: Tilt, limits: TiltLimits): TiltLevel {
  const levels = [tiltLevel(t.roll, limits.roll), tiltLevel(t.pitch, limits.pitch)];
  if (levels.includes('warn')) return 'warn';
  if (levels.includes('caution')) return 'caution';
  return 'ok';
}

/** Whole degrees for the screen, with no "-0". */
export function degrees(angle: number): number {
  return Math.round(Math.abs(angle));
}

/** Which way it leans: "Left", "Right", or "" when level. */
export function rollSide(roll: number): 'Left' | 'Right' | '' {
  if (Math.round(roll) === 0) return '';
  return roll > 0 ? 'Right' : 'Left';
}

/** Which way the nose points: "Up", "Down", or "" when level. */
export function pitchSide(pitch: number): 'Up' | 'Down' | '' {
  if (Math.round(pitch) === 0) return '';
  return pitch > 0 ? 'Up' : 'Down';
}

/** Short text for the stats tile and screen readers, like "Roll 4° Left · Pitch 2° Up". */
export function describeTilt(t: Tilt): string {
  const r = `Roll ${degrees(t.roll)}°${rollSide(t.roll) ? ` ${rollSide(t.roll)}` : ''}`;
  const p = `Pitch ${degrees(t.pitch)}°${pitchSide(t.pitch) ? ` ${pitchSide(t.pitch)}` : ''}`;
  return `${r} · ${p}`;
}

/** The ride's biggest lean each way, for the Max readout. */
export type TiltMax = { rollLeft: number; rollRight: number; pitchUp: number; pitchDown: number };

export const EMPTY_MAX: TiltMax = { rollLeft: 0, rollRight: 0, pitchUp: 0, pitchDown: 0 };

export function trackMax(max: TiltMax, t: Tilt): TiltMax {
  const next = {
    rollLeft: Math.max(max.rollLeft, -t.roll),
    rollRight: Math.max(max.rollRight, t.roll),
    pitchUp: Math.max(max.pitchUp, t.pitch),
    pitchDown: Math.max(max.pitchDown, -t.pitch),
  };
  const same =
    next.rollLeft === max.rollLeft &&
    next.rollRight === max.rollRight &&
    next.pitchUp === max.pitchUp &&
    next.pitchDown === max.pitchDown;
  return same ? max : next;
}

/** How long a lean must stay past the limit before it warns, and the quiet time between warnings. */
export const WARN_HOLD_MS = 600;
export const WARN_REPEAT_MS = 8000;
/** The lean must come back this many degrees under the limit before a fresh warning. */
export const WARN_RESET_DEG = 3;

export type WarnState = { since: number | null; lastAt: number | null; armed: boolean };

export const INITIAL_WARN: WarnState = { since: null, lastAt: null, armed: true };

export type WarnResult = { state: WarnState; announce: null | { axis: 'roll' | 'pitch'; text: string } };

/**
 * Decides when to buzz and speak a tilt warning. A lean past the limit has to last WARN_HOLD_MS (one
 * rock or bump doesn't count). After a warning it repeats at most every WARN_REPEAT_MS while the
 * lean stays past the limit, and a new warning needs the lean to drop WARN_RESET_DEG under first.
 */
export function stepWarning(state: WarnState, t: Tilt, limits: TiltLimits, now: number): WarnResult {
  const rollOver = Math.abs(t.roll) - limits.roll;
  const pitchOver = Math.abs(t.pitch) - limits.pitch;
  const over = rollOver >= 0 || pitchOver >= 0;
  if (!over) {
    const clear = rollOver <= -WARN_RESET_DEG && pitchOver <= -WARN_RESET_DEG;
    return { state: { since: null, lastAt: state.lastAt, armed: state.armed || clear }, announce: null };
  }
  const since = state.since ?? now;
  const held = now - since >= WARN_HOLD_MS;
  const repeatDue = state.lastAt == null || now - state.lastAt >= WARN_REPEAT_MS;
  if (!held || !(state.armed || repeatDue)) {
    return { state: { ...state, since }, announce: null };
  }
  const axis: 'roll' | 'pitch' = rollOver >= pitchOver ? 'roll' : 'pitch';
  const text =
    axis === 'roll'
      ? `Roll ${degrees(t.roll)} ${rollSide(t.roll).toLowerCase()}`
      : `Pitch ${degrees(t.pitch)} ${pitchSide(t.pitch).toLowerCase()}`;
  return { state: { since, lastAt: now, armed: false }, announce: { axis, text: text.trim() } };
}

/** Storage keys. Limits and voice follow the account; the Zero stays on this device (each phone sits differently). */
export const TILT_LIMITS_KEY = 'tilt.limits';
export const TILT_VOICE_KEY = 'tilt.voice';
export const TILT_CALIBRATION_KEY = 'tilt.calibration';

export function parseLimits(raw: string | null): TiltLimits {
  if (!raw) return DEFAULT_TILT_LIMITS;
  try {
    const v = JSON.parse(raw) as Partial<TiltLimits>;
    return {
      roll: clampLimit(Number(v.roll), DEFAULT_TILT_LIMITS.roll),
      pitch: clampLimit(Number(v.pitch), DEFAULT_TILT_LIMITS.pitch),
    };
  } catch {
    return DEFAULT_TILT_LIMITS;
  }
}

const isVec = (v: unknown): v is Vec3 =>
  !!v && typeof v === 'object' && ['x', 'y', 'z'].every((k) => Number.isFinite((v as Record<string, unknown>)[k]));

/** The saved Zero (the gravity reading at Zero), rebuilt into a calibration, or null for none. */
export function parseCalibration(raw: string | null): TiltCalibration | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { gravity?: unknown };
    return isVec(v.gravity) ? calibrate(v.gravity) : null;
  } catch {
    return null;
  }
}
