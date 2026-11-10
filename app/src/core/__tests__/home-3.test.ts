import { describe, expect, it } from 'vitest';

import { HERO_FALLBACK, heroMapUrl, startRideDetail } from '../home';

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
