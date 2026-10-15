import { describe, expect, it } from 'vitest';

import {
  BATTERY_MODES, BATTERY_PLANS, batteryBannerTag, batteryWarning, DEFAULT_BATTERY_MODE, parseBatteryMode,
} from '../battery';
import { HEARTBEAT_SEC, LIVE_SEC, shouldSendFix } from '../freshness';

const flat = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111_000;

describe('battery saver plans', () => {
  it('defaults to Best Accuracy, which is today’s sending rule', () => {
    expect(DEFAULT_BATTERY_MODE).toBe('best');
    expect(BATTERY_PLANS.best).toMatchObject({ sendEveryM: 25, heartbeatSec: HEARTBEAT_SEC, accuracy: 'high', refreshSec: 15 });
  });

  it('offers three choices, each saving more than the one before', () => {
    expect(BATTERY_MODES).toEqual(['best', 'balanced', 'saver']);
    for (let i = 1; i < BATTERY_MODES.length; i++) {
      const a = BATTERY_PLANS[BATTERY_MODES[i - 1]];
      const b = BATTERY_PLANS[BATTERY_MODES[i]];
      expect(b.heartbeatSec).toBeGreaterThan(a.heartbeatSec);
      expect(b.sendEveryM).toBeGreaterThan(a.sendEveryM);
      expect(b.fixEveryMs).toBeGreaterThan(a.fixEveryMs);
      expect(b.refreshSec).toBeGreaterThanOrEqual(a.refreshSec);
    }
  });

  it('keeps a parked rider live to the group on every choice, with room for a slow upload', () => {
    for (const m of BATTERY_MODES) {
      const p = BATTERY_PLANS[m];
      // Android takes a fix every fixEveryMs, so the heartbeat lands on a fix, not one fix late.
      expect((p.heartbeatSec * 1000) % p.fixEveryMs).toBe(0);
      expect(p.heartbeatSec + 10).toBeLessThan(LIVE_SEC);
    }
  });

  it('sends by each plan’s distance and heartbeat', () => {
    const t0 = 1_000_000;
    const last = { lat: 39.5, lng: -105, at: t0 };
    const moved60m = { lat: 39.5 + 60 / 111_000, lng: -105, at: t0 + 5_000 };
    const best = BATTERY_PLANS.best;
    const balanced = BATTERY_PLANS.balanced;
    expect(shouldSendFix(last, moved60m, flat, best.sendEveryM, best.heartbeatSec)).toBe(true);
    expect(shouldSendFix(last, moved60m, flat, balanced.sendEveryM, balanced.heartbeatSec)).toBe(false);
    const parked = (sec: number) => ({ lat: 39.5, lng: -105, at: t0 + sec * 1000 });
    expect(shouldSendFix(last, parked(20), flat, balanced.sendEveryM, balanced.heartbeatSec)).toBe(false);
    expect(shouldSendFix(last, parked(30), flat, balanced.sendEveryM, balanced.heartbeatSec)).toBe(true);
    expect(shouldSendFix(last, parked(45), flat, BATTERY_PLANS.saver.sendEveryM, BATTERY_PLANS.saver.heartbeatSec)).toBe(true);
  });

  it('reads a stored choice, falling back to the default', () => {
    expect(parseBatteryMode('saver')).toBe('saver');
    expect(parseBatteryMode('balanced')).toBe('balanced');
    expect(parseBatteryMode(null)).toBe('best');
    expect(parseBatteryMode('turbo')).toBe('best');
    expect(parseBatteryMode('toString')).toBe('best');
  });
});

describe('battery saver warning', () => {
  it('warns when leaving Best Accuracy or saving even more', () => {
    const w = batteryWarning('best', 'balanced');
    expect(w?.title).toBe('Switch to Balanced?');
    expect(w?.message).toContain('30 seconds');
    expect(w?.confirm).toBe('Use Balanced');
    const s = batteryWarning('balanced', 'saver');
    expect(s?.message).toContain('45 seconds');
    expect(s?.message).toContain('100 m');
  });

  it('does not warn on going back to Best Accuracy or keeping the same choice', () => {
    expect(batteryWarning('saver', 'best')).toBeNull();
    expect(batteryWarning('balanced', 'balanced')).toBeNull();
  });

  it('tags the Ride Mode banner only when saving battery', () => {
    expect(batteryBannerTag('best')).toBe('');
    expect(batteryBannerTag('saver')).toBe(' · Max Battery Saver');
  });
});
