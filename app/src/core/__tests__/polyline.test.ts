import { describe, expect, it } from 'vitest';

import { decodePolyline, encodePolyline } from '../polyline';

describe('encoded polylines', () => {
  it('matches the reference example', () => {
    const pts = [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }];
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(pts);
  });
  it('round-trips a trail to about a meter', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ lat: 30.6 + i * 0.00037, lng: -98.15 - i * 0.00051 }));
    const back = decodePolyline(encodePolyline(pts));
    expect(back).toHaveLength(50);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(back[i].lat - pts[i].lat)).toBeLessThan(1e-5);
      expect(Math.abs(back[i].lng - pts[i].lng)).toBeLessThan(1e-5);
    }
  });
  it('ignores a cut-off tail and empty input', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline('_p~iF')).toEqual([]);
  });
});
