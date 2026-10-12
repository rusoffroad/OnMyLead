import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { distanceM, type LatLng } from '../geo';
import { lineLengthM } from '../route';
import { joinLegs, legsFromRoute, routeFromLegs, straightLeg, type Leg } from '../route-legs';
import {
  decodeRoadLines, MAX_SNAP_M, ROUTE_MAX_TILES, routeAlongTrails, snapRadiusM, snapToTrails, tilesForLeg, type RoadLine,
} from '../trail-router';

// A flat patch of desert near Moab: 0.001° of latitude is about 111 m.
const O = { lat: 38.57, lng: -109.55 };
const at = (dx: number, dy: number): LatLng => ({ lat: O.lat + dy / 111_320, lng: O.lng + dx / (111_320 * Math.cos((O.lat * Math.PI) / 180)) });
const line = (pts: [number, number][], cost = 1, over = false): RoadLine => ({ cost, pts: pts.map(([x, y]) => at(x, y)), ...(over ? { over } : {}) });
const near = (a: LatLng, b: LatLng, m = 2) => distanceM(a, b) <= m;

describe('snapping a leg to the trails', () => {
  it('follows a bending trail instead of cutting across', () => {
    // An L-shaped track: east 500 m, then north 500 m.
    const lines = [line([[0, 0], [250, 0], [500, 0], [500, 250], [500, 500]])];
    const leg = routeAlongTrails(lines, at(10, 20), at(480, 490), 60)!;
    expect(leg).not.toBeNull();
    expect(near(leg.from, at(10, 0))).toBe(true);
    expect(near(leg.to, at(500, 490))).toBe(true);
    expect(leg.points.some((p) => near(p, at(500, 0)))).toBe(true);
    expect(lineLengthM(leg.points)).toBeGreaterThan(950);
  });

  it('turns at a crossing even when the lines share no point there', () => {
    const lines = [line([[0, 0], [1000, 0]]), line([[500, -500], [500, 500]])];
    const leg = routeAlongTrails(lines, at(0, 0), at(500, 480), 30)!;
    expect(leg.points.some((p) => near(p, at(500, 0)))).toBe(true);
    expect(lineLengthM(leg.points)).toBeCloseTo(980, -1);
  });

  it("doesn't turn off a bridge onto the road under it", () => {
    const lines = [line([[0, 0], [1000, 0]], 1, true), line([[500, -500], [500, 500]]), line([[0, 0], [0, -500], [500, -500]])];
    const leg = routeAlongTrails(lines, at(0, 0), at(500, 400), 30)!;
    // The only way down is round by the far corner.
    expect(leg.points.some((p) => near(p, at(0, -500)))).toBe(true);
  });

  it('joins a trail that stops just short of another (a T, or the edge of a square)', () => {
    const lines = [line([[0, 0], [1000, 0]]), line([[400, 5], [400, 600]])];
    const leg = routeAlongTrails(lines, at(0, 0), at(400, 590), 30)!;
    expect(leg).not.toBeNull();
    expect(lineLengthM(leg.points)).toBeLessThan(1010);
  });

  it('prefers dirt over a highway that is only a little shorter', () => {
    const lines = [
      line([[0, 0], [1000, 0]], 6), // motorway straight across
      line([[0, 0], [500, 150], [1000, 0]]), // track bending a little
    ];
    const leg = routeAlongTrails(lines, at(0, 0), at(1000, 0), 30)!;
    expect(leg.points.some((p) => near(p, at(500, 150)))).toBe(true);
  });

  it('gives up when a tap is nowhere near a trail, the lines never meet, or the way round is absurd', () => {
    const a = [line([[0, 0], [500, 0]])];
    expect(routeAlongTrails(a, at(0, 0), at(250, 400), 60)).toBeNull();
    const apart = [line([[0, 0], [500, 0]]), line([[0, 300], [500, 300]])];
    expect(routeAlongTrails(apart, at(0, 0), at(0, 300), 60)).toBeNull();
    const detour = [line([[0, 0], [0, 3000], [100, 3000], [100, 0]])];
    expect(routeAlongTrails(detour, at(0, 10), at(100, 10), 30)).toBeNull();
    expect(routeAlongTrails([], at(0, 0), at(1, 1), 30)).toBeNull();
  });

  it('pulls a lone tap onto the nearest line', () => {
    const lines = [line([[0, 0], [500, 0]]), line([[0, 100], [500, 100]])];
    expect(near(snapToTrails(lines, at(200, 30), 50)!, at(200, 0))).toBe(true);
    expect(snapToTrails(lines, at(200, 50), 20)).toBeNull();
  });

  it('snaps about a fingertip at any zoom, within limits', () => {
    expect(snapRadiusM(0.1)).toBe(15);
    expect(snapRadiusM(2)).toBe(48);
    expect(snapRadiusM(1000)).toBe(MAX_SNAP_M);
  });

  it('reads only the squares a leg needs, and refuses legs too long to snap', () => {
    const one = tilesForLeg(at(0, 0), at(100, 100))!;
    expect(one.length).toBeGreaterThan(0);
    expect(one.length).toBeLessThanOrEqual(4);
    expect(tilesForLeg(at(0, 0), at(40_000, 0))).toBeNull();
    expect(tilesForLeg(at(0, 0), at(6000, 6000))!.length).toBeLessThanOrEqual(ROUTE_MAX_TILES);
  });
});

describe('real OpenStreetMap squares', () => {
  // Engineer Pass Road above Lake City, Colorado, across the edge between two zoom 14 squares.
  const dir = join(__dirname, 'fixtures');
  const lines = [6322, 6323].flatMap((y) =>
    decodeRoadLines(new Uint8Array(readFileSync(join(dir, `14_3296_${y}.pbf`))), { z: 14, x: 3296, y }),
  );

  it('decodes roads and trails, leaving out what nobody drives', () => {
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.every((l) => l.cost >= 1 && l.pts.length > 1)).toBe(true);
  });

  it('snaps a leg along Engineer Pass Road across the squares', () => {
    const a = { lat: 37.9341, lng: -107.569 };
    const b = { lat: 37.9446, lng: -107.5737 };
    const leg = routeAlongTrails(lines, a, b, 80)!;
    expect(leg).not.toBeNull();
    expect(leg.points.length).toBeGreaterThan(5);
    const len = lineLengthM(leg.points);
    expect(len).toBeGreaterThan(distanceM(a, b));
    expect(len).toBeLessThan(distanceM(a, b) * 1.4);
  });

  it('ignores a corrupt square', () => {
    expect(decodeRoadLines(new Uint8Array([1, 2, 3, 4]), { z: 14, x: 0, y: 0 })).toEqual([]);
  });
});

describe('legs of a drawn route', () => {
  const taps = [at(0, 0), at(500, 0), at(500, 500), at(0, 500)];
  const legs: Leg[] = [
    { mode: 'trail', points: [taps[0], at(250, 40), taps[1]] },
    straightLeg(taps[1], taps[2]),
    { mode: 'trail', points: [taps[2], at(300, 520), at(150, 480), taps[3]] },
  ];

  it('joins the legs into one line through every tap', () => {
    const pts = joinLegs(taps, legs);
    expect(pts).toHaveLength(7);
    expect(pts[0]).toEqual(taps[0]);
    expect(pts[2]).toEqual(taps[1]);
    expect(pts[6]).toEqual(taps[3]);
  });

  it('saves with every tap still on the line, and reads the legs back', () => {
    const route = routeFromLegs(taps, legs, ' Loop ')!;
    expect(route.name).toBe('Loop');
    expect(route.waypoints).toEqual(taps);
    for (const t of taps) expect(route.points).toContainEqual(t);
    const back = legsFromRoute(route);
    expect(back.map((l) => l.mode)).toEqual(['trail', 'straight', 'trail']);
    expect(back[2].points).toHaveLength(4);
  });

  it('reads an older straight-line route as straight legs', () => {
    const back = legsFromRoute({ points: taps, waypoints: taps });
    expect(back.map((l) => l.mode)).toEqual(['straight', 'straight', 'straight']);
  });

  it('falls back to straight legs when the taps are not on the line', () => {
    const back = legsFromRoute({ points: [at(0, 0), at(900, 900)], waypoints: taps });
    expect(back).toHaveLength(3);
    expect(back.every((l) => l.mode === 'straight')).toBe(true);
  });

  it('has no route until there are two taps', () => {
    expect(routeFromLegs([taps[0]], [])).toBeNull();
  });
});
