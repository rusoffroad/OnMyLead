import { describe, expect, it } from 'vitest';
import { distanceM, type LatLng } from '../geo';
import {
  extendTrail, FreerideTracker, MIN_SPAN_M, parseStoredTrail, placeOnTrail, summarizeFreeride,
  TRAIL_MAX_AGE_MS, TRAIL_MAX_POINTS, type LeaderTrail,
} from '../freeride';
import type { RouteRider } from '../route';

const start: LatLng = { lat: 38.5, lng: -109.5 };
/** A spot `m` meters north of the start. */
const north = (m: number, eastM = 0): LatLng => ({ lat: start.lat + m / 111_195, lng: start.lng + eastM / (111_195 * Math.cos((start.lat * Math.PI) / 180)) });

/** The leader's trail, one fix every 20 m along the given spots. */
function trailThrough(spots: LatLng[]): LeaderTrail {
  let t: LeaderTrail | null = null;
  for (const p of spots) t = extendTrail(t, 'ride', 'lead', p, 1000);
  return t!;
}
const straightTrail = (toM: number) => trailThrough(Array.from({ length: Math.floor(toM / 20) + 1 }, (_, i) => north(i * 20)));

const rider = (id: string, at: LatLng | null, role: RouteRider['role'] = 'rider'): RouteRider => ({ id, role, at });

describe('extendTrail', () => {
  it('adds a point only once the leader has moved far enough', () => {
    let t = extendTrail(null, 'ride', 'lead', north(0));
    const same = extendTrail(t, 'ride', 'lead', north(5));
    expect(same).toBe(t);
    t = extendTrail(t, 'ride', 'lead', north(20));
    expect(t.points).toHaveLength(2);
  });

  it('starts over for a new leader or a new ride', () => {
    const t = straightTrail(200);
    expect(extendTrail(t, 'ride', 'other', north(400)).points).toHaveLength(1);
    expect(extendTrail(t, 'ride2', 'lead', north(400)).points).toHaveLength(1);
  });

  it('drops the oldest part of a very long trail and remembers how much', () => {
    let t: LeaderTrail | null = null;
    for (let i = 0; i <= TRAIL_MAX_POINTS + 10; i++) t = extendTrail(t, 'ride', 'lead', north(i * 20));
    expect(t!.points).toHaveLength(TRAIL_MAX_POINTS);
    expect(t!.droppedM).toBeGreaterThan(200);
    expect(t!.droppedM).toBeLessThan(240);
  });
});

describe('parseStoredTrail', () => {
  const t = { ...straightTrail(100), updatedAt: 1_000_000 };
  it('reads back a fresh trail for the same ride', () => {
    expect(parseStoredTrail(JSON.stringify(t), 'ride', 1_000_000 + 60_000)?.points).toHaveLength(t.points.length);
  });
  it('ignores another ride, an old trail and junk', () => {
    expect(parseStoredTrail(JSON.stringify(t), 'other', 1_000_000)).toBeNull();
    expect(parseStoredTrail(JSON.stringify(t), 'ride', 1_000_000 + TRAIL_MAX_AGE_MS + 1)).toBeNull();
    expect(parseStoredTrail('{not json', 'ride')).toBeNull();
    expect(parseStoredTrail(JSON.stringify({ ...t, points: [{ lat: 'x' }] }), 'ride', 1_000_000)).toBeNull();
    expect(parseStoredTrail(null, 'ride')).toBeNull();
  });
});

describe('placeOnTrail', () => {
  it('puts the leader at the front and everyone else behind by distance along the trail', () => {
    const line = placeOnTrail(straightTrail(2000), 'lead', [
      rider('lead', north(2000), 'leader'),
      rider('a', north(1600)),
      rider('sweep', north(800), 'sweep'),
      rider('quiet', null),
    ]);
    expect(line.leaderId).toBe('lead');
    expect(Math.round(line.behindM.a)).toBe(400);
    expect(Math.round(line.behindM.sweep)).toBe(1200);
    expect(Math.round(line.spanM)).toBe(1200);
    const byId = Object.fromEntries(line.placed.map((r) => [r.id, r.place]));
    expect(byId.lead!.alongM).toBe(line.lengthM);
    expect(byId.sweep!.alongM).toBeCloseTo(0, 0);
    expect(byId.quiet).toBeNull();
    expect(byId.a!.onRoute).toBe(true);
  });

  it('measures round bends, not in a straight line', () => {
    // Out 500 m north, 500 m east, then back 500 m south: the leader ends 500 m from the start.
    const spots: LatLng[] = [];
    for (let m = 0; m <= 500; m += 20) spots.push(north(m));
    for (let m = 20; m <= 500; m += 20) spots.push(north(500, m));
    for (let m = 480; m >= 0; m -= 20) spots.push(north(m, 500));
    const line = placeOnTrail(trailThrough(spots), 'lead', [rider('lead', north(0, 500), 'leader'), rider('a', north(0))]);
    expect(distanceM(north(0), north(0, 500))).toBeLessThan(510);
    expect(line.behindM.a).toBeGreaterThan(1400);
    expect(line.placed.find((r) => r.id === 'a')!.place!.onRoute).toBe(true);
  });

  it('falls back to a straight line for a rider off the leader\'s path, drawn as off it', () => {
    const line = placeOnTrail(straightTrail(1000), 'lead', [rider('lead', north(1000), 'leader'), rider('b', north(500, 900))]);
    expect(Math.round(line.behindM.b)).toBe(Math.round(distanceM(north(500, 900), north(1000))));
    expect(line.placed.find((r) => r.id === 'b')!.place!.onRoute).toBe(false);
  });

  it('works before there is any trail, by straight line', () => {
    const line = placeOnTrail(null, 'lead', [rider('lead', north(300), 'leader'), rider('a', north(0))]);
    expect(Math.round(line.behindM.a)).toBe(300);
  });

  it('scales a tight group to at least half a mile', () => {
    const line = placeOnTrail(straightTrail(200), 'lead', [rider('lead', north(200), 'leader'), rider('a', north(150))]);
    expect(line.lengthM).toBe(MIN_SPAN_M);
  });

  it('places nobody until the leader shares a spot', () => {
    const line = placeOnTrail(straightTrail(200), 'lead', [rider('lead', null, 'leader'), rider('a', north(150))]);
    expect(line.leaderId).toBeNull();
    expect(line.placed.every((r) => r.place === null)).toBe(true);
  });

  it('keeps a rider on their own pass of an out-and-back', () => {
    // Out 1000 m and back to 600 m: a rider at 600 m on the way out is far behind the leader.
    const spots: LatLng[] = [];
    for (let m = 0; m <= 1000; m += 20) spots.push(north(m));
    for (let m = 980; m >= 600; m -= 20) spots.push(north(m, 8));
    const trail = trailThrough(spots);
    const tracker = new FreerideTracker();
    // Seen on the way out first...
    tracker.place(trailThrough(spots.slice(0, 31)), 'lead', [rider('lead', north(600), 'leader'), rider('a', north(400))]);
    const later = tracker.place(trail, 'lead', [rider('lead', north(600, 8), 'leader'), rider('a', north(600))]);
    expect(later.behindM.a).toBeGreaterThan(700);
  });
});

describe('summarizeFreeride', () => {
  const riders = [rider('lead', north(2000), 'leader'), rider('a', north(1600)), rider('sweep', north(800), 'sweep')];
  const line = placeOnTrail(straightTrail(2000), 'lead', riders);

  it('gives the spread and its ends', () => {
    const s = summarizeFreeride(line, 'a');
    expect(s.spread).toBe('0.7 mi');
    expect(s.ends).toBe('Leader to Tail Gunner');
    expect(s.compared).toBe('The leader is 0.2 mi ahead.');
  });

  it('tells the leader how far back the tail gunner is', () => {
    expect(summarizeFreeride(line, 'lead').compared).toBe("You're out front. The tail gunner is 0.7 mi back.");
  });

  it('tells the last rider that nobody is behind them', () => {
    const l = placeOnTrail(straightTrail(2000), 'lead', [rider('lead', north(2000), 'leader'), rider('a', north(1600)), rider('b', north(900))]);
    const s = summarizeFreeride(l, 'b');
    expect(s.ends).toBe('Leader to Last Rider');
    expect(s.compared).toBe('The leader is 0.7 mi ahead. Nobody is behind you.');
  });

  it('says when the group is together, and leaves out a rider with no spot', () => {
    const l = placeOnTrail(straightTrail(200), 'lead', [rider('lead', north(200), 'leader'), rider('a', north(190)), rider('me', null)]);
    const s = summarizeFreeride(l, 'me');
    expect(s.spread).toBeNull();
    expect(s.ends).toBe('2 riders together');
    expect(s.compared).toBeNull();
  });

  it('says the straight-line distance is a straight line', () => {
    const l = placeOnTrail(straightTrail(1000), 'lead', [rider('lead', north(1000), 'leader'), rider('b', north(1000, 900))]);
    expect(summarizeFreeride(l, 'b').compared).toBe('The leader is 0.6 mi ahead in a straight line.');
  });
});
