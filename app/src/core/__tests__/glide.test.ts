import { describe, expect, it } from 'vitest';

import {
  easeOut, followCamDurationMs, glideAt, glideDurationMs, GLIDE_MAX_MS, GLIDE_MIN_MS, shouldGlide,
} from '../glide';

const A = { lat: 38.5733, lng: -109.5498 };
// About 111 m north of A.
const B = { lat: 38.5743, lng: -109.5498 };

describe('shouldGlide', () => {
  it('slides a normal step', () => {
    expect(shouldGlide(A, B)).toBe(true);
  });
  it('jumps on the first fix, on jitter, and across miles', () => {
    expect(shouldGlide(null, B)).toBe(false);
    expect(shouldGlide(A, { lat: A.lat + 0.000001, lng: A.lng })).toBe(false);
    expect(shouldGlide(A, { lat: A.lat + 0.05, lng: A.lng })).toBe(false);
  });
});

describe('glideDurationMs', () => {
  it('uses most of the time between fixes, within bounds', () => {
    expect(glideDurationMs(1000)).toBe(800);
    expect(glideDurationMs(10_000)).toBe(GLIDE_MAX_MS);
    expect(glideDurationMs(50)).toBe(GLIDE_MIN_MS);
    expect(glideDurationMs(null)).toBe(GLIDE_MAX_MS);
  });
});

describe('glideAt', () => {
  it('starts at from, ends exactly on to, and moves forward only', () => {
    expect(glideAt(A, B, 0, 1000)).toEqual(A);
    expect(glideAt(A, B, 1000, 1000)).toEqual(B);
    expect(glideAt(A, B, 5000, 1000)).toEqual(B);
    let last = A.lat;
    for (let t = 0; t <= 1000; t += 100) {
      const p = glideAt(A, B, t, 1000);
      expect(p.lat).toBeGreaterThanOrEqual(last);
      last = p.lat;
    }
  });
  it('eases out', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe('followCamDurationMs', () => {
  it('matches the fix cadence, within bounds', () => {
    expect(followCamDurationMs(1000)).toBe(950);
    expect(followCamDurationMs(200)).toBe(600);
    expect(followCamDurationMs(30_000)).toBe(1500);
  });
});
