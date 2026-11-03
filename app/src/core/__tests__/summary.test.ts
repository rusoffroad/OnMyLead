import { describe, expect, it } from 'vitest';
import { metersToMiles } from '../geo';
import {
  cleanTrack, downsample, dropBounces, dropRough, dropSpikes, elevationGainM, formatDuration, formatMiles, haversineM, parseTrack, projectRoute, rideCardLines,
  rideCardText, smoothTrack, summarizeTrack, type TrackPoint,
} from '../summary';

const T0 = 1_760_000_000;
const pt = (lat: number, lng: number, t: number, speedMps: number | null = null, altitudeM: number | null = null, accuracyM: number | null = null): TrackPoint => ({
  lat, lng, t, speedMps, altitudeM, accuracyM,
});
/** A straight drive north: `n` fixes, 0.001 deg (about 111 m) apart, every `dt` seconds. */
const drive = (n: number, dt = 10, from = 0) =>
  Array.from({ length: n }, (_, i) => pt(38.5 + (from + i) * 0.001, -109.5, T0 + (from + i) * dt, 111.2 / dt));

describe('haversine', () => {
  it('measures a known distance (one degree of latitude is about 111.2 km)', () => {
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
    // Moab to Green River, UT: about 71 km as the crow flies.
    expect(haversineM({ lat: 38.5733, lng: -109.5498 }, { lat: 38.9953, lng: -110.1585 }) / 1000).toBeCloseTo(70.6, 0);
    expect(haversineM({ lat: 38.5, lng: -109.5 }, { lat: 38.5, lng: -109.5 })).toBe(0);
  });
});

describe('parseTrack', () => {
  it('reads stored points, skips junk, sorts and dedupes by time', () => {
    const raw = [
      [-109.5, 38.502, T0 + 20, 11],
      [-109.5, 38.5, T0, null, 1200],
      ['bad', 38.5, T0 + 5],
      [-109.5, 38.501, T0 + 10, 11],
      [-109.5, 38.501, T0 + 10, 11],
      [-200, 38.5, T0 + 30],
      null,
    ];
    const pts = parseTrack(raw);
    expect(pts.map((p) => p.t)).toEqual([T0, T0 + 10, T0 + 20]);
    expect(pts[0]).toEqual({ lng: -109.5, lat: 38.5, t: T0, speedMps: null, altitudeM: 1200, accuracyM: null });
    expect(parseTrack('nope')).toEqual([]);
  });
});

describe('GPS cleanup', () => {
  it('drops a spike that would need an impossible speed', () => {
    const pts = [...drive(5), pt(39.5, -109.5, T0 + 45), ...drive(5, 10, 5)].sort((a, b) => a.t - b.t);
    const clean = dropSpikes(pts);
    expect(clean).toHaveLength(10);
    expect(clean.every((p) => p.lat < 39)).toBe(true);
  });

  it('smooths jitter but keeps straight lines and endpoints', () => {
    const line = drive(11);
    const smooth = smoothTrack(line);
    expect(smooth[0]).toEqual(line[0]);
    expect(smooth[10]).toEqual(line[10]);
    for (let i = 0; i < line.length; i++) expect(smooth[i].lat).toBeCloseTo(line[i].lat, 9);

    const zigzag = Array.from({ length: 21 }, (_, i) => pt(38.5 + i * 0.001, -109.5 + (i % 2 ? 0.0003 : -0.0003), T0 + i * 10));
    const raw = zigzag.slice(1).reduce((s, p, i) => s + haversineM(zigzag[i], p), 0);
    const sm = smoothTrack(zigzag);
    const smoothed = sm.slice(1).reduce((s, p, i) => s + haversineM(sm[i], p), 0);
    expect(smoothed).toBeLessThan(raw * 0.95);
  });
});

describe('summarizeTrack', () => {
  it('measures distance, moving time and speeds for a steady drive', () => {
    const s = summarizeTrack(drive(11));
    expect(s.distanceM).toBeCloseTo(1112, -1);
    expect(s.movingTimeSec).toBe(100);
    expect(s.elapsedSec).toBe(100);
    expect(s.avgMovingSpeedMps).toBeCloseTo(11.1, 0);
    expect(s.maxSpeedMps).toBeCloseTo(11.1, 0);
    expect(s.elevationGainM).toBeNull();
    expect(s.route).toHaveLength(11);
  });

  it('does not count a parked phone wandering a few meters', () => {
    const parked = Array.from({ length: 60 }, (_, i) => pt(38.6 + (i % 3) * 0.00002, -109.5 + (i % 2) * 0.00002, T0 + i * 10, 0));
    const s = summarizeTrack(parked);
    expect(s.distanceM).toBe(0);
    expect(s.movingTimeSec).toBe(0);
    expect(s.elapsedSec).toBe(590);
  });

  it('leaves a lunch stop out of moving time', () => {
    const before = drive(6);
    const stopAt = before[5];
    const stop = Array.from({ length: 30 }, (_, i) => pt(stopAt.lat + (i % 2) * 0.00001, stopAt.lng, stopAt.t + (i + 1) * 60, 0));
    const after = drive(6, 10).map((p, i) => pt(stopAt.lat + (i + 1) * 0.001, -109.5, stop[29].t + (i + 1) * 10, 11));
    const s = summarizeTrack([...before, ...stop, ...after]);
    expect(metersToMiles(s.distanceM)).toBeCloseTo(metersToMiles(11 * 111.2), 1);
    expect(s.movingTimeSec).toBeLessThan(200);
    expect(s.elapsedSec).toBeGreaterThan(1800);
  });

  it('ignores implausible reported speeds and spikes for top speed', () => {
    const pts = drive(11);
    pts[4] = { ...pts[4], speedMps: 250 };
    expect(summarizeTrack(pts).maxSpeedMps).toBeCloseTo(11.1, 0);
  });

  it('adds up real climbs and ignores altitude noise', () => {
    expect(elevationGainM([100, 102, 101, 103, 100, 102])).toBe(0);
    expect(elevationGainM([100, 110, 105, 120])).toBe(25);
    const climb = drive(11).map((p, i) => ({ ...p, altitudeM: 1200 + i * 10 }));
    expect(summarizeTrack(climb).elevationGainM).toBeCloseTo(100, 0);
  });

  it('handles empty and single-point tracks', () => {
    expect(summarizeTrack([]).distanceM).toBe(0);
    expect(summarizeTrack([pt(38.5, -109.5, T0)]).startedAt).toBe(T0);
  });
});

describe('formatting and drawing', () => {
  it('formats durations and miles', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2 h 05 min');
    expect(formatMiles(1609.344 * 4.24)).toBe('4.2 mi');
    expect(formatMiles(1609.344 * 42.6)).toBe('43 mi');
  });

  it('thins long routes but keeps both ends', () => {
    const many = Array.from({ length: 1000 }, (_, i) => i);
    const few = downsample(many, 10);
    expect(few).toHaveLength(10);
    expect(few[0]).toBe(0);
    expect(few[9]).toBe(999);
  });

  it('fits a route in the box with north up', () => {
    const xy = projectRoute([{ lat: 38.5, lng: -109.5 }, { lat: 38.6, lng: -109.5 }], 200, 100, 10);
    expect(xy[0].y).toBeCloseTo(90);
    expect(xy[1].y).toBeCloseTo(10);
    expect(xy[0].x).toBeCloseTo(100);
    for (const p of projectRoute(drive(30).map(({ lat, lng }) => ({ lat, lng })), 300, 160)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(160);
    }
    expect(projectRoute([{ lat: 1, lng: 1 }], 100, 100)).toEqual([{ x: 50, y: 50 }]);
  });
});

describe('ride card', () => {
  it('shows the ride, date, distance and rider count only', () => {
    const card = { rideName: 'Moab Saturday', dateLabel: 'Sat, Oct 10', distanceMiles: 42.6, riderCount: 6 };
    expect(rideCardLines(card).stats).toEqual(['43 miles', '6 riders']);
    expect(rideCardLines({ ...card, distanceMiles: null, riderCount: 1 }).stats).toEqual(['1 rider']);
    const text = rideCardText(card);
    expect(text).toBe('Moab Saturday · Sat, Oct 10\n43 miles · 6 riders\nOnMyLead, presented by RUS Offroad');
    expect(text).not.toMatch(/\d+\.\d{3,}/); // never coordinates
  });
});

// The 1.0.3 bug: a 4 mile test ride showed about 60 miles on the ride summary.
describe('ride miles match the ride', () => {
  /** About 4 miles north at 11 m/s, one fix every 10 s (590 fixes is about 6.4 km). */
  const fourMiles = () => drive(59, 10);
  const realMiles = () => metersToMiles(summarizeTrack(fourMiles()).distanceM);

  it('a clean drive still measures right', () => {
    expect(realMiles()).toBeCloseTo(metersToMiles(58 * 111.2), 1);
  });

  it('does not join points left over from an earlier ride 30 miles away', () => {
    // Yesterday's leftover queue: a few fixes near home, hours before this ride.
    const home = Array.from({ length: 5 }, (_, i) => pt(38.07 + i * 0.001, -109.5, T0 - 20_000 + i * 10, 11));
    const s = summarizeTrack([...home, ...fourMiles()]);
    // Only the leftover fixes' own 444 m counts, not the 30 miles between them and this ride.
    expect(metersToMiles(s.distanceM)).toBeCloseTo(realMiles() + metersToMiles(4 * 111.2), 1);
  });

  it('skips a stale first fix from somewhere else instead of the whole ride', () => {
    const stale = pt(38.2, -109.5, T0 - 30, null); // 33 km south, 30 s before the first real fix
    const clean = dropSpikes([stale, ...fourMiles()]);
    expect(clean).toHaveLength(59);
    expect(clean[0].lat).toBeCloseTo(38.5, 6);
    expect(metersToMiles(summarizeTrack([stale, ...fourMiles()]).distanceM)).toBeCloseTo(realMiles(), 1);
  });

  it('does not count a phone bouncing 140 m every 2 seconds', () => {
    // Parked for 30 minutes with a rough fix: every other fix jumps 140 m east and back (70 m/s).
    const bounce = Array.from({ length: 900 }, (_, i) => pt(38.6, -109.5 + (i % 2) * 0.0016, T0 + i * 2, 0, null, 30));
    expect(metersToMiles(summarizeTrack(bounce).distanceM)).toBeLessThan(0.1);
    // 100 m bounces are under the spike speed (50 m/s), so the bounce rule is what stops them.
    const softer = Array.from({ length: 900 }, (_, i) => pt(38.6, -109.5 + (i % 2) * 0.00115, T0 + i * 2, null));
    expect(dropBounces(softer).filter((p) => p.lng !== -109.5).length).toBeLessThanOrEqual(1); // only a final fix can't be checked
    expect(metersToMiles(summarizeTrack(softer).distanceM)).toBeLessThan(0.1);
  });

  it('ignores fixes the phone reports as rough', () => {
    const rough = fourMiles().map((p, i) => (i % 3 === 1 ? { ...p, lat: p.lat + 0.01, accuracyM: 1500 } : { ...p, accuracyM: 8 }));
    expect(dropRough(rough)).toHaveLength(59 - 20);
    // The last fix (index 58) is one of the rough ones, so the ride ends one fix early.
    expect(metersToMiles(summarizeTrack(rough).distanceM)).toBeCloseTo(metersToMiles(57 * 111.2), 1);
  });

  it('does not count a slow wander smaller than the fixes\' own accuracy', () => {
    const parked = Array.from({ length: 120 }, (_, i) => pt(38.6 + (i % 2) * 0.0004, -109.5, T0 + i * 30, null, null, 60));
    expect(summarizeTrack(parked).distanceM).toBe(0);
  });

  it('does not count a gap with location off as a straight line', () => {
    const first = drive(20, 10);
    const later = drive(20, 10, 0).map((p) => ({ ...p, lat: p.lat + 0.3, t: p.t + 3600 }));
    const s = summarizeTrack([...first, ...later]);
    expect(metersToMiles(s.distanceM)).toBeCloseTo(metersToMiles(38 * 111.2), 1);
  });

  it('skips a jump the phone\'s own speed says did not happen', () => {
    const pts = [pt(38.6, -109.5, T0, 0), pt(38.6, -109.5, T0 + 15, 0), pt(38.603, -109.5, T0 + 30, 0), pt(38.603, -109.5, T0 + 45, 0)];
    expect(summarizeTrack(pts, { smoothWindow: 1 }).distanceM).toBe(0);
  });

  it('keeps a real stop, U-turn and climb at crawling speed', () => {
    const crawl = Array.from({ length: 40 }, (_, i) => pt(38.6 + i * 0.00025, -109.5, T0 + i * 60, 0.5, null, 5)); // 28 m a minute
    expect(summarizeTrack(crawl).distanceM).toBeGreaterThan(900);
    const out = drive(10, 10);
    const back = out.slice(0, 9).reverse().map((p, i) => ({ ...p, t: out[9].t + (i + 1) * 10 }));
    expect(cleanTrack([...out, ...back])).toHaveLength(19);
  });

  it('reads the stored accuracy, and tracks from older builds without it', () => {
    const [a, b] = parseTrack([[-109.5, 38.5, T0, 3, 1200, 12], [-109.5, 38.501, T0 + 10, 3]]);
    expect(a.accuracyM).toBe(12);
    expect(b.accuracyM).toBeNull();
  });
});
