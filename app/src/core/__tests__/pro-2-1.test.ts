import { describe, expect, it } from 'vitest';

import { carPlayLabels } from '../carplay';
import { applyClock, can, FEATURE_KEYS, NOT_SWITCHED_ON, parseEntitlements, PRO_BY_DEFAULT, showsProTag } from '../entitlements';
import { COMPARISON, effectiveDot, FEATURE_INFO } from '../pro';

// 2.1 (Chris 2026-11-05): Bluetooth Sharing, customizing Your Dot, group photos and CarPlay are Pro.
const NEW = ['bluetooth_sharing', 'custom_dot', 'group_photos', 'carplay'] as const;

const free = parseEntitlements({
  account_type: 'free', ride_allowance: 1, history_limit: 5,
  features: { bluetooth_sharing: false, custom_dot: false, group_photos: false, carplay: false },
});
const trial = parseEntitlements({ account_type: 'pro', pro_source: 'trial', trial_ends_at: new Date(Date.now() + 30 * 864e5).toISOString() });
// A server before migration 20261105090000 doesn't list them: nothing new is gated.
const oldServer = parseEntitlements({ account_type: 'free', ride_allowance: 1, features: { import_gpx: false } });

describe('the 2.1 Pro features', () => {
  it('are known features, Pro by default, with a prompt', () => {
    for (const k of NEW) {
      expect(FEATURE_KEYS).toContain(k);
      expect(PRO_BY_DEFAULT).toContain(k);
      expect(FEATURE_INFO[k].title.length).toBeGreaterThan(0);
    }
  });

  it('are off on Free with a Pro tag, on for a trial, and untouched on an older server', () => {
    for (const k of NEW) {
      expect(can(free, k)).toBe(false);
      expect(showsProTag(free, k)).toBe(true);
      expect(can(trial, k)).toBe(true);
      expect(showsProTag(trial, k)).toBe(false);
      expect(can(oldServer, k)).toBe(true);
      expect(can(NOT_SWITCHED_ON, k)).toBe(true);
    }
  });

  it('turn off when a cached trial runs out on the phone', () => {
    const ended = applyClock({ ...trial, trialEndsAt: new Date(Date.now() - 1000).toISOString() });
    for (const k of NEW) expect(can(ended, k)).toBe(false);
  });

  it('are on the Pro screen comparison', () => {
    const labels = COMPARISON.map((r) => r.label);
    expect(labels).toContain('Bluetooth Sharing With No Service');
    expect(labels).toContain('CarPlay');
    expect(labels.some((l) => l.includes('Group Photos'))).toBe(true);
    expect(labels.some((l) => l.includes('Custom Dots'))).toBe(true);
  });
});

describe('Your Dot on Free', () => {
  it('falls back to the default dot, and the pick comes back with Pro', () => {
    expect(effectiveDot(free, 'dome', 'large')).toEqual({ style: 'flag', size: 'medium' });
    expect(effectiveDot(trial, 'dome', 'large')).toEqual({ style: 'dome', size: 'large' });
    expect(effectiveDot(oldServer, 'ring', 'small')).toEqual({ style: 'ring', size: 'small' });
  });
});

describe('CarPlay on Free', () => {
  it('shows an information-only Pro notice on the waiting screen', () => {
    const l = carPlayLabels(true);
    expect(l.waitingTitle).toBe('CarPlay Is Part of OnMyLead Pro');
    // Apple: nothing to buy in the car, and no telling the driver to pick up the phone.
    expect(`${l.waitingTitle} ${l.waitingDetail}`).not.toMatch(/buy|subscribe|upgrade|price|\$|pick up|open/i);
    expect(carPlayLabels().waitingTitle).toBe('No Ride Running');
  });
});

describe('CarPlay on Free', () => {
  it('lets EMERGENCY through without Pro, nothing else', async () => {
    const { carPlayActionAllowed } = await import('../carplay');
    expect(carPlayActionAllowed({ type: 'emergency' }, false)).toBe(true);
    expect(carPlayActionAllowed({ type: 'status', kind: 'emergency' }, false)).toBe(true);
    expect(carPlayActionAllowed({ type: 'status', kind: 'ok' }, false)).toBe(false);
    expect(carPlayActionAllowed({ type: 'regroup' }, false)).toBe(false);
    expect(carPlayActionAllowed({ type: 'regroup' }, true)).toBe(true);
  });
});

describe('Bluetooth on Free (relay only)', () => {
  it('still sends and shows status taps (so I\'m OK always ends an EMERGENCY), not spots or messages', async () => {
    const { nearbyFreeAllows } = await import('../nearby');
    expect(nearbyFreeAllows({ kind: 'status' })).toBe(true);
    expect(nearbyFreeAllows({ kind: 'position' })).toBe(false);
    expect(nearbyFreeAllows({ kind: 'reply' })).toBe(false);
  });
});
