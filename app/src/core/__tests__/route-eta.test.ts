import { describe, expect, it } from 'vitest';

import { milesToMeters } from '../geo';
import { cleanSpeedText, etaSeconds, formatEta, parseSpeed } from '../route-eta';

describe('route builder time estimate', () => {
  it('reads the speed the rider typed', () => {
    expect(parseSpeed('15')).toBe(15);
    expect(parseSpeed(' 7.5 ')).toBe(7.5);
    expect(parseSpeed('7,5')).toBe(7.5);
    expect(parseSpeed('12.')).toBe(12);
  });

  it('ignores a box that is empty, zero, junk or too fast', () => {
    for (const s of ['', '   ', '0', '0.5', 'abc', '-5', '1e2', '100', '250', null, undefined]) expect(parseSpeed(s)).toBeNull();
  });

  it('keeps only digits and one point in the box', () => {
    expect(cleanSpeedText('15 mph')).toBe('15');
    expect(cleanSpeedText('1.2.3')).toBe('1.23');
    expect(cleanSpeedText('7,5')).toBe('7.5');
    expect(cleanSpeedText('123456')).toBe('1234');
  });

  it('works out moving time from the route length', () => {
    expect(etaSeconds(milesToMeters(30), 15)).toBeCloseTo(2 * 3600, 0);
    expect(formatEta(milesToMeters(30), 15)).toBe('2 h 00 min');
    expect(formatEta(milesToMeters(10), 20)).toBe('30 min');
    expect(formatEta(milesToMeters(25), 12)).toBe('2 h 05 min');
  });

  it('never shows 0 min for a short route', () => {
    expect(formatEta(50, 30)).toBe('1 min');
  });

  it('shows nothing without a route or a speed', () => {
    expect(formatEta(0, 15)).toBeNull();
    expect(formatEta(null, 15)).toBeNull();
    expect(formatEta(milesToMeters(5), null)).toBeNull();
  });
});
