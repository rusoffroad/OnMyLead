import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { qrModules, qrPath } from '../qr';
import { APP_LINK_PATHS, APPLE_APP_ID, appRideUrl, isAppleMobile, rideLink, SITE_URL } from '../ride-link';

const root = resolve(__dirname, '../../..');

describe('ride links', () => {
  it('points at the ride page on onmylead.com by default', () => {
    expect(rideLink('7F3A9C21')).toBe('https://onmylead.com/r/7F3A9C21');
    expect(rideLink('7F3A9C21', '')).toBe(`${SITE_URL}/r/7F3A9C21`);
    expect(rideLink('7F3A9C21', 'https://onmylead.com/')).toBe('https://onmylead.com/r/7F3A9C21');
  });

  it('opens the app by its own scheme from the web page', () => {
    expect(appRideUrl('7F3A9C21')).toBe('onmylead://r/7F3A9C21');
  });

  it('knows an iPhone browser from a desktop one', () => {
    expect(isAppleMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)')).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)')).toBe(false);
    expect(isAppleMobile(undefined)).toBe(false);
  });
});

describe('Universal Links setup', () => {
  const aasa = JSON.parse(readFileSync(resolve(root, 'public/.well-known/apple-app-site-association'), 'utf8'));
  const app = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;

  it('the site names this exact app and only the ride and group paths', () => {
    const [detail] = aasa.applinks.details;
    expect(aasa.applinks.details).toHaveLength(1);
    expect(detail.appIDs).toEqual([APPLE_APP_ID]);
    expect(detail.components.map((c: { '/': string }) => c['/'])).toEqual([...APP_LINK_PATHS]);
    expect(APPLE_APP_ID).toBe(`${app.ios.appleTeamId}.${app.ios.bundleIdentifier}`);
  });

  it('the app claims the same domain the QR code points at', () => {
    expect(app.ios.associatedDomains).toEqual([`applinks:${new URL(SITE_URL).host}`]);
  });
});

describe('QR codes', () => {
  const link = rideLink('7F3A9C21');
  const m = qrModules(link);

  it('is a square grid of a standard size', () => {
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect((m.length - 17) % 4).toBe(0);
    m.forEach((row) => expect(row).toHaveLength(m.length));
  });

  it('has the three corner finder squares a camera locks onto', () => {
    const n = m.length;
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      for (let i = 0; i < 7; i++) {
        expect(m[r0][c0 + i]).toBe(true);
        expect(m[r0 + 6][c0 + i]).toBe(true);
        expect(m[r0 + i][c0]).toBe(true);
        expect(m[r0 + i][c0 + 6]).toBe(true);
      }
      expect(m[r0 + 1][c0 + 1]).toBe(false);
      expect(m[r0 + 3][c0 + 3]).toBe(true);
    }
  });

  it('draws every dark module and nothing else', () => {
    const dark = m.flat().filter(Boolean).length;
    const path = qrPath(m, 2);
    const area = [...path.matchAll(/h(\d+)/g)].reduce((sum, x) => sum + Number(x[1]), 0);
    expect(area).toBe(dark);
    expect(path.startsWith('M2 2h7')).toBe(true);
  });
});
