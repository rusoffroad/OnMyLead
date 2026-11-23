import { describe, expect, it } from 'vitest';

import { PRO_DEAL, proDealLive } from '../../constants/site';

describe('Black Friday 2026 Pro deal window', () => {
  it('runs from Nov 23 to the end of Dec 1, US Central', () => {
    expect(proDealLive(Date.parse('2026-11-23T05:59:59Z'))).toBe(false);
    expect(proDealLive(Date.parse('2026-11-23T06:00:00Z'))).toBe(true);
    expect(proDealLive(Date.parse('2026-12-02T05:59:59Z'))).toBe(true);
    expect(proDealLive(Date.parse('2026-12-02T06:00:00Z'))).toBe(false);
  });
  it('is half the regular annual price', () => {
    expect(PRO_DEAL.annual).toBe('$14.99');
  });
});
