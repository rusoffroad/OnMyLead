/**
 * Turn-by-turn steps for the CarPlay map (Navigation entitlement): the turns along a trail or a
 * ride route, found from the line's own shape, so they work on any trail with no road data and
 * nothing sent anywhere. A bend sharper than BEAR_DEG within a short stretch is a step ("Bear
 * Right", "Turn Left", "Sharp Right", "Make a U-Turn"), and the end of the line is "Arrive at
 * the End of <name>". The car screen shows the next step with the distance to it, then the one after.
 *
 * Gentle curves on a winding trail are not steps: the line is thinned first and each bend is
 * measured over TURN_SPAN_M either side, so a run of small wiggles doesn't fire a turn each.
 */
import { bearingDeg, type LatLng } from './geo';
import { tc } from './i18n';
import { cumulativeM, simplifyLine } from './route';

export type CarTurn = 'start' | 'bearLeft' | 'bearRight' | 'left' | 'right' | 'sharpLeft' | 'sharpRight' | 'uTurn' | 'arrive';

export type CarManeuver = {
  /** Stable for the same step on the same line (the car screen only redraws when it changes). */
  id: string;
  turn: CarTurn;
  instruction: string;
  /** Distance from you to this step, in meters. */
  distanceM: number;
};

/** Bends gentler than this aren't steps. */
export const BEAR_DEG = 30;
const TURN_DEG = 60;
const SHARP_DEG = 135;
const UTURN_DEG = 165;
/** Each bend is measured over this much line either side of it. */
export const TURN_SPAN_M = 30;
/** Two steps closer than this are one: the sharper one is kept. */
export const MERGE_M = 45;
/** Thinning before looking for bends: hides GPS jitter on recorded tracks. */
const THIN_M = 6;
/** How many steps the car is sent: the next one and the one after. */
export const CAR_MANEUVERS_SENT = 2;

type Step = { atM: number; turn: CarTurn; angle: number };

const norm = (d: number) => ((d + 540) % 360) - 180;

function classify(delta: number): CarTurn | null {
  const a = Math.abs(delta);
  if (a < BEAR_DEG) return null;
  const right = delta > 0;
  if (a >= UTURN_DEG) return 'uTurn';
  if (a >= SHARP_DEG) return right ? 'sharpRight' : 'sharpLeft';
  if (a >= TURN_DEG) return right ? 'right' : 'left';
  return right ? 'bearRight' : 'bearLeft';
}

/** The point at distance m along the line. */
function pointAt(points: LatLng[], cum: number[], m: number): LatLng {
  if (m <= 0) return points[0];
  const last = cum.length - 1;
  if (m >= cum[last]) return points[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= m) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const f = seg > 0 ? (m - cum[lo]) / seg : 0;
  return { lat: points[lo].lat + (points[hi].lat - points[lo].lat) * f, lng: points[lo].lng + (points[hi].lng - points[lo].lng) * f };
}

/** Every step along a line, in order, ending with the arrival. Empty under 2 points. */
export function lineSteps(points: LatLng[]): { steps: Step[]; lengthM: number } {
  if (points.length < 2) return { steps: [], lengthM: 0 };
  const line = simplifyLine(points, THIN_M);
  const cum = cumulativeM(line);
  const lengthM = cum[cum.length - 1];
  const raw: Step[] = [];
  for (let i = 1; i < line.length - 1; i++) {
    const at = cum[i];
    // Too close to either end to tell a bend from the start or the arrival.
    if (at < TURN_SPAN_M / 2 || lengthM - at < TURN_SPAN_M / 2) continue;
    const before = pointAt(line, cum, at - TURN_SPAN_M);
    const after = pointAt(line, cum, at + TURN_SPAN_M);
    const delta = norm(bearingDeg(line[i], after) - bearingDeg(before, line[i]));
    const turn = classify(delta);
    if (turn) raw.push({ atM: at, turn, angle: Math.abs(delta) });
  }
  const steps: Step[] = [];
  for (const s of raw) {
    const prev = steps[steps.length - 1];
    if (prev && s.atM - prev.atM < MERGE_M) {
      if (s.angle > prev.angle) steps[steps.length - 1] = s;
      continue;
    }
    steps.push(s);
  }
  steps.push({ atM: lengthM, turn: 'arrive', angle: 0 });
  return { steps, lengthM };
}

// Steps only change when the line does; screens re-render every second or so.
const cache = new WeakMap<LatLng[], ReturnType<typeof lineSteps>>();
function stepsFor(points: LatLng[]) {
  let v = cache.get(points);
  if (!v) {
    v = lineSteps(points);
    cache.set(points, v);
  }
  return v;
}

/** `name` null: the ride route ("Arrive at the End of the Route"). */
export function maneuverText(turn: CarTurn, name: string | null): string {
  switch (turn) {
    case 'bearLeft': return tc('Bear Left');
    case 'bearRight': return tc('Bear Right');
    case 'left': return tc('Turn Left');
    case 'right': return tc('Turn Right');
    case 'sharpLeft': return tc('Sharp Left');
    case 'sharpRight': return tc('Sharp Right');
    case 'uTurn': return tc('Make a U-Turn');
    case 'arrive': return name ? tc('Arrive at the End of {name}', { name }) : tc('Arrive at the End of the Route');
    case 'start': return name ? tc('Head to the Start of {name}', { name }) : tc('Head to the Start of the Route');
  }
}

/**
 * The next steps from `alongM` (how far along the line you are), nearest first, at most
 * CAR_MANEUVERS_SENT. A step you're within a few meters of counts as passed.
 */
export function upcomingManeuvers(points: LatLng[], alongM: number, endName: string | null, key = 'line'): CarManeuver[] {
  const { steps } = stepsFor(points);
  return fromSteps(steps, alongM, endName, key);
}

/** The line's length as the steps measure it (thinned, so a little under the raw length). */
export const stepsLengthM = (points: LatLng[]) => stepsFor(points).lengthM;

/**
 * Off the line before its start: "Head to the Start of <name>" (straight-line distance; there are
 * no road directions on the car), then the line's first step, counted from the start.
 */
export function startManeuvers(points: LatLng[], toStartM: number, startName: string | null, endName: string | null, key = 'line'): CarManeuver[] {
  const head: CarManeuver = {
    id: `${key}:start`,
    turn: 'start',
    instruction: maneuverText('start', startName),
    distanceM: Math.max(0, Math.round(toStartM)),
  };
  const next = fromSteps(stepsFor(points).steps, 0, endName, key)[0];
  return next ? [head, { ...next, distanceM: Math.round(next.distanceM + Math.max(0, toStartM)) }] : [head];
}

function fromSteps(steps: Step[], alongM: number, endName: string | null, key: string): CarManeuver[] {
  const out: CarManeuver[] = [];
  steps.forEach((s, i) => {
    if (out.length >= CAR_MANEUVERS_SENT || s.atM <= alongM + 5) return;
    out.push({
      id: `${key}:${i}:${s.turn}`,
      turn: s.turn,
      instruction: maneuverText(s.turn, endName),
      distanceM: Math.max(0, Math.round(s.atM - alongM)),
    });
  });
  // At the end itself, keep the arrival showing until the guidance stops.
  if (!out.length && steps.length) {
    out.push({ id: `${key}:${steps.length - 1}:arrive`, turn: 'arrive', instruction: maneuverText('arrive', endName), distanceM: 0 });
  }
  return out;
}
