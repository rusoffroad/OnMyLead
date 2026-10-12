import { describe, expect, it } from 'vitest';

import { actionLabel, bucketFor, customRange, daysLeft, fmtAgo, fmtInt, fmtMoney, fmtPct, rangeFor } from '../admin-format';

const now = new Date('2026-10-12T20:00:00Z');

describe('numbers', () => {
  it('formats counts and blanks', () => {
    expect(fmtInt(12345)).toBe('12,345');
    expect(fmtInt('7')).toBe('7');
    expect(fmtInt(null)).toBe('—');
  });
  it('formats Apple milli-unit prices', () => {
    expect(fmtMoney(4990)).toBe('$4.99');
    expect(fmtMoney(29990)).toBe('$29.99');
    expect(fmtMoney(30000)).toBe('$30');
    expect(fmtMoney(null)).toBe('—');
  });
  it('formats ratios', () => {
    expect(fmtPct(0.4567)).toBe('46%');
    expect(fmtPct(0.042)).toBe('4.2%');
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(null)).toBe('—');
  });
});

describe('time', () => {
  it('says how long ago', () => {
    expect(fmtAgo('2026-10-12T19:59:30Z', now)).toBe('just now');
    expect(fmtAgo('2026-10-12T19:15:00Z', now)).toBe('45 min ago');
    expect(fmtAgo('2026-10-11T20:00:00Z', now)).toBe('1 day ago');
    expect(fmtAgo('2026-10-15T20:00:00Z', now)).toBe('in 3 days');
  });
  it('rounds days left up and stops at zero', () => {
    expect(daysLeft('2026-10-12T22:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-10-19T20:00:00Z', now)).toBe(7);
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });
});

describe('ranges', () => {
  it('builds presets ending now', () => {
    const r = rangeFor('7d', now);
    expect(r.from).toBe('2026-10-05T20:00:00.000Z');
    expect(new Date(r.to).getTime()).toBeGreaterThan(now.getTime());
    expect(bucketFor(r)).toBe('day');
    expect(bucketFor(rangeFor('12m', now))).toBe('week');
    expect(bucketFor(rangeFor('all', new Date('2028-06-01T00:00:00Z')))).toBe('month');
  });
  it('includes both days of a custom range and rejects bad input', () => {
    expect(customRange('2026-10-01', '2026-10-01')).toEqual({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z', preset: 'custom' });
    expect(customRange('2026-10-05', '2026-10-01')).toBeNull();
    expect(customRange('Oct 1', '2026-10-01')).toBeNull();
  });
});

describe('actionLabel', () => {
  it('names known and unknown actions in Title Case', () => {
    expect(actionLabel('user.suspend')).toBe('Suspended Account');
    expect(actionLabel('trial.extend')).toBe('Extended Trial');
    expect(actionLabel('promo.create')).toBe('Promo Create');
    expect(actionLabel('setting.set_trial_days')).toBe('Setting Set Trial Days');
  });
});
