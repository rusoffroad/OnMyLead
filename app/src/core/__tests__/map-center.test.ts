import { describe, expect, it } from 'vitest';

import { cameraCenterFor, MIN_OPEN_MAP, openMapCenter } from '../map-center';

describe('openMapCenter', () => {
  const size = { width: 400, height: 800 };

  it('is the middle of the map with nothing over it', () => {
    expect(openMapCenter(size, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual({ x: 200, y: 400 });
  });

  it('is the middle of the map between the top bar and the bottom panel (phone)', () => {
    expect(openMapCenter(size, { top: 100, right: 0, bottom: 300, left: 0 })).toEqual({ x: 200, y: 300 });
  });

  it('sits between the riders list and the panel (tablet)', () => {
    const tablet = { width: 1200, height: 800 };
    expect(openMapCenter(tablet, { top: 60, right: 400, bottom: 20, left: 300 })).toEqual({ x: 550, y: 420 });
  });

  it('falls back to the whole map when the panels leave too little room', () => {
    expect(openMapCenter(size, { top: 300, right: 0, bottom: 800 - 300 - (MIN_OPEN_MAP - 1), left: 0 }).y).toBe(400);
    expect(openMapCenter(size, { top: 0, right: 200, bottom: 0, left: 150 }).x).toBe(200);
  });
});

describe('cameraCenterFor', () => {
  it('is the rider when the open map is the whole map', () => {
    const p = { lat: 39.5, lng: -105.2 };
    const c = cameraCenterFor(p, { lat: 40, lng: -106 }, { lat: 40, lng: -106 });
    expect(c.lat).toBeCloseTo(p.lat, 9);
    expect(c.lng).toBeCloseTo(p.lng, 9);
  });

  it('moves the camera south when the open map sits above the middle', () => {
    // The open middle is north of the map middle, so the camera goes south of the rider.
    const c = cameraCenterFor({ lat: 39.5, lng: -105.2 }, { lat: 39.5, lng: -105.2 }, { lat: 39.51, lng: -105.2 });
    expect(c.lat).toBeCloseTo(39.49, 6);
    expect(c.lng).toBeCloseTo(-105.2, 6);
  });

  it('moves the camera west when the open map sits right of the middle', () => {
    const c = cameraCenterFor({ lat: 39.5, lng: -105.2 }, { lat: 39.5, lng: -105.3 }, { lat: 39.5, lng: -105.25 });
    expect(c.lng).toBeCloseTo(-105.25, 6);
  });

  it('shrinks the north-south step for a rider farther north than the map now is', () => {
    const near = cameraCenterFor({ lat: 30, lng: 0 }, { lat: 30, lng: 0 }, { lat: 30.01, lng: 0 });
    const far = cameraCenterFor({ lat: 60, lng: 0 }, { lat: 30, lng: 0 }, { lat: 30.01, lng: 0 });
    expect(30 - near.lat).toBeCloseTo(0.01, 6);
    expect(60 - far.lat).toBeCloseTo(0.01 * (Math.cos(Math.PI / 3) / Math.cos(Math.PI / 6)), 6);
  });

  it('wraps across the date line', () => {
    const c = cameraCenterFor({ lat: 0, lng: 179.99 }, { lat: 0, lng: 0 }, { lat: 0, lng: -0.05 });
    expect(c.lng).toBeCloseTo(-179.96, 6);
  });
});
