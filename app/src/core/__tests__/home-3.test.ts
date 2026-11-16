import { describe, expect, it } from 'vitest';

import { HERO_FALLBACK, heroMapUrl, leadLinePoints, smoothPath, startRideDetail, weekCells } from '../home';

describe('3.0 home map header', () => {
  it('needs a Mapbox public token', () => {
    expect(heroMapUrl(null, '', 393, 372)).toBeNull();
    expect(heroMapUrl(null, 'sk.secret', 393, 372)).toBeNull();
  });

  it('rounds the rider to about 5 km so the picture caches and never pinpoints them', () => {
    const a = heroMapUrl({ lat: 30.26712, lng: -97.74306 }, 'pk.test', 393, 372)!;
    const b = heroMapUrl({ lat: 30.2549, lng: -97.7612 }, 'pk.test', 393, 372)!;
    expect(a).toBe(b);
    expect(a).toContain('/-97.75,30.25,');
    expect(a).not.toContain('30.267');
  });

  it('falls back to a fixed spot without location', () => {
    expect(heroMapUrl(null, 'pk.test', 393, 372)).toContain(`/${HERO_FALLBACK.lng.toFixed(2)},${HERO_FALLBACK.lat.toFixed(2)},`);
  });

  it('keeps the size inside what the Static Images API allows', () => {
    expect(heroMapUrl(null, 'pk.test', 2000, 10)).toContain('/640x64@2x');
  });

  it('uses unlabelled satellite with no logo or attribution baked in', () => {
    const u = heroMapUrl(null, 'pk.test', 393, 372)!;
    expect(u).toContain('mapbox/satellite-v9');
    expect(u).toContain('attribution=false');
    expect(u).toContain('logo=false');
  });
});

describe('Start a Ride detail line', () => {
  it('shows what is left for Free riders and what it does otherwise', () => {
    expect(startRideDetail(null)).toBe('Lead your group');
    expect(startRideDetail({ text: 'Unlimited', tone: 'pro', upgrade: false })).toBe('Lead your group');
    expect(startRideDetail({ text: '1 Left This Month', tone: 'free', upgrade: true })).toBe('1 Left This Month');
    expect(startRideDetail({ text: 'None Left This Month', tone: 'out', upgrade: true })).toBe('None left this month');
  });
});

describe('ride card map', () => {
  it('pictures the rounded area, and nothing without a token', async () => {
    const { staticMapUrl } = await import('../home');
    const u = staticMapUrl({ lat: 38.5733, lng: -109.5498 }, 'pk.x', 72, 72, 10)!;
    expect(u).toContain('/-109.55,38.55,10,0/72x72@2x');
    expect(staticMapUrl({ lat: 1, lng: 2 }, '', 72, 72, 10)).toBeNull();
    expect(staticMapUrl({ lat: NaN, lng: 2 }, 'pk.x', 72, 72, 10)).toBeNull();
  });
});

describe('home action tile pictures', () => {
  it('runs the lead line from the left edge to the go button at mid-height', () => {
    const pts = leadLinePoints(120, 40);
    expect(pts[0].x).toBeLessThan(5);
    expect(pts[pts.length - 1]).toEqual({ x: 120, y: 20 });
    expect(pts.every((p, i) => i === 0 || p.x > pts[i - 1].x)).toBe(true);
    expect(pts.every((p) => p.y >= 0 && p.y <= 40)).toBe(true);
  });

  it('draws one curve per gap between points', () => {
    const d = smoothPath(leadLinePoints(120, 40));
    expect(d.startsWith('M2 ')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d.endsWith('120 20')).toBe(true);
    expect(smoothPath([{ x: 1, y: 1 }])).toBe('');
  });

  it('fits 2 to 5 calendar days inside the width', () => {
    expect(weekCells(300, 40)).toHaveLength(5);
    expect(weekCells(100, 40)).toHaveLength(3);
    expect(weekCells(20, 40)).toHaveLength(2);
    for (const w of [90, 102, 140, 300]) {
      const cells = weekCells(w, 40);
      expect(cells[0].x).toBeGreaterThanOrEqual(0);
      const last = cells[cells.length - 1];
      expect(last.x + last.w).toBeLessThanOrEqual(w);
      expect(last.y + last.h).toBeLessThanOrEqual(40);
    }
  });
});
