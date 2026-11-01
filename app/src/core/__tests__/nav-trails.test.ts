import { describe, expect, it } from 'vitest';

import { distanceM } from '../geo';
import {
  acceptFix, canRate, clock, coveredM, EMPTY_DETAILS, feetOrMiles, followProgress, fromLineString, hidesTrail, lineForSharing, mappedBy,
  newTrailId, parsePublicTrail, parsePublicTrails, ratingSummary, shareProblems, syncShareStates, toLineString, toTrackPoint, trackStats,
  trailAsRoute, trimEnds, unseenHidden, type LocalTrail, type TrackPoint,
} from '../nav-trails';
import { cumulativeM, lineLengthM } from '../route';

// A line due north from Moab: 1 m is about 1 / 111_195 degrees of latitude.
const start = { lat: 38.5733, lng: -109.5498 };
const north = (m: number, eastM = 0) => ({
  lat: start.lat + m / 111_195,
  lng: start.lng + eastM / (111_195 * Math.cos((start.lat * Math.PI) / 180)),
});
/** A track north at `mps`, one point every `stepM`, altitude from `alt`. */
const track = (lengthM: number, stepM = 10, mps = 5, alt: (i: number) => number | null = () => 1500): TrackPoint[] =>
  Array.from({ length: Math.floor(lengthM / stepM) + 1 }, (_, i) => {
    const p = north(i * stepM);
    return [p.lat, p.lng, alt(i), 1_700_000_000_000 + ((i * stepM) / mps) * 1000];
  });

const trail = (over: Partial<LocalTrail> = {}): LocalTrail => ({
  id: 'tabc',
  details: { ...EMPTY_DETAILS, name: 'Hidden Canyon', difficulty: 'moderate', vehicles: ['sxs_utv'] },
  points: track(2000),
  source: 'recorded',
  photos: [],
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  shared: null,
  ...over,
});

describe('recording', () => {
  const fix = (m: number, t: number, accuracy: number | null = 5) => ({ ...north(m), altitude: 1500, accuracy, timestamp: t });

  it('takes the first good fix and then one every few meters', () => {
    expect(acceptFix(undefined, fix(0, 0))).toBe(true);
    const last = toTrackPoint(fix(0, 0));
    expect(acceptFix(last, fix(2, 1000))).toBe(false);
    expect(acceptFix(last, fix(8, 2000))).toBe(true);
  });

  it('skips poor fixes and GPS jumps', () => {
    expect(acceptFix(undefined, fix(0, 0, 80))).toBe(false);
    const last = toTrackPoint(fix(0, 0));
    // 2 km in one second.
    expect(acceptFix(last, fix(2000, 1000))).toBe(false);
    expect(acceptFix(last, { ...fix(10, 1000), lat: Number.NaN })).toBe(false);
  });

  it('measures length, time moving and climbing without counting GPS jitter', () => {
    // Up 100 m over the first half with +-2 m of noise, then flat.
    const s = trackStats(track(1000, 10, 5, (i) => (i <= 50 ? 1500 + i * 2 : 1600) + (i % 2 ? 2 : -2)));
    expect(s.lengthM).toBeCloseTo(1000, -1);
    expect(s.durationS).toBe(200);
    expect(s.movingS).toBe(200);
    expect(s.gainM).toBeGreaterThan(90);
    expect(s.gainM).toBeLessThan(110);
    expect(s.highM).toBe(1602);
  });

  it('has no elevation when the phone gave none, and no time for one point', () => {
    const s = trackStats(track(100, 10, 5, () => null));
    expect(s.gainM).toBeNull();
    expect(s.highM).toBeNull();
    expect(trackStats(track(0)).durationS).toBe(0);
  });

  it('counts a stop as not moving', () => {
    const pts = track(100);
    const last = pts[pts.length - 1];
    pts.push([last[0], last[1], last[2], last[3] + 600_000]);
    const s = trackStats(pts);
    expect(s.durationS - s.movingS).toBe(600);
  });
});

describe('sharing keeps the start private', () => {
  it('cuts the first and last 200 m, mid-segment', () => {
    const line = [north(0), north(1000)];
    const t = trimEnds(line);
    expect(distanceM(t[0], north(200))).toBeLessThan(0.5);
    expect(distanceM(t[t.length - 1], north(800))).toBeLessThan(0.5);
    expect(lineLengthM(t)).toBeCloseTo(600, 0);
  });

  it('never includes a recorded point from the trimmed ends', () => {
    const shared = lineForSharing(track(2000));
    expect(shared.every((p) => distanceM(p, start) >= 199)).toBe(true);
    expect(distanceM(shared[shared.length - 1], north(2000))).toBeGreaterThan(199);
  });

  it('refuses a trail too short to share once trimmed', () => {
    expect(trimEnds([north(0), north(300)])).toEqual([]);
    expect(lineForSharing(track(550))).toEqual([]);
    expect(shareProblems(trail({ points: track(550) }))).toEqual([expect.stringContaining('too short')]);
  });

  it('needs a name, difficulty and a vehicle type', () => {
    expect(shareProblems(trail())).toEqual([]);
    const problems = shareProblems(trail({ details: { ...EMPTY_DETAILS, name: ' ' } }));
    expect(problems).toEqual(['Give the trail a name.', 'Pick a difficulty.', 'Pick at least one vehicle type.']);
    expect(shareProblems(trail({ details: { ...trail().details, maxWidthIn: 12 } }))).toEqual(['Width limit is 30 to 120 inches.']);
  });

  it('round-trips GeoJSON and drops bad points', () => {
    const line = [north(0), north(500)];
    expect(fromLineString(toLineString(line))).toEqual(line);
    expect(fromLineString({ coordinates: [[0, 0], [500, 1], 'x'] })).toEqual([{ lat: 0, lng: 0 }]);
    expect(fromLineString(null)).toEqual([]);
  });
});

describe('following and rating', () => {
  const line = [north(0), north(2000)];
  const cum = cumulativeM(line);

  it('tells how far to the start, then how far is left', () => {
    const away = followProgress(line, cum, north(-500))!;
    expect(away.onTrail).toBe(false);
    expect(away.toStartM).toBeCloseTo(500, -1);
    const on = followProgress(line, cum, north(1500, 20))!;
    expect(on.onTrail).toBe(true);
    expect(on.remainingM).toBeCloseTo(500, -1);
    expect(followProgress([north(0)], [0], north(1))).toBeNull();
  });

  it('measures how much of a trail a ride covered', () => {
    const ridden = track(1000).map((p) => ({ lat: p[0], lng: p[1] + 0.0002 }));
    const c = coveredM(line, ridden);
    expect(c).toBeGreaterThan(900);
    expect(c).toBeLessThan(1100);
    expect(coveredM(line, [north(5000)])).toBe(0);
    expect(coveredM(line, [])).toBe(0);
  });

  it('asks for a quarter of the trail, or a kilometer of a long one, before rating', () => {
    expect(canRate(2000, 400)).toBe(false);
    expect(canRate(2000, 500)).toBe(true);
    expect(canRate(20_000, 1000)).toBe(true);
    expect(canRate(0, 0)).toBe(false);
  });

  it('hides a trail on the same rule as the database', () => {
    expect(hidesTrail([1, 2, 5])).toBe(false);
    expect(hidesTrail([1, 2, 1, 5])).toBe(true);
    expect(hidesTrail([1, 1, 1, 5, 5, 5, 5])).toBe(false);
    expect(hidesTrail([1, 2, 5], { minBad: 2, badShare: 0.5 })).toBe(true);
  });

  it('turns a trail into a group ride route', () => {
    const r = trailAsRoute(line, ' Hidden Canyon ');
    expect(r.source).toBe('trail');
    expect(r.name).toBe('Hidden Canyon');
    expect(r.lengthM).toBeCloseTo(2000, -1);
  });
});

describe('public trails', () => {
  const row = {
    id: 'p1', client_id: 'tabc', mine: true, mapper: 'MiaMaps', name: 'Hidden Canyon', difficulty: 'hard', vehicles: ['atv', 'tank'],
    route: { type: 'LineString', coordinates: [[-109.55, 38.57], [-109.54, 38.58]] }, length_m: 1400, photos: ['https://x/a.jpg', 'file:///b.jpg'],
    status: 'hidden', hidden_reason: 'ratings', hidden_seen: false, rating_count: 4, average: '2.3', quality_count: 2, quality: 3.5,
    created_at: '2026-03-04T00:00:00Z',
  };

  it('reads what the server sends, dropping unknown values', () => {
    const t = parsePublicTrail(row)!;
    expect(t.vehicles).toEqual(['atv']);
    expect(t.photos).toEqual(['https://x/a.jpg']);
    expect(t.average).toBe(2.3);
    expect(t.points).toHaveLength(2);
    expect(parsePublicTrail({ ...row, difficulty: 'insane' })).toBeNull();
    expect(parsePublicTrails([row, null, 4])).toHaveLength(1);
    expect(mappedBy(t)).toBe('Mapped by MiaMaps · Mar 2026');
  });

  it('keeps each phone trail in step with the server', () => {
    const server = parsePublicTrail(row)!;
    const [synced, gone, untouched] = syncShareStates(
      [trail(), trail({ id: 'tgone', shared: { ...syncShareStates([trail()], [server])[0].shared! } }), trail({ id: 'tlocal' })],
      [server],
    );
    expect(synced.shared?.status).toBe('hidden');
    expect(gone.shared).toBeNull();
    expect(untouched.shared).toBeNull();
    expect(unseenHidden([synced, gone, untouched]).map((t) => t.id)).toEqual(['tabc']);
  });
});

describe('wording', () => {
  it('formats distance, time and ratings', () => {
    expect(feetOrMiles(30)).toBe('100 ft');
    expect(feetOrMiles(1609.344 * 0.42)).toBe('0.42 mi');
    expect(feetOrMiles(1609.344 * 12.34)).toBe('12.3 mi');
    expect(clock(3912)).toBe('1:05:12');
    expect(clock(724)).toBe('12:04');
    expect(ratingSummary(null, 0)).toBe('No Ratings Yet');
    expect(ratingSummary(4.25, 12)).toBe('4.3 (12)');
  });

  it('makes distinct ids', () => {
    expect(newTrailId(1, () => 0.5)).not.toBe(newTrailId(2, () => 0.5));
    expect(newTrailId()).toMatch(/^t[0-9a-z]+$/);
  });
});

describe('rider trails on the map', () => {
  it('finds the trail under a tap', async () => {
    const { nearestRiderTrail, distanceToLine, paddedBox, boxInside } = await import('../nav-trails');
    const a = { id: 'a', points: [north(0), north(1000)] };
    const b = { id: 'b', points: [north(0, 300), north(1000, 300)] };
    expect(distanceToLine(north(500, 20), a.points)).toBeCloseTo(20, 0);
    expect(nearestRiderTrail(north(500, 20), [a, b], 40)?.id).toBe('a');
    expect(nearestRiderTrail(north(500, 290), [a, b], 40)?.id).toBe('b');
    expect(nearestRiderTrail(north(500, 150), [a, b], 40)).toBeNull();
    const box = paddedBox({ latitude: 38, longitude: -109, latitudeDelta: 0.2, longitudeDelta: 0.2 });
    expect(box.maxLat - box.minLat).toBeCloseTo(0.3, 5);
    expect(boxInside(paddedBox({ latitude: 38.01, longitude: -109, latitudeDelta: 0.1, longitudeDelta: 0.1 }), box)).toBe(true);
    expect(boxInside(paddedBox({ latitude: 39, longitude: -109, latitudeDelta: 0.1, longitudeDelta: 0.1 }), box)).toBe(false);
  });
});

describe('photoPaths', () => {
  it('finds the bucket path of uploaded photos and skips phone files', async () => {
    const { photoPaths } = await import('../nav-trails');
    expect(photoPaths([
      'https://x.supabase.co/storage/v1/object/public/trail-photos/u1/t1/a%20b.jpg?v=2',
      'file:///phone/trail-photos/u1/x.jpg',
      'https://example.com/other.jpg',
    ])).toEqual(['u1/t1/a b.jpg']);
  });
});
