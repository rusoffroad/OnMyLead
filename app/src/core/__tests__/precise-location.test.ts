import { describe, expect, it } from 'vitest';
import { BUBBLE_PRESETS, BubbleRider, computeBubble } from '../bubble';
import {
  APPROXIMATE_M, certainGapM, isApproximateFix, isApproximatePermission, LOCATION_PROBLEM_BANNER, locationProblem, ROUGH_FIX_M,
  roughFixTips, shouldAskForGoogleAccuracy, shouldAskForPrecise,
} from '../precise-location';

const granted = { status: 'granted', canAskAgain: true };

describe('isApproximatePermission', () => {
  it('spots Android Approximate and iOS Precise off', () => {
    expect(isApproximatePermission({ ...granted, android: { accuracy: 'coarse' } })).toBe(true);
    expect(isApproximatePermission({ ...granted, ios: { accuracy: 'reduced' } })).toBe(true);
  });
  it('treats precise, missing details and no permission as not approximate', () => {
    expect(isApproximatePermission({ ...granted, android: { accuracy: 'fine' } })).toBe(false);
    expect(isApproximatePermission({ ...granted, ios: { accuracy: 'full' } })).toBe(false);
    expect(isApproximatePermission(granted)).toBe(false);
    expect(isApproximatePermission({ status: 'denied', canAskAgain: true, android: { accuracy: 'coarse' } })).toBe(false);
    expect(isApproximatePermission(null)).toBe(false);
  });
});

describe('shouldAskForPrecise', () => {
  const coarse = { ...granted, android: { accuracy: 'coarse' as const } };
  it('asks Android once per launch while the system still shows the question', () => {
    expect(shouldAskForPrecise(coarse, 'android', false)).toBe(true);
    expect(shouldAskForPrecise(coarse, 'android', true)).toBe(false);
    expect(shouldAskForPrecise({ ...coarse, canAskAgain: false }, 'android', false)).toBe(false);
  });
  it('never asks iOS, web or a phone already on precise', () => {
    expect(shouldAskForPrecise({ ...granted, ios: { accuracy: 'reduced' } }, 'ios', false)).toBe(false);
    expect(shouldAskForPrecise(coarse, 'web', false)).toBe(false);
    expect(shouldAskForPrecise({ ...granted, android: { accuracy: 'fine' } }, 'android', false)).toBe(false);
  });
});

describe('approximate fixes', () => {
  it('uses the accuracy the phone reported', () => {
    expect(isApproximateFix(2000)).toBe(true);
    expect(isApproximateFix(APPROXIMATE_M)).toBe(true);
    expect(isApproximateFix(12)).toBe(false);
    expect(isApproximateFix(null)).toBe(false);
    expect(isApproximateFix(undefined)).toBe(false);
  });
  it('takes approximate uncertainty off the gap, never below zero', () => {
    expect(certainGapM(2400, 2000, 5)).toBe(400);
    expect(certainGapM(1000, 2000, null)).toBe(0);
    expect(certainGapM(2400, 15, 8)).toBe(2400);
  });
});

describe('Ride Bubble with an Approximate Location rider', () => {
  const now = 1_800_000_000_000;
  const MILE_LAT = 1 / 69;
  const rider = (id: string, latMiles: number, accuracyM: number | null): BubbleRider => ({
    id,
    name: id,
    role: id === 'Lead' ? 'leader' : 'rider',
    sharing: true,
    fix: { lat: 38 + latMiles * MILE_LAT, lng: -109.5, at: now - 5_000, speedMps: 0, headingDeg: null, accuracyM },
    lastMovedAt: now - 5_000,
  });

  it('keeps a rider beside the leader together when their phone puts them 1.5 miles off', () => {
    const r = computeBubble([rider('Lead', 0, 5), rider('Android', -1.5, 2500)], BUBBLE_PRESETS.default, now);
    expect(r.riders.every((s) => s.status === 'green')).toBe(true);
    expect(r.alerts).toHaveLength(0);
  });

  it('still flags an approximate rider who is far beyond the uncertainty', () => {
    const r = computeBubble([rider('Lead', 0, 5), rider('Android', -5, 2000)], BUBBLE_PRESETS.default, now);
    expect(r.riders.find((s) => s.riderId === 'Android')?.status).toBe('red');
  });

  it('keeps flagging precise riders by plain distance', () => {
    const r = computeBubble([rider('Lead', 0, 5), rider('Far', -1.7, 10)], BUBBLE_PRESETS.default, now);
    expect(r.riders.find((s) => s.riderId === 'Far')?.status).toBe('red');
  });
});

describe('Google Location Accuracy and rough fixes', () => {
  it('asks Android once per launch only when the network provider is off', () => {
    expect(shouldAskForGoogleAccuracy(false, 'android', false)).toBe(true);
    expect(shouldAskForGoogleAccuracy(false, 'android', true)).toBe(false);
    expect(shouldAskForGoogleAccuracy(true, 'android', false)).toBe(false);
    expect(shouldAskForGoogleAccuracy(null, 'android', false)).toBe(false);
    expect(shouldAskForGoogleAccuracy(false, 'ios', false)).toBe(false);
  });

  it('names the worst problem first', () => {
    expect(locationProblem({ approximate: true, networkAvailable: false, ownAccuracyM: 3000 })).toBe('approximate');
    expect(locationProblem({ approximate: false, networkAvailable: false, ownAccuracyM: 3000 })).toBe('google_accuracy_off');
    expect(locationProblem({ approximate: false, networkAvailable: true, ownAccuracyM: 2400 })).toBe('rough_fix');
    expect(locationProblem({ approximate: false, networkAvailable: null, ownAccuracyM: ROUGH_FIX_M })).toBe('rough_fix');
  });

  it('stays quiet for a good fix or when not sharing', () => {
    expect(locationProblem({ approximate: false, networkAvailable: true, ownAccuracyM: 12 })).toBeNull();
    expect(locationProblem({ approximate: false, networkAvailable: null, ownAccuracyM: null })).toBeNull();
    expect(locationProblem({ approximate: false, networkAvailable: null, ownAccuracyM: undefined })).toBeNull();
  });

  it('has a Title Case banner and device-specific tips', () => {
    for (const b of Object.values(LOCATION_PROBLEM_BANNER)) expect(b).not.toMatch(/[—–]/);
    expect(roughFixTips('android')).toMatch(/Calibrate/);
    expect(roughFixTips('android')).toMatch(/Google Location Accuracy/);
    expect(roughFixTips('ios')).toMatch(/Precise Location/);
  });
});
