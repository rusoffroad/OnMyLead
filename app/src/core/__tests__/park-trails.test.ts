import { describe, expect, it } from 'vitest';

import { encodePolyline } from '../polyline';
import {
  drawableParkTrails, midpoint, parkLevelLabel, parkPieces, parkSummaryLine, parkTrailColor, parkTrailLabels, parkTrailLength, parksInView,
  parseParkSummary, parseParkTrail, parseParkTrails, PARK_LEVEL_COLORS, type ParkTrail,
} from '../park-trails';
import { TRAIL_INK } from '../trails';

const line = (n: number, lat = 30.6, lng = -98.15) => Array.from({ length: n }, (_, i) => ({ lat: lat + i * 0.001, lng: lng + i * 0.001 }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  park_osm_id: 331218708,
  park_name: 'Hidden Falls Adventure Park',
  park_state: 'TX',
  park_website: 'https://www.hiddenfallsadventurepark.com',
  source: 'osm',
  source_id: 123,
  name: 'Carnage Canyon',
  level: 5,
  kind: 'trail',
  closed: false,
  oneway: false,
  surface: 'rock',
  route_enc: encodePolyline(line(4)),
  length_m: 480,
  attribution: '© OpenStreetMap contributors',
  box: [30.6, -98.15, 30.603, -98.147],
  ...over,
});

describe('park trail rows', () => {
  it('reads a row and decodes its line', () => {
    const t = parseParkTrail(row())!;
    expect(t.parkName).toBe('Hidden Falls Adventure Park');
    expect(t.level).toBe(5);
    expect(t.points).toHaveLength(4);
    expect(t.points[0].lat).toBeCloseTo(30.6, 5);
    expect(t.box).toEqual({ minLat: 30.6, minLng: -98.15, maxLat: 30.603, maxLng: -98.147 });
  });
  it('drops rows that are not usable and odd levels', () => {
    expect(parseParkTrail(null)).toBeNull();
    expect(parseParkTrail(row({ route_enc: '' }))).toBeNull();
    expect(parseParkTrail(row({ box: [1, 2] }))).toBeNull();
    expect(parseParkTrail(row({ level: 9 }))!.level).toBeNull();
    expect(parseParkTrail(row({ kind: 'bogus' }))!.kind).toBe('trail');
    expect(parseParkTrails([row(), 'x', row({ id: null })])).toHaveLength(1);
  });
  it('reads a park summary', () => {
    const p = parseParkSummary({ park_osm_id: 1, park_name: 'Katemcy Rocks', park_state: 'TX', park_website: null, trail_count: 23, trail_m: 16200, center: { lat: 30.78, lng: -99.33 }, box: [30.7, -99.4, 30.8, -99.3] })!;
    expect(p.trailCount).toBe(23);
    expect(parkSummaryLine(p)).toBe('23 trails · 10.1 mi');
    expect(parseParkSummary({ park_osm_id: 1 })).toBeNull();
  });
});

describe('how park trails are drawn', () => {
  const t = (over: Partial<ParkTrail>): ParkTrail => ({ ...parseParkTrail(row())!, ...over });
  it('colors by the park level, roads white, closed red, unrated amber', () => {
    expect(parkTrailColor(t({ level: 1 }))).toBe(PARK_LEVEL_COLORS[1]);
    expect(parkTrailColor(t({ level: 2 }))).toBe(PARK_LEVEL_COLORS[1]);
    expect(parkTrailColor(t({ level: 3 }))).toBe(PARK_LEVEL_COLORS[3]);
    expect(parkTrailColor(t({ level: 5 }))).toBe(PARK_LEVEL_COLORS[5]);
    expect(parkTrailColor(t({ level: null }))).toBe(TRAIL_INK.trail);
    expect(parkTrailColor(t({ level: null, kind: 'road' }))).toBe(TRAIL_INK.road);
    expect(parkTrailColor(t({ level: 3, closed: true }))).toBe(TRAIL_INK.closed);
  });
  it('labels the level, the kind, or Closed', () => {
    expect(parkLevelLabel(t({ level: 3 }))).toBe('Level 3 of 5');
    expect(parkLevelLabel(t({ level: null }))).toBe('Trail');
    expect(parkLevelLabel(t({ level: null, kind: 'road' }))).toBe('Park Road');
    expect(parkLevelLabel(t({ level: 2, closed: true }))).toBe('Closed');
  });
  it('writes lengths in feet or miles', () => {
    expect(parkTrailLength(120)).toBe('394 ft');
    expect(parkTrailLength(4800)).toBe('3.0 mi');
    expect(parkTrailLength(4800, true)).toBe('4.8 km');
  });
  it('keeps the longest lines when there are too many, fewer when far out', () => {
    const many = Array.from({ length: 10 }, (_, i) => t({ id: `t${i}`, lengthM: i * 100 }));
    expect(drawableParkTrails(many, 14, 4).map((x) => x.id)).toEqual(['t9', 't8', 't7', 't6']);
    expect(drawableParkTrails(many, 11, 4)).toHaveLength(2);
    expect(drawableParkTrails(many, 11, 20)).toBe(many);
  });
  it('pieces carry the color and kind for every map', () => {
    const p = parkPieces([t({ level: 4, kind: 'trail' }), t({ id: 'r', kind: 'road', level: null })]);
    expect(p[0]).toMatchObject({ key: 'park-aaaaaaaa-0000-4000-8000-000000000001', color: PARK_LEVEL_COLORS[4], road: false, closed: false });
    expect(p[1]).toMatchObject({ key: 'park-r', color: TRAIL_INK.road, road: true });
  });
});

describe('park trail labels', () => {
  const t = (over: Partial<ParkTrail>): ParkTrail => ({ ...parseParkTrail(row())!, ...over });
  it('tags each named trail once, longest first, at the middle of the line', () => {
    const labels = parkTrailLabels([t({ id: 'a', name: 'Hog Alley', lengthM: 100 }), t({ id: 'b', name: 'Hog Alley', lengthM: 900 }), t({ id: 'c', name: null }), t({ id: 'd', name: 'Revenge', closed: true, points: line(3, 31, -97) })], 10);
    expect(labels.map((l) => [l.key, l.name, l.closed])).toEqual([['b', 'Hog Alley', false], ['d', 'Revenge', true]]);
    expect(labels[0].at.lat).toBeCloseTo(30.6015, 4);
  });
  it('skips tags that would land on another', () => {
    const labels = parkTrailLabels([t({ id: 'a', name: 'One', lengthM: 500 }), t({ id: 'b', name: 'Two', lengthM: 400 })], 10, { lat: 0.01, lng: 0.01 });
    expect(labels.map((l) => l.name)).toEqual(['One']);
  });
  it('finds the middle by distance along the line', () => {
    expect(midpoint([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 10 }])).toEqual({ lat: 0, lng: 5 });
    expect(midpoint([{ lat: 2, lng: 3 }])).toEqual({ lat: 2, lng: 3 });
  });
  it('lists the parks whose box crosses the view', () => {
    const p = parseParkSummary({ park_osm_id: 1, park_name: 'P', trail_count: 1, trail_m: 1, center: { lat: 30.6, lng: -98.1 }, box: [30.5, -98.2, 30.7, -98.0] })!;
    expect(parksInView([p], { minLat: 30.65, minLng: -98.05, maxLat: 31, maxLng: -97 })).toHaveLength(1);
    expect(parksInView([p], { minLat: 31, minLng: -98.05, maxLat: 32, maxLng: -97 })).toHaveLength(0);
  });
});
