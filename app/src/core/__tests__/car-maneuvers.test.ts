import { describe, expect, it } from 'vitest';
import { lineSteps, upcomingManeuvers, startManeuvers, maneuverText, CAR_MANEUVERS_SENT } from '../car-maneuvers';
import { carMapGuide } from '../carplay';
import type { LatLng } from '../geo';

// Meters east/north of a spot near Moab, as LatLng.
const O = { lat: 38.5885, lng: -109.54 };
const M = (e: number, n: number): LatLng => ({ lat: O.lat + n / 111320, lng: O.lng + e / (111320 * Math.cos((O.lat * Math.PI) / 180)) });
/** Points every 10 m between corners, like a recorded track. */
function track(corners: [number, number][]): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 1; i < corners.length; i++) {
    const [ae, an] = corners[i - 1];
    const [be, bn] = corners[i];
    const n = Math.max(1, Math.round(Math.hypot(be - ae, bn - an) / 10));
    for (let k = 0; k < n; k++) out.push(M(ae + ((be - ae) * k) / n, an + ((bn - an) * k) / n));
  }
  out.push(M(...corners[corners.length - 1]));
  return out;
}

describe('lineSteps', () => {
  it('finds a left and a right turn and the arrival', () => {
    // North 300 m, west 300 m (left), north 300 m (right).
    const { steps, lengthM } = lineSteps(track([[0, 0], [0, 300], [-300, 300], [-300, 600]]));
    expect(steps.map((s) => s.turn)).toEqual(['left', 'right', 'arrive']);
    expect(steps[0].atM).toBeGreaterThan(280);
    expect(steps[0].atM).toBeLessThan(320);
    expect(lengthM).toBeGreaterThan(890);
  });

  it('tells bears, sharp turns and U-turns apart', () => {
    expect(lineSteps(track([[0, 0], [0, 300], [200, 500]])).steps[0].turn).toBe('bearRight');
    expect(lineSteps(track([[0, 0], [0, 300], [-150, 150]])).steps[0].turn).toBe('sharpLeft');
    expect(lineSteps(track([[0, 0], [0, 300], [5, 0]])).steps[0].turn).toBe('uTurn');
  });

  it('ignores gentle curves and GPS jitter', () => {
    const wiggly = track([[0, 0], [3, 100], [-2, 200], [4, 300], [0, 400], [30, 500], [60, 600]]);
    expect(lineSteps(wiggly).steps.map((s) => s.turn)).toEqual(['arrive']);
  });

  it('merges a zigzag into one step', () => {
    const { steps } = lineSteps(track([[0, 0], [0, 300], [-20, 310], [-300, 310]]));
    expect(steps.map((s) => s.turn)).toEqual(['left', 'arrive']);
  });

  it('has nothing for a line under two points', () => {
    expect(lineSteps([M(0, 0)]).steps).toEqual([]);
  });
});

describe('upcomingManeuvers', () => {
  const line = track([[0, 0], [0, 300], [-300, 300], [-300, 600]]);

  it('gives the next step with the distance to it, then the one after', () => {
    const m = upcomingManeuvers(line, 100, 'Hell’s Revenge');
    expect(m).toHaveLength(CAR_MANEUVERS_SENT);
    expect(m[0]).toMatchObject({ turn: 'left', instruction: 'Turn Left' });
    expect(m[0].distanceM).toBeGreaterThan(180);
    expect(m[0].distanceM).toBeLessThan(220);
    expect(m[1].turn).toBe('right');
  });

  it('drops a step once passed and ends on the arrival', () => {
    expect(upcomingManeuvers(line, 650, 'Hell’s Revenge').map((m) => m.instruction)).toEqual(['Arrive at the End of Hell’s Revenge']);
    expect(upcomingManeuvers(line, 5000, null).map((m) => [m.instruction, m.distanceM])).toEqual([['Arrive at the End of the Route', 0]]);
  });

  it('keeps ids stable for the same step', () => {
    expect(upcomingManeuvers(line, 100, 'X', 'k')[0].id).toBe(upcomingManeuvers(line, 200, 'X', 'k')[0].id);
  });
});

describe('startManeuvers', () => {
  it('heads to the start, then the first step counted from there', () => {
    const line = track([[0, 0], [0, 300], [-300, 300]]);
    const m = startManeuvers(line, 1000, 'Fins N Things', 'Fins N Things');
    expect(m[0]).toMatchObject({ turn: 'start', instruction: 'Head to the Start of Fins N Things', distanceM: 1000 });
    expect(m[1].turn).toBe('left');
    expect(m[1].distanceM).toBeGreaterThan(1280);
  });
});

describe('carMapGuide steps', () => {
  const points = track([[0, 0], [0, 300], [-300, 300], [-300, 600]]);
  it('on the trail: the turns ahead', () => {
    const g = carMapGuide({ name: 'Fins', points, onTrail: true, remainingM: 800, toStartM: 0, tripM: 0, movingS: 0 })!;
    expect(g.steps.map((s) => s.turn)).toEqual(['left', 'right']);
  });
  it('before the start: head there first', () => {
    const g = carMapGuide({ name: null, points, onTrail: false, remainingM: 900, toStartM: 400, tripM: 0, movingS: 0 })!;
    expect(g.steps[0].instruction).toBe('Head to the Start of the Route');
  });
  it('every turn has words', () => {
    for (const t of ['start', 'bearLeft', 'bearRight', 'left', 'right', 'sharpLeft', 'sharpRight', 'uTurn', 'arrive'] as const) {
      expect(maneuverText(t, 'A').length).toBeGreaterThan(3);
    }
  });
});
