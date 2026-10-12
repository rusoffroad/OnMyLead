import { describe, expect, it } from 'vitest';

import {
  applyClock, can, daysLeft, isEntitlementsMissing, NOT_SWITCHED_ON, parseEntitlements, parseProError,
  rideAllowanceText, trialBadgeText,
} from '../entitlements';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const free = {
  account_type: 'free', pro_source: null, pro_until: null, trial_ends_at: null, trial_used: true, apple: null,
  rides_created_this_month: 0, ride_allowance: 1, history_limit: 5,
  features: { create_ride: true, import_gpx: false, offline_maps: false, saved_groups: false, create_poll: false, ride_history: true,
    advanced_trip_planning: false, advanced_stats: false, premium_ride_cards: false },
};
const trial = {
  ...free, account_type: 'pro', pro_source: 'trial', pro_until: iso(NOW + 12.5 * DAY), trial_ends_at: iso(NOW + 12.5 * DAY),
  ride_allowance: null, history_limit: null,
  features: Object.fromEntries(Object.keys(free.features).map((k) => [k, true])),
};

describe('entitlements', () => {
  it('gates nothing before the server has the Pro update', () => {
    expect(can(NOT_SWITCHED_ON, 'offline_maps')).toBe(true);
    expect(can(NOT_SWITCHED_ON, 'create_ride')).toBe(true);
    expect(rideAllowanceText(NOT_SWITCHED_ON)).toBeNull();
    expect(parseEntitlements(null, NOW).switchedOn).toBe(false);
  });

  it('reads a Free account', () => {
    const e = parseEntitlements(free, NOW);
    expect(e.label).toBe('Free');
    expect(can(e, 'import_gpx')).toBe(false);
    expect(can(e, 'create_ride')).toBe(true);
    expect(rideAllowanceText(e)).toBe('Rides Created This Month: 0 of 1');
    const used = parseEntitlements({ ...free, rides_created_this_month: 1 }, NOW);
    expect(can(used, 'create_ride')).toBe(false);
    expect(rideAllowanceText(used)).toBe('Rides Created This Month: 1 of 1');
  });

  it('reads a trial with days remaining', () => {
    const e = parseEntitlements(trial, NOW);
    expect(e.label).toBe('Pro Trial');
    expect(e.trialDaysLeft).toBe(13);
    expect(trialBadgeText(e)).toBe('Pro Trial — 13 Days Remaining');
    expect(trialBadgeText({ ...e, trialDaysLeft: 1 })).toBe('Pro Trial — 1 Day Remaining');
    expect(can(e, 'saved_groups')).toBe(true);
    expect(rideAllowanceText(e)).toBeNull();
  });

  it('labels Admin and paid Pro, and never limits them', () => {
    const admin = parseEntitlements({ ...trial, account_type: 'admin', pro_source: 'admin', trial_ends_at: null }, NOW);
    expect(admin.label).toBe('Admin');
    expect(admin.rideAllowance).toBeNull();
    const paid = parseEntitlements({ ...trial, pro_source: 'apple', apple: { product_id: 'com.rusoffroad.onmylead.pro.annual', status: 'active', expires_at: iso(NOW + 300 * DAY), auto_renew: true, environment: 'Sandbox' } }, NOW);
    expect(paid.label).toBe('Pro');
    expect(paid.apple?.status).toBe('active');
    expect(trialBadgeText(paid)).toBeNull();
  });

  it('treats unknown features as not gated', () => {
    const e = parseEntitlements({ ...free, features: { import_gpx: false } }, NOW);
    expect(can(e, 'import_gpx')).toBe(false);
    expect(can(e, 'premium_ride_cards')).toBe(true);
  });

  it('turns an ended trial Free from the cache, but leaves Apple to the server', () => {
    const e = parseEntitlements(trial, NOW);
    expect(applyClock(e, NOW + 12 * DAY).label).toBe('Pro Trial');
    const ended = applyClock(e, NOW + 13 * DAY);
    expect(ended.label).toBe('Free');
    expect(can(ended, 'offline_maps')).toBe(false);
    const apple = parseEntitlements({ ...trial, pro_source: 'apple', pro_until: iso(NOW + DAY) }, NOW);
    expect(applyClock(apple, NOW + 40 * DAY).label).toBe('Pro');
  });

  it('counts days left', () => {
    expect(daysLeft(iso(NOW + 30 * DAY), NOW)).toBe(30);
    expect(daysLeft(iso(NOW + 1000), NOW)).toBe(1);
    expect(daysLeft(iso(NOW - 1000), NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
  });

  it('reads the server refusals', () => {
    expect(parseProError('ride_limit:1/1')).toEqual({ kind: 'ride_limit', used: 1, allowance: 1 });
    expect(parseProError('pro_required:create_poll')).toEqual({ kind: 'pro_required', feature: 'create_poll' });
    expect(parseProError('pro_required:something_new')).toEqual({ kind: 'pro_required', feature: null });
    expect(parseProError('ride not found')).toBeNull();
  });

  it('spots a server without the Pro update', () => {
    expect(isEntitlementsMissing({ code: 'PGRST202', message: 'Could not find the function public.my_entitlements' })).toBe(true);
    expect(isEntitlementsMissing({ code: '08006', message: 'network' })).toBe(false);
  });
});
