import { describe, expect, it } from 'vitest';
import { metersToMiles } from '../geo';
import {
  downsample, dropSpikes, elevationGainM, formatDuration, formatMiles, haversineM, parseTrack, projectRoute, rideCardLines,
  rideCardText, smoothTrack, summarizeTrack, type TrackPoint,
} from '../summary';

const T0 = 1_760_000_000;
const pt = (lat: number, lng: number, t: number, speedMps: number | null = null, altitudeM: number | null = null): TrackPoint => ({
  lat, lng, t, speedMps, altitudeM,
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
    expect(pts[0]).toEqual({ lng: -109.5, lat: 38.5, t: T0, speedMps: null, altitudeM: 1200 });
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
