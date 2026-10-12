import { describe, expect, it } from 'vitest';

import {
  ascEnumLabel, cumulative, exportFileName, joinSeries, offerTypeLabel, ratio, revenueByCurrency, subscriptionBadge, toCsv,
} from '../admin-analytics';

describe('subscriptionBadge', () => {
  it('calls a paying subscription with auto-renew off Cancelled', () => {
    expect(subscriptionBadge('active', false)).toEqual({ label: 'Cancelled', tone: 'warn' });
    expect(subscriptionBadge('active', true).label).toBe('Active');
    expect(subscriptionBadge('active', null).label).toBe('Active');
  });
  it('labels every Apple state', () => {
    expect(subscriptionBadge('billing_retry', true).label).toBe('Billing Retry');
    expect(subscriptionBadge('grace', true).label).toBe('Grace Period');
    expect(subscriptionBadge('refunded', null).tone).toBe('danger');
    expect(subscriptionBadge('expired', false).label).toBe('Expired');
  });
});

describe('labels', () => {
  it('names offer types and App Store Connect enums', () => {
    expect(offerTypeLabel(3)).toBe('Offer Code');
    expect(offerTypeLabel(null)).toBe('Offer');
    expect(ascEnumLabel('ONE_MONTH')).toBe('One Month');
    expect(ascEnumLabel('PAY_AS_YOU_GO')).toBe('Pay As You Go');
    expect(ascEnumLabel('FREE_TRIAL')).toBe('Free Trial');
    expect(ascEnumLabel('PAY_UP_FRONT')).toBe('Pay Up Front');
  });
  it('never divides by zero', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe('revenueByCurrency', () => {
  const row = (t: string, currency: string, gross: number, refunds = 0) => ({
    bucket_start: t, currency, gross_milli: gross, refunds_milli: refunds, new_subscriptions: gross ? 1 : 0, renewals: 0, refunds: refunds ? 1 : 0,
  });
  it('nets refunds, keeps USD first and drops empty foreign currencies', () => {
    const out = revenueByCurrency([
      row('2026-10-01T00:00:00Z', 'USD', 4990), row('2026-10-02T00:00:00Z', 'USD', 29990, 4990),
      row('2026-10-01T00:00:00Z', 'EUR', 0), row('2026-10-02T00:00:00Z', 'EUR', 0),
      row('2026-10-01T00:00:00Z', 'GBP', 3990), row('2026-10-02T00:00:00Z', 'GBP', 0),
    ]);
    expect(out.map((c) => c.currency)).toEqual(['USD', 'GBP']);
    expect(out[0].net).toBe(29990);
    expect(out[0].points).toEqual([{ t: '2026-10-01T00:00:00Z', v: 4.99 }, { t: '2026-10-02T00:00:00Z', v: 25 }]);
    expect(out[0].refundCount).toBe(1);
  });
  it('keeps an empty USD series so the chart still has a baseline', () => {
    expect(revenueByCurrency([row('2026-10-01T00:00:00Z', 'USD', 0)])).toHaveLength(1);
  });
});

describe('series helpers', () => {
  it('joins series into one row per day, filling gaps with 0', () => {
    expect(joinSeries({
      created: [{ bucket_start: '2026-10-01T00:00:00Z', value: 2 }],
      joined: [{ bucket_start: '2026-10-01T00:00:00Z', value: 5 }, { bucket_start: '2026-10-02T00:00:00Z', value: 1 }],
    })).toEqual([
      { date: '2026-10-01', created: 2, joined: 5 },
      { date: '2026-10-02', created: 0, joined: 1 },
    ]);
  });
  it('runs a total', () => {
    expect(cumulative([{ bucket_start: 'a', value: 2 }, { bucket_start: 'b', value: 3 }], 10).map((r) => r.value)).toEqual([12, 15]);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv(['a', 'b'], [{ a: 'x, y', b: 'say "hi"\nthere' }])).toBe('a,b\r\n"x, y","say ""hi""\nthere"\r\n');
  });
  it('defuses spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv(['a'], [{ a: '=HYPERLINK("x")' }])).toBe('a\r\n"\'=HYPERLINK(""x"")"\r\n');
    expect(toCsv(['a'], [{ a: '-4.99' }, { a: -2 }])).toBe('a\r\n-4.99\r\n-2\r\n');
  });
  it('refuses location columns', () => {
    expect(() => toCsv(['ride', 'meet_area_lat'], [])).toThrow(/locations/);
    expect(() => toCsv(['lng'], [])).toThrow();
    expect(() => toCsv(['rides_completed', 'renewals'], [])).not.toThrow();
  });
  it('names the file by the last day covered', () => {
    expect(exportFileName('user_growth', '2026-09-12T00:00:00.000Z', '2026-10-13T00:00:00.000Z')).toBe('onmylead-user-growth-2026-09-12-to-2026-10-12.csv');
  });
});

describe('small labels', () => {
  it('reads event names, releases and sizes', async () => {
    const { eventLabel, releaseLabel, bytesLabel } = await import('../admin-analytics');
    expect(eventLabel('ride_poll_vote')).toBe('Ride Poll Vote');
    expect(eventLabel('share_stopped_early')).toBe('Share Stopped Early');
    expect(releaseLabel('com.rusoffroad.onmylead.app@1.0.0+12')).toBe('1.0.0 (12)');
    expect(releaseLabel('Unknown')).toBe('Unknown');
    expect(bytesLabel(10320919)).toBe('9.8 MB');
  });
});
