/**
 * Leader Trackline: in Ride Mode, a line behind the leader in the leader dot's color, so everyone
 * can see exactly where the leader went. Each phone draws it from the leader trail it already
 * keeps from the leader's live spots (hooks/use-leader-trail, core/freeride extendTrail), so
 * nothing new is uploaded. The leader can turn it off for the whole ride (rides.leader_trackline).
 *
 * When the leader comes back over their own line (crossing it, riding a loop back to the start,
 * or doubling back on an out-and-back trail), everything before that point turns into the faded
 * "old" line and the line from there on is the fresh one, drawn on top. So where two passes share
 * a trail, the bright line is always the newest pass and riders follow the right one.
 *
 * Pure, so it is tested without a phone.
 */
import { distanceM, type LatLng } from './geo';
import { tc } from './i18n';

/** A newer spot this close to an older part of the line counts as back on it. */
export const TRACKLINE_CROSS_M = 15;
/**
 * The older part must be at least this far back along the line, so the line just behind the
 * leader (and a tight hairpin) never counts as crossing it.
 */
export const TRACKLINE_LOOP_M = 120;
/**
 * Two spots further apart than this were not ridden in a straight line (this phone missed the
 * leader's spots for a while, or was closed): the line breaks there rather than cut across.
 * Max Battery Saver and Ride Mode's backup poll hear the leader only every 45 s or so, which at
 * highway speed is well over a kilometer, so the limit sits above that.
 */
export const TRACKLINE_BREAK_M = 2_000;
/**
 * Distance along the line counts only once the leader moves this far from where it last counted,
 * so GPS wander while the leader is stopped (lunch, a regroup) never adds up to a loop that would
 * fade the whole line behind them.
 */
export const TRACKLINE_STILL_M = 40;
/**
 * Riding back along an old pass, GPS drift can wander a few meters off it for a moment. Only
 * after this far off the old line does a later return count as a new crossing, so one pass back
 * down a trail stays one fresh line.
 */
export const TRACKLINE_LEAVE_M = 80;
/** The newest pass is followed back from where it met the older line while it stays this close to it. */
export const TRACKLINE_NEAR_M = 45;
/** ...but never further back than this. */
export const TRACKLINE_BACK_MAX_M = 1_500;

export type TracklinePieces = {
  /** The newest pass, bright. Drawn last, on top. */
  fresh: LatLng[][];
  /** Everything from before the leader last came back over the line, faded. */
  old: LatLng[][];
  /** Where the fresh line starts in the points given (0 when the leader never came back over it). */
  freshFrom: number;
  /** How many times the leader came back over their own line. */
  crossings: number;
};

const EMPTY: TracklinePieces = { fresh: [], old: [], freshFrom: 0, crossings: 0 };

/** Squared distance from point (px, py) to the segment (ax, ay)-(bx, by). */
function pointSeg2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

/** Whether two segments cross (touching counts). */
function segsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay);
  const d2 = o(cx, cy, dx, dy, bx, by);
  const d3 = o(ax, ay, bx, by, cx, cy);
  const d4 = o(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Index of the first spot of the newest pass: the start of the last stretch where the line came
 * back within TRACKLINE_CROSS_M of a part of itself at least TRACKLINE_LOOP_M further back.
 * It compares the line's pieces (not just its spots), so a crossing between two widely spaced
 * spots (a fast leader, or a phone that heard the leader only now and then) is still caught. One
 * pass over the line with a grid of TRACKLINE_CROSS_M squares, so a long day (thousands of
 * spots) stays quick on every new spot.
 */
export function lastCrossing(points: LatLng[]): { from: number; crossings: number } {
  const n = points.length;
  if (n < 3) return { from: 0, crossings: 0 };
  // Flat meters around the first spot: plenty accurate over a day's ride for a 15 m test.
  const lat0 = points[0].lat;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const along = new Float64Array(n);
  // A piece longer than this is a break (not ridden): it is never drawn, so it never counts.
  const isBreak = new Uint8Array(n);
  // Where distance along the line last counted from (see TRACKLINE_STILL_M).
  let anchor = 0;
  for (let i = 0; i < n; i++) {
    xs[i] = (points[i].lng - points[0].lng) * kx;
    ys[i] = (points[i].lat - lat0) * ky;
    if (i > 0) {
      const step = distanceM(points[i - 1], points[i]);
      isBreak[i] = step > TRACKLINE_BREAK_M ? 1 : 0;
      if (isBreak[i]) {
        // Nor does a break count as distance along the line.
        along[i] = along[i - 1] + TRACKLINE_LOOP_M;
        anchor = i;
      } else {
        // Measured from the anchor, so wander around one spot never adds up past TRACKLINE_STILL_M,
        // while riding on it is the same as summing the steps.
        const moved = distanceM(points[anchor], points[i]);
        along[i] = along[anchor] + moved;
        if (moved >= TRACKLINE_STILL_M) anchor = i;
      }
    }
  }
  const cell = TRACKLINE_CROSS_M;
  const grid = new Map<string, number[]>();
  const keyOf = (cx: number, cy: number) => `${cx},${cy}`;
  /** Every grid square the piece ending at spot k passes through. */
  const cellsOf = (k: number): [number, number][] => {
    const ax = xs[k - 1];
    const ay = ys[k - 1];
    const len = Math.hypot(xs[k] - ax, ys[k] - ay);
    const steps = Math.max(1, Math.ceil(len / (cell / 2)));
    const seen = new Set<string>();
    const out: [number, number][] = [];
    for (let s = 0; s <= steps; s++) {
      const cx = Math.floor((ax + ((xs[k] - ax) * s) / steps) / cell);
      const cy = Math.floor((ay + ((ys[k] - ay) * s) / steps) / cell);
      const key = keyOf(cx, cy);
      if (!seen.has(key)) {
        seen.add(key);
        out.push([cx, cy]);
      }
    }
    return out;
  };
  const cross2 = TRACKLINE_CROSS_M * TRACKLINE_CROSS_M;
  /** Whether the pieces ending at spots i and j come within TRACKLINE_CROSS_M of each other. */
  const near = (i: number, j: number) => {
    const [ax, ay, bx, by] = [xs[i - 1], ys[i - 1], xs[i], ys[i]];
    const [cx, cy, dx, dy] = [xs[j - 1], ys[j - 1], xs[j], ys[j]];
    return (
      segsCross(ax, ay, bx, by, cx, cy, dx, dy)
      || pointSeg2(bx, by, cx, cy, dx, dy) <= cross2
      || pointSeg2(ax, ay, cx, cy, dx, dy) <= cross2
      || pointSeg2(cx, cy, ax, ay, bx, by) <= cross2
      || pointSeg2(dx, dy, ax, ay, bx, by) <= cross2
    );
  };
  /** Whether spot k is within `radius` of a piece of the line at least TRACKLINE_LOOP_M before it. */
  const nearOlder = (k: number, radius: number) => {
    const r = Math.ceil(radius / cell);
    const cx = Math.floor(xs[k] / cell);
    const cy = Math.floor(ys[k] / cell);
    const r2 = radius * radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (const j of grid.get(keyOf(cx + dx, cy + dy)) ?? []) {
          if (along[k] - along[j] < TRACKLINE_LOOP_M) continue;
          if (pointSeg2(xs[k], ys[k], xs[j - 1], ys[j - 1], xs[j], ys[j]) <= r2) return true;
        }
      }
    }
    return false;
  };
  /**
   * Where the newest pass really starts, given that spot i is the first one back on the line.
   * Riding back down a trail, the two passes run side by side for a while before they come within
   * TRACKLINE_CROSS_M (the trail is wide, or GPS drifts), so the line is followed back while it
   * stays within TRACKLINE_NEAR_M of the older line: on an out-and-back that reaches the
   * turnaround, and at a plain crossing just the last few yards of the approach.
   */
  const passStart = (i: number, floor: number): number => {
    let k = i - 1;
    while (k - 1 > floor && along[i] - along[k - 1] <= TRACKLINE_BACK_MAX_M && nearOlder(k - 1, TRACKLINE_NEAR_M)) k--;
    return k;
  };
  let from = 0;
  let crossings = 0;
  // How far along the line the last spot that was back on an older part was (-Infinity: never).
  let lastOn = -Infinity;
  // Pieces go into the grid only once they are far enough back to count, so the line never
  // matches the stretch just behind it. Piece k runs from spot k - 1 to spot k.
  let added = 1;
  for (let i = 2; i < n; i++) {
    while (added < i && along[i - 1] - along[added] >= TRACKLINE_LOOP_M) {
      if (!isBreak[added]) {
        for (const [cx, cy] of cellsOf(added)) {
          const key = keyOf(cx, cy);
          const list = grid.get(key);
          if (list) list.push(added);
          else grid.set(key, [added]);
        }
      }
      added++;
    }
    if (isBreak[i]) continue;
    let on = false;
    const checked = new Set<number>();
    for (const [cx, cy] of cellsOf(i)) {
      for (let dx = -1; dx <= 1 && !on; dx++) {
        for (let dy = -1; dy <= 1 && !on; dy++) {
          const list = grid.get(keyOf(cx + dx, cy + dy));
          if (!list) continue;
          for (const j of list) {
            if (checked.has(j)) continue;
            checked.add(j);
            if (near(i, j)) {
              on = true;
              break;
            }
          }
        }
      }
      if (on) break;
    }
    if (on) {
      // Measured from where this piece starts, so the pieces either side of one spot on the old
      // line are one crossing, however far apart the spots are.
      if (along[i - 1] - lastOn > TRACKLINE_LEAVE_M) {
        // Back on the line: the fresh pass starts where it came alongside the older line (the
        // turnaround on an out-and-back, the last few yards before a crossing).
        from = passStart(i, from);
        crossings++;
      }
      lastOn = along[i];
    }
  }
  return { from, crossings };
}

/** Split a run of spots into the pieces actually ridden, breaking at gaps over TRACKLINE_BREAK_M. */
export function ridden(points: LatLng[]): LatLng[][] {
  const pieces: LatLng[][] = [];
  let cur: LatLng[] = [];
  for (const p of points) {
    const prev = cur[cur.length - 1];
    if (prev && distanceM(prev, p) > TRACKLINE_BREAK_M) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

/**
 * The trackline to draw from the leader's trail, oldest spot first: the faded old line and the
 * bright fresh one. The two share the spot where they meet, so the line never shows a gap.
 */
export function tracklinePieces(points: LatLng[] | null | undefined): TracklinePieces {
  if (!points || points.length < 2) return EMPTY;
  const { from, crossings } = lastCrossing(points);
  return {
    fresh: ridden(points.slice(from)),
    old: from > 0 ? ridden(points.slice(0, from + 1)) : [],
    freshFrom: from,
    crossings,
  };
}

/** Whether the line shows: on unless the leader turned it off (rides saved before 2.1 have no column: on). */
export function tracklineOn(ride: { leader_trackline?: boolean | null } | null | undefined): boolean {
  return ride?.leader_trackline !== false;
}

/**
 * `next`, but reusing each piece of `prev` that hasn't changed (same length and same end spots), so
 * a map redraws only the piece that grew. Apple Maps takes a line off and puts it back on any
 * change, so new copies of unchanged pieces on every spot would make the whole line flash.
 */
export function keepSame(prev: TracklinePieces | null | undefined, next: TracklinePieces): TracklinePieces {
  if (!prev) return next;
  const reuse = (was: LatLng[][], now: LatLng[][]) => {
    let changed = was.length !== now.length;
    const out = now.map((piece, i) => {
      const old = was[i];
      // Same last spot and about the same length: once the trail is at its limit its oldest spot
      // drops on every new one, which alone isn't worth redrawing a piece.
      const same = !!old && Math.abs(old.length - piece.length) <= 1 && sameSpot(old[old.length - 1], piece[piece.length - 1]);
      if (!same) changed = true;
      return same ? old : piece;
    });
    return changed ? out : was;
  };
  const fresh = reuse(prev.fresh, next.fresh);
  const old = reuse(prev.old, next.old);
  if (fresh === prev.fresh && old === prev.old && prev.freshFrom === next.freshFrom && prev.crossings === next.crossings) return prev;
  return { ...next, fresh, old };
}

const sameSpot = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

/** What to tell the leader when the switch didn't save. */
export function tracklineError(message: string): string {
  if (/set_leader_trackline|leader_trackline/.test(message) && /could not find|schema cache|does not exist/i.test(message)) {
    return tc('Turning off the trackline isn’t switched on yet. It starts working with the next server update.');
  }
  if (/only the leader/i.test(message)) return tc('Only the leader can do that.');
  if (/network|fetch|timed? ?out|offline/i.test(message)) return tc('No signal. Check your connection and try again.');
  return message;
}
