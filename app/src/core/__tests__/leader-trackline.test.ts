import { describe, expect, it } from 'vitest';

import { extendTrail, type LeaderTrail } from '../freeride';
import type { LatLng } from '../geo';
import { keepSame, lastCrossing, ridden, TRACKLINE_BREAK_M, tracklineError, tracklineOn, tracklinePieces } from '../leader-trackline';

const start: LatLng = { lat: 38.5, lng: -109.5 };
const M_LAT = 111_195;
const M_LNG = 111_195 * Math.cos((start.lat * Math.PI) / 180);
/** A spot `n` meters north and `e` meters east of the start. */
const at = (n: number, e = 0): LatLng => ({ lat: start.lat + n / M_LAT, lng: start.lng + e / M_LNG });

/** Spots every `step` meters along straight legs between the given corners (meters north/east). */
function path(corners: [number, number][], step = 15): LatLng[] {
  const out: LatLng[] = [at(corners[0][0], corners[0][1])];
  for (let c = 1; c < corners.length; c++) {
    const [n0, e0] = corners[c - 1];
    const [n1, e1] = corners[c];
    const len = Math.hypot(n1 - n0, e1 - e0);
    const k = Math.max(1, Math.round(len / step));
    for (let i = 1; i <= k; i++) out.push(at(n0 + ((n1 - n0) * i) / k, e0 + ((e1 - e0) * i) / k));
  }
  return out;
}

/** Through the real trail builder, so the test sees what a phone would draw. */
function trail(spots: LatLng[]): LatLng[] {
  let t: LeaderTrail | null = null;
  for (const p of spots) t = extendTrail(t, 'ride', 'lead', p, 1000);
  return t!.points;
}

describe('lastCrossing', () => {
  it('a straight ride never crosses itself: the whole line is fresh', () => {
    const pts = trail(path([[0, 0], [3000, 0]]));
    expect(lastCrossing(pts)).toEqual({ from: 0, crossings: 0 });
    const t = tracklinePieces(pts);
    expect(t.old).toEqual([]);
    expect(t.fresh).toHaveLength(1);
    expect(t.fresh[0]).toHaveLength(pts.length);
  });

  it('a tight hairpin is not a crossing (the line just behind the leader never counts)', () => {
    // Up 400 m, across 10 m, back down 40 m: the two legs are 10 m apart but only ~50 m apart along the line.
    const pts = trail(path([[0, 0], [400, 0], [400, 10], [360, 10]], 5));
    expect(lastCrossing(pts).crossings).toBe(0);
  });

  it('crossing the line at a right angle starts the fresh line at the crossing', () => {
    // North 600 m, east 300, south 300, then west across the first leg and on for 300 m.
    const pts = trail(path([[0, 0], [600, 0], [600, 300], [300, 300], [300, -300]]));
    const { from, crossings } = lastCrossing(pts);
    expect(crossings).toBe(1);
    // The fresh line starts within a couple of spots of where the leader reached the first leg (east 0).
    const crossAt = pts[from + 1];
    expect(Math.abs((crossAt.lng - start.lng) * M_LNG)).toBeLessThan(30);
    expect(Math.abs((crossAt.lat - start.lat) * M_LAT - 300)).toBeLessThan(5);
    const t = tracklinePieces(pts);
    expect(t.old.length).toBe(1);
    expect(t.fresh.length).toBe(1);
    // The two meet at the same spot, so there's no gap in the drawn line.
    expect(t.old[0][t.old[0].length - 1]).toEqual(t.fresh[0][0]);
  });

  it('doubling back on an out-and-back trail: the whole way back is one fresh line', () => {
    // Out 1500 m, a 30 m turnaround, then back down the same trail with GPS wandering up to 6 m.
    const out = path([[0, 0], [1500, 0], [1500, 30]]);
    const back = path([[1500, 30], [0, 4]]).map((p, i) => at((p.lat - start.lat) * M_LAT, 4 + 6 * Math.sin(i / 3)));
    const pts = trail([...out, ...back]);
    const { from, crossings } = lastCrossing(pts);
    expect(crossings).toBe(1);
    // The fresh line starts at the turnaround, not part way back down.
    expect((pts[from].lat - start.lat) * M_LAT).toBeGreaterThan(1460);
    const t = tracklinePieces(pts);
    const freshLen = t.fresh.flat().length;
    expect(freshLen).toBeGreaterThan(back.length * 0.85);
  });

  it('drifting off the old line for a moment on the way back is still the same pass', () => {
    // Back down the trail, but 40 m off it for 30 m in the middle (went round a rock), then back on.
    const out = path([[0, 0], [1200, 0], [1200, 20]]);
    const back = path([[1200, 20], [700, 0], [690, 40], [660, 40], [650, 0], [0, 0]]);
    const pts = trail([...out, ...back]);
    expect(lastCrossing(pts).crossings).toBe(1);
  });

  it('a second lap of a loop makes the first lap old and the second fresh', () => {
    const lap: [number, number][] = [[0, 0], [800, 0], [800, 800], [0, 800], [0, 0]];
    const once = path(lap);
    const pts = trail([...once, ...path(lap).slice(1), ...path([[0, 0], [400, 0]]).slice(1)]);
    const t = tracklinePieces(pts);
    expect(t.crossings).toBeGreaterThanOrEqual(1);
    // Everything from before the leader came back to the start is old.
    expect(t.freshFrom).toBeGreaterThan(once.length * 0.9);
    expect(t.freshFrom).toBeLessThan(once.length + 3);
  });

  it('catches a crossing between widely spaced spots (a fast leader, or spots heard only now and then)', () => {
    // Spots 150 m apart: no two spots are near each other, but the lines cross.
    const pts = path([[0, 0], [1500, 0], [1500, 600], [750, 600], [750, -600]], 150);
    expect(lastCrossing(pts).crossings).toBe(1);
  });

  it('the latest crossing wins when the leader crosses the line more than once', () => {
    // A zigzag that crosses the first leg twice.
    const pts = trail(path([[0, 0], [1000, 0], [1000, 200], [700, 200], [700, -200], [400, -200], [400, 200]]));
    const { from, crossings } = lastCrossing(pts);
    expect(crossings).toBe(2);
    expect((pts[from + 1].lat - start.lat) * M_LAT).toBeLessThan(450);
  });

  it('handles a long day quickly', () => {
    const pts: LatLng[] = [];
    for (let i = 0; i < 5000; i++) pts.push(at(Math.sin(i / 400) * 3000, i * 3));
    const t0 = Date.now();
    tracklinePieces(pts);
    expect(Date.now() - t0).toBeLessThan(250);
  });
});

describe('ridden', () => {
  it('breaks the line where the phone missed the leader for a long way, never drawing across', () => {
    const a = path([[0, 0], [300, 0]]);
    const b = path([[300 + TRACKLINE_BREAK_M + 200, 0], [1200, 0]]);
    const pieces = ridden([...a, ...b]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toHaveLength(a.length);
  });

  it('drops a lone spot that has nothing to join', () => {
    expect(ridden([at(0), at(5000)])).toEqual([]);
    expect(tracklinePieces([at(0)]).fresh).toEqual([]);
    expect(tracklinePieces(null).fresh).toEqual([]);
  });
});

describe('tracklineOn', () => {
  it('is on unless the leader turned it off, and on for rides from before the switch existed', () => {
    expect(tracklineOn({ leader_trackline: true })).toBe(true);
    expect(tracklineOn({ leader_trackline: false })).toBe(false);
    expect(tracklineOn({})).toBe(true);
    expect(tracklineOn(null)).toBe(true);
  });
});

describe('keepSame', () => {
  it('reuses the pieces that did not change, so the map redraws only the growing one', () => {
    const base = trail(path([[0, 0], [600, 0], [600, 300], [300, 300], [300, -300]]));
    const a = tracklinePieces(base);
    const b = keepSame(a, tracklinePieces([...base, at(300, -320)]));
    expect(b.old[0]).toBe(a.old[0]);
    expect(b.fresh[0]).not.toBe(a.fresh[0]);
    expect(b.fresh[0].length).toBe(a.fresh[0].length + 1);
    // Nothing new: the very same object comes back.
    expect(keepSame(b, tracklinePieces([...base, at(300, -320)]))).toBe(b);
    expect(keepSame(null, a)).toBe(a);
  });
});

describe('tracklineError', () => {
  it('explains a server without the switch, a rider who isn’t the leader, and no signal', () => {
    expect(tracklineError('Could not find the function public.set_leader_trackline(p_on, p_ride) in the schema cache')).toMatch(/next server update/);
    expect(tracklineError('Only the leader can do that.')).toBe('Only the leader can do that.');
    expect(tracklineError('TypeError: Network request failed')).toMatch(/No signal/);
    expect(tracklineError('Something else')).toBe('Something else');
  });
});
