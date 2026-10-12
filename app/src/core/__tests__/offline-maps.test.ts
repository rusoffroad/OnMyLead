import { describe, expect, it } from 'vitest';
import {
  areaLayerPlan, boxesOverlap, boxMiles, countInBox, finishedStatus, formatBoxMiles, formatBytes, layersFor, LAYER_ZOOMS,
  MAX_TILES_PER_LAYER, planArea, planRide, rideLayerPlan, statusLine, tileKey, tilesToRemove, type OfflineMap,
} from '../offline-maps';
import { boxAround, tilesInBox } from '../trails';

const moab = { lat: 38.57, lng: -109.55 };
const smallBox = boxAround([moab], 4)!; // about 8 x 8 miles
const hugeBox = boxAround([moab], 60)!;

describe('layers', () => {
  it('maps the three choices to the four map services', () => {
    expect(layersFor(['satellite', 'topo', 'trails'])).toEqual(['imagery', 'topo', 'mvum', 'blm', 'osm']);
    expect(layersFor(['trails'])).toEqual(['mvum', 'blm', 'osm']);
    expect(layersFor([])).toEqual([]);
  });
});

describe('area downloads', () => {
  it('counts squares without listing them', () => {
    for (const z of [8, 12, 15]) expect(countInBox(smallBox, z)).toBe(tilesInBox(smallBox, z).length);
  });

  it('saves a small area all the way to the sharpest zoom', () => {
    const p = areaLayerPlan(smallBox, 'imagery')!;
    expect(p.maxZ).toBe(LAYER_ZOOMS.imagery.max);
    expect(Math.min(...p.tiles.map((t) => t.z))).toBe(LAYER_ZOOMS.imagery.min);
    expect(p.tiles.length).toBeLessThanOrEqual(MAX_TILES_PER_LAYER);
    const trails = areaLayerPlan(smallBox, 'mvum')!;
    expect(Math.min(...trails.tiles.map((t) => t.z))).toBe(9);
    expect(trails.maxZ).toBe(15);
  });

  it('drops the closest zooms first when an area is big, and refuses one that is too big', () => {
    const mid = boxAround([moab], 14)!;
    const p = areaLayerPlan(mid, 'imagery')!;
    expect(p.maxZ).toBeLessThan(16);
    expect(p.maxZ).toBeGreaterThanOrEqual(14);
    expect(p.tiles.length).toBeLessThanOrEqual(MAX_TILES_PER_LAYER);
    expect(areaLayerPlan(hugeBox, 'imagery')).toBeNull();
  });

  it('estimates the whole download and names what is too big', () => {
    const plan = planArea(smallBox, ['satellite', 'trails']);
    expect(plan.layers.map((l) => l.layer)).toEqual(['imagery', 'mvum', 'blm', 'osm']);
    expect(plan.tiles).toBe(plan.layers.reduce((n, l) => n + l.tiles.length, 0));
    expect(plan.bytes).toBeGreaterThan(0);
    expect(plan.tooBig).toEqual([]);
    expect(planArea(hugeBox, ['topo']).tooBig).toEqual(['topo']);
  });
});

describe('ride downloads', () => {
  const route = [moab, { lat: 38.7, lng: -109.3 }, { lat: 38.9, lng: -109.4 }];

  it('saves the box wide and a band along the route close in', () => {
    const p = rideLayerPlan(route, 'imagery')!;
    expect(p.maxZ).toBe(16);
    const keys = p.tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    // At zoom 16 only a band is saved, far fewer squares than the whole box.
    const box = boxAround(route, 3)!;
    expect(p.tiles.filter((t) => t.z === 16).length).toBeLessThan(countInBox(box, 16) / 5);
  });

  it('plans nothing without a route', () => {
    expect(planRide([], ['satellite']).tiles).toBe(0);
    expect(planRide(route, ['satellite', 'topo', 'trails']).layers).toHaveLength(5);
  });
});

describe('words for the screens', () => {
  it('formats sizes', () => {
    expect(formatBytes(800)).toBe('1 KB');
    expect(formatBytes(4_200_000)).toBe('4.2 MB');
    expect(formatBytes(142_000_000)).toBe('142 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
  });

  it('measures a box in miles', () => {
    const { wide, tall } = boxMiles(smallBox);
    expect(tall).toBeCloseTo(8, 0);
    expect(wide).toBeCloseTo(8, 0);
    expect(formatBoxMiles(smallBox)).toBe('8 × 8 Miles');
  });

  it('tells overlapping boxes apart', () => {
    expect(boxesOverlap(smallBox, hugeBox)).toBe(true);
    expect(boxesOverlap(smallBox, boxAround([{ lat: 45, lng: -110 }], 1)!)).toBe(false);
  });

  it('describes a download', () => {
    const m: OfflineMap = {
      id: 'a', name: 'Moab', kind: 'area', box: smallBox, choices: ['satellite'], status: 'downloading',
      total: 200, saved: 90, failed: 10, bytes: 2_000_000, createdAt: '2026-10-12T00:00:00Z',
    };
    expect(statusLine(m)).toBe('Downloading, 50%');
    expect(statusLine({ ...m, status: 'paused' })).toBe('Paused at 50%');
    expect(statusLine({ ...m, status: 'ready' })).toBe('2.0 MB');
    expect(statusLine({ ...m, status: 'partial' })).toBe('2.0 MB, 10 Pieces Missing');
    expect(finishedStatus(1000, 5)).toBe('ready');
    expect(finishedStatus(1000, 100)).toBe('partial');
  });
});

describe('deleting', () => {
  it('keeps squares another download still uses', () => {
    const t = { z: 12, x: 1, y: 2 };
    const mine = [tileKey('imagery', t), tileKey('topo', t)];
    expect(tilesToRemove(mine, [tileKey('topo', t)])).toEqual(['imagery/12/1/2']);
  });
});
