import { describe, expect, it } from 'vitest';

import { can, createsRidesOnlyWithPro, parseEntitlements, rideAllowanceText, showsProTag } from '../entitlements';
import { createQuota, startRideDetail } from '../home';
import { rideDirections } from '../directions';
import {
  canAddMachine, comparison, COMPARISON_4, COMPARISON_BEFORE_4, FEATURE_INFO, FREE_MAP_HOURS_4, graceDayText, planNotice, RIDE_GRACE_UNTIL,
} from '../pro';

// The 4.0 plan (Chris, 2026-11-19): Free joins, follows and talks; everything else is Pro.
const NEW_KEYS = ['places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters'] as const;
const off = Object.fromEntries(NEW_KEYS.map((k) => [k, false]));
const newFree = parseEntitlements({ account_type: 'free', ride_allowance: 0, rides_created_this_month: 0, features: { ...off, vote_polls: true } });
const graceFree = parseEntitlements({ account_type: 'free', ride_allowance: 1, rides_created_this_month: 0, features: off });
const pro = parseEntitlements({ account_type: 'pro', pro_source: 'apple' });
const before = parseEntitlements({ account_type: 'free', ride_allowance: 1, rides_created_this_month: 0, features: {} });

describe('creating rides on the 4.0 plan', () => {
  it('is Pro only for a Free account with no allowance, and carries the Pro tag', () => {
    expect(can(newFree, 'create_ride')).toBe(false);
    expect(createsRidesOnlyWithPro(newFree)).toBe(true);
    expect(showsProTag(newFree, 'create_ride')).toBe(true);
    expect(rideAllowanceText(newFree)).toBeNull();
  });
  it('keeps the monthly ride for an older account, with the count and no tag', () => {
    expect(can(graceFree, 'create_ride')).toBe(true);
    expect(showsProTag(graceFree, 'create_ride')).toBe(false);
    expect(rideAllowanceText(graceFree)).toBe('Rides Created This Month: 0 of 1');
  });
  it('never limits Pro', () => {
    expect(createsRidesOnlyWithPro(pro)).toBe(false);
    expect(showsProTag(pro, 'create_ride')).toBe(false);
  });
  it('Home says Pro instead of a count', () => {
    const q = createQuota(newFree);
    expect(q?.proOnly).toBe(true);
    expect(startRideDetail(q)).toBe('Lead your group');
    expect(createQuota(graceFree)?.proOnly).toBeUndefined();
  });
});

describe('the new Pro features', () => {
  it('are gated on Free once the server says so, and open on Pro', () => {
    for (const k of NEW_KEYS) {
      expect(can(newFree, k)).toBe(false);
      expect(showsProTag(newFree, k)).toBe(true);
      expect(can(pro, k)).toBe(true);
    }
  });
  it('are open while the server does not list them (4.0 plan off, or an older server)', () => {
    for (const k of NEW_KEYS) expect(can(before, k)).toBe(true);
  });
  it('each has Pro copy that says what stays free', () => {
    for (const k of NEW_KEYS) expect(FEATURE_INFO[k].body).toMatch(/free/i);
  });
  it('keep one garage machine free, and every machine already added', () => {
    expect(canAddMachine(newFree, 0)).toBe(true);
    expect(canAddMachine(newFree, 1)).toBe(false);
    expect(canAddMachine(newFree, 3)).toBe(false);
    expect(canAddMachine(pro, 5)).toBe(true);
  });
});

describe('what stays free', () => {
  it('directions to the meeting point are free; other directions are not marked free', () => {
    const rows = rideDirections({ meet: { lat: 38.5, lng: -109.5, label: 'Lot' }, destination: "Hell's Revenge, Moab, UT" });
    expect(rows.find((r) => r.key === 'meet')?.target.free).toBe(true);
    expect(rows.find((r) => r.key === 'destination')?.target.free).toBeUndefined();
  });
  it('voting on polls follows the server (free on the 4.0 plan)', () => {
    expect(can(newFree, 'vote_polls')).toBe(true);
  });
});

describe('the Pro screen comparison', () => {
  it('shows the 4.0 table only once the plan is on', () => {
    expect(comparison(false)).toBe(COMPARISON_BEFORE_4);
    expect(comparison(true)).toBe(COMPARISON_4);
  });
  it('the 4.0 table: rides are Pro, joining and safety free, 5 Map Mode hours', () => {
    const row = (l: string) => COMPARISON_4.find((r) => r.label === l);
    expect(row('Create Rides')?.free).toBe(false);
    expect(row('Join Rides and Follow the Leader')?.free).toBe('Unlimited');
    expect(row('Live Tracking, EMERGENCY, Need Help, Crash Alert and Ride Bubble')?.free).toBe(true);
    expect(row('Map Mode')?.free).toBe(`${FREE_MAP_HOURS_4} Hours a Month`);
    expect(FREE_MAP_HOURS_4).toBe(5);
    expect(row('Places to Ride')?.free).toBe(false);
  });
});

describe('the Home notice about the change', () => {
  const now = Date.parse('2026-12-10T00:00:00Z');
  it('tells an older Free account about its ride grace, and again in the last two weeks', () => {
    expect(planNotice(graceFree, true, now)).toEqual({ kind: 'grace', key: 'plan4-grace' });
    expect(planNotice(graceFree, true, Date.parse('2027-01-25T00:00:00Z'))).toEqual({ kind: 'grace', key: 'plan4-grace-soon' });
  });
  it('tells a Free account with no rides what is free, once', () => {
    expect(planNotice(newFree, true, now)).toEqual({ kind: 'pro', key: 'plan4-pro' });
  });
  it('says nothing while the plan is off, to Pro, or after the grace on a stale answer', () => {
    expect(planNotice(graceFree, false, now)).toBeNull();
    expect(planNotice(pro, true, now)).toBeNull();
    expect(planNotice(graceFree, true, Date.parse(RIDE_GRACE_UNTIL) + 1)).toBeNull();
  });
  it('names Feb 1, 2027 as the last day everywhere', () => {
    expect(graceDayText()).toBe('Feb 1, 2027');
  });
});
