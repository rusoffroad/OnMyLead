import { describe, expect, it } from 'vitest';
import { NOT_SWITCHED_ON, parseEntitlements } from '../entitlements';
import {
  annualPerMonth, annualSavingsPercent, canStartTrip, FEATURE_INFO, historySplit, isActiveTrip, nextReset, planHeadline,
} from '../pro';

const free = parseEntitlements({
  account_type: 'free', ride_allowance: 1, history_limit: 5, rides_created_this_month: 0,
  features: { import_gpx: false, offline_maps: false, saved_groups: false, create_poll: false, ride_history: false,
    advanced_trip_planning: false, advanced_stats: false, premium_ride_cards: false },
});
const trial = parseEntitlements({ account_type: 'pro', pro_source: 'trial', trial_ends_at: new Date(Date.now() + 11.5 * 864e5).toISOString() });

describe('planHeadline', () => {
  it('names the plan and the trial days left', () => {
    expect(planHeadline(trial)).toBe('Pro Trial — 12 Days Remaining');
    expect(planHeadline(free)).toBe('Free');
  });
});

describe('nextReset', () => {
  it('is the first of the next UTC month', () => {
    expect(nextReset(new Date('2026-12-31T23:59:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(nextReset(new Date('2026-10-12T00:00:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('prices', () => {
  it('annual saves about half and costs $2.50 a month', () => {
    expect(annualSavingsPercent()).toBe(50);
    expect(annualPerMonth()).toBe('$2.50');
  });
});

describe('copy', () => {
  it('says what stays free for every gated feature', () => {
    for (const info of Object.values(FEATURE_INFO)) expect(info.body).toMatch(/free/i);
  });
});

describe('history and trips', () => {
  it('shows the last five for Free', () => {
    expect(historySplit([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ shown: [1, 2, 3, 4, 5], hidden: 2 });
    expect(historySplit([1, 2], 5).hidden).toBe(0);
    expect(historySplit([1, 2, 3, 4, 5, 6], null).hidden).toBe(0);
  });
  it('keeps one active trip for Free', () => {
    expect(isActiveTrip({ starts_on: null, ends_on: null }, '2026-10-12')).toBe(true);
    expect(isActiveTrip({ starts_on: '2026-10-01', ends_on: '2026-10-12' }, '2026-10-12')).toBe(true);
    expect(isActiveTrip({ starts_on: '2026-10-01', ends_on: null }, '2026-10-12')).toBe(false);
    const past = { starts_on: '2026-09-01', ends_on: '2026-09-03' };
    const upcoming = { starts_on: '2026-11-01', ends_on: null };
    expect(canStartTrip(free, [past], '2026-10-12')).toBe(true);
    expect(canStartTrip(free, [past, upcoming], '2026-10-12')).toBe(false);
    expect(canStartTrip(trial, [upcoming], '2026-10-12')).toBe(true);
    expect(canStartTrip(NOT_SWITCHED_ON, [upcoming], '2026-10-12')).toBe(true);
  });
});
