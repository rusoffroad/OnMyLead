import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { distanceM, type LatLng } from '../geo';
import { findLeg, routeProfileFor, tilesAlong } from '../leg-router';
import { lineLengthM } from '../route';
import { decodeRoadLines, lineCost, routeAlongTrails, tilesForLeg, type RoadLine } from '../trail-router';
import { tileFor, type Tile } from '../trails';

// Open country near Moab: 0.001° of latitude is about 111 m.
const O = { lat: 38.57, lng: -109.55 };
const at = (dx: number, dy: number): LatLng => ({ lat: O.lat + dy / 111_320, lng: O.lng + dx / (111_320 * Math.cos((O.lat * Math.PI) / 180)) });
const near = (a: LatLng, b: LatLng, m = 5) => distanceM(a, b) <= m;

/** A line through these corners (meters east, north of O), with a point every 50 m like a real square. */
function road(corners: [number, number][], extra: Partial<RoadLine> = {}): RoadLine {
  const pts: LatLng[] = [];
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1], [bx, by] = corners[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 50));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push(at(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n));
  }
  return { cost: 1, cls: 'track', pts, ...extra };
}

/**
 * Squares as the phone reads them: each line cut to the squares asked for (pieces in squares not
 * read are missing), at whatever zoom is asked. Counts every square read.
 */
function squares(world: RoadLine[]) {
  const read: Tile[] = [];
  const load = async (tiles: Tile[]) => {
    read.push(...tiles);
    const z = tiles[0].z;
    const keys = new Set(tiles.map((t) => `${t.x}/${t.y}`));
    const inside = (p: LatLng) => {
      const t = tileFor(p, z);
      return keys.has(`${t.x}/${t.y}`);
    };
    const out: RoadLine[] = [];
    for (const l of world) {
      let run: LatLng[] = [];
      for (const p of l.pts) {
        if (inside(p)) run.push(p);
        else {
          if (run.length > 1) out.push({ ...l, pts: run });
          run = [];
        }
      }
      if (run.length > 1) out.push({ ...l, pts: run });
    }
    return out;
  };
  return { load, read };
}

describe('which lines each activity prefers', () => {
  it('Motorcycle and Road Trip follow roads; Offroad and Snowmobile follow trails', () => {
    expect(routeProfileFor('motorcycle')).toBe('roads');
    expect(routeProfileFor('road_trip')).toBe('roads');
    expect(routeProfileFor('offroad')).toBe('trails');
    expect(routeProfileFor('snowmobile')).toBe('trails');
    expect(routeProfileFor(null)).toBe('trails');
  });

  it('weighs dirt, walking paths and highways by profile', () => {
    const highway: RoadLine = { cost: 2.5, cls: 'trunk', pts: [] };
    const gravel: RoadLine = { cost: 1, cls: 'minor', unpaved: true, pts: [] };
    const footway: RoadLine = { cost: 3, cls: 'path', foot: true, pts: [] };
    expect(lineCost(highway, 'trails')).toBe(2.5);
    expect(lineCost(highway, 'roads')).toBe(1);
    expect(lineCost(gravel, 'roads')).toBeGreaterThan(lineCost({ ...gravel, unpaved: false }, 'roads'));
    expect(lineCost(footway, 'roads')).toBeGreaterThan(10);
    // Lines made before classes were kept weigh the same on both.
    expect(lineCost({ cost: 1.4, pts: [] }, 'roads')).toBe(1.4);
  });

  it('keeps a motorcycle on the highway it tapped, and an offroad leg on the dirt beside it', () => {
    const lines = [
      road([[0, 0], [3000, 0]], { cls: 'trunk', cost: 2.5 }),
      // A dirt track a little shorter, cutting the corner the highway follows.
      road([[0, 0], [1500, 150], [3000, 0]], { cls: 'track', unpaved: true }),
    ];
    const onTrack = (pts: LatLng[]) => pts.some((p) => near(p, at(1500, 150), 10));
    expect(onTrack(routeAlongTrails(lines, at(0, 0), at(3000, 0), 30, 'trails')!.points)).toBe(true);
    expect(onTrack(routeAlongTrails(lines, at(0, 0), at(3000, 0), 30, 'roads')!.points)).toBe(false);
  });
});

describe('finding a leg', () => {
  it('follows a road that bends far out of the box round the taps (used to draw straight)', async () => {
    // Two taps 1 km apart on a road that drops 2.5 km south round a canyon.
    const world = [road([[0, 0], [0, -2500], [1000, -2500], [1000, 0]], { cls: 'minor' })];
    const a = at(0, 0), b = at(1000, 0);
    const { load } = squares(world);
    // The old box alone has no way through.
    expect(routeAlongTrails(await load(tilesForLeg(a, b)!), a, b, 30, 'roads')).toBeNull();
    const leg = (await findLeg(a, b, 30, load, 'roads'))!;
    expect(leg).not.toBeNull();
    expect(lineLengthM(leg.points)).toBeGreaterThan(5900);
    expect(leg.points.some((p) => near(p, at(500, -2500), 10))).toBe(true);
  });

  it('snaps a leg far too long for close squares, town to town (used to draw straight)', async () => {
    // 40 km of highway with a bend, taps at each end.
    const world = [road([[0, 0], [20_000, 4000], [40_000, 0]], { cls: 'primary', cost: 1.4 }), road([[10_000, -5000], [10_000, 5000]], { cls: 'minor' })];
    const a = at(0, 0), b = at(40_000, 0);
    expect(tilesForLeg(a, b)).toBeNull();
    const { load, read } = squares(world);
    const leg = (await findLeg(a, b, 30, load, 'roads'))!;
    expect(leg).not.toBeNull();
    expect(leg.points.some((p) => near(p, at(20_000, 4000), 30))).toBe(true);
    // The close squares it read follow the road, not the whole 40 km box.
    const close = read.filter((t) => t.z === 14);
    expect(close.length).toBeGreaterThan(20);
    expect(close.length).toBeLessThanOrEqual(160);
  });

  it('still draws straight when the lines never meet', async () => {
    const world = [road([[0, 0], [800, 0]]), road([[0, 600], [800, 600]])];
    const { load } = squares(world);
    expect(await findLeg(at(0, 0), at(0, 600), 30, load)).toBeNull();
  });

  it('still draws straight when a tap is nowhere near a line', async () => {
    const { load } = squares([road([[0, 0], [800, 0]])]);
    expect(await findLeg(at(0, 0), at(400, 900), 30, load)).toBeNull();
  });
});

describe('squares along a way', () => {
  it('leaves no gap along a long straight stretch', () => {
    const a = at(0, 0), b = at(30_000, 0);
    const tiles = tilesAlong([a, b], 14, 0);
    const xs = tiles.map((t) => t.x).sort((p, q) => p - q);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(1);
    expect(xs[0]).toBe(tileFor(a, 14).x);
    expect(xs[xs.length - 1]).toBe(tileFor(b, 14).x);
  });
});

describe('real OpenStreetMap squares', () => {
  // A ranch road west of Leakey, Texas, that bends out of the box round two taps 400 m apart.
  const dir = join(__dirname, 'fixtures');
  const load = async (tiles: Tile[]) =>
    tiles.flatMap((t) => {
      const file = join(dir, `${t.z}_${t.x}_${t.y}.pbf`);
      return existsSync(file) ? decodeRoadLines(new Uint8Array(readFileSync(file)), t) : [];
    });
  const a = { lat: 29.735958, lng: -99.761331 };
  const b = { lat: 29.735924, lng: -99.765627 };

  it('used to draw this leg straight, and now follows the road', async () => {
    expect(routeAlongTrails(await load(tilesForLeg(a, b)!), a, b, 60)).toBeNull();
    for (const profile of ['trails', 'roads'] as const) {
      const leg = (await findLeg(a, b, 60, load, profile))!;
      expect(leg).not.toBeNull();
      expect(near(leg.from, a, 2) && near(leg.to, b, 2)).toBe(true);
      expect(lineLengthM(leg.points)).toBeGreaterThan(distanceM(a, b));
    }
  });
});
