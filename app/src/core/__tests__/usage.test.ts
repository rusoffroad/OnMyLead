import { describe, expect, it } from 'vitest';

import {
  MAX_SEND_SECONDS, MAX_STRETCH_MS, NEW_SESSION_GAP_MS, newUsageClock, returnUsageBatch, startUsage, stopUsage, takeUsageBatch, tickUsage,
  usageDevice, usageDuration,
} from '../usage';

describe('usage counts', () => {
  it('counts one session and its seconds while a screen is in front', () => {
    let c = startUsage(newUsageClock(), 0);
    c = tickUsage(c, 60_000);
    c = stopUsage(c, 90_500);
    expect(c.pendingSessions).toBe(1);
    expect(c.pendingSeconds).toBe(90);
    expect(c.carryMs).toBe(500);
    expect(c.since).toBeNull();
    // Starting twice doesn't count twice.
    expect(startUsage(startUsage(newUsageClock(), 0), 10).pendingSessions).toBe(1);
  });

  it('a quick trip away keeps the same session, a long one starts a new one', () => {
    let c = stopUsage(startUsage(newUsageClock(), 0), 10_000);
    c = startUsage(c, 10_000 + NEW_SESSION_GAP_MS - 1);
    expect(c.pendingSessions).toBe(1);
    c = stopUsage(c, 20_000 + NEW_SESSION_GAP_MS);
    c = startUsage(c, 20_000 + 2 * NEW_SESSION_GAP_MS);
    expect(c.pendingSessions).toBe(2);
  });

  it('never counts a frozen stretch as use', () => {
    const c = tickUsage(startUsage(newUsageClock(), 0), 6 * 3600_000);
    expect(c.pendingSeconds).toBe(MAX_STRETCH_MS / 1000);
  });

  it('sends in pieces the server accepts and keeps a failed send', () => {
    let c = { ...newUsageClock(), pendingSessions: 7, pendingSeconds: 700 };
    const first = takeUsageBatch(c);
    expect(first.batch).toEqual({ sessions: 5, seconds: MAX_SEND_SECONDS });
    c = returnUsageBatch(first.clock, first.batch!);
    expect(c.pendingSessions).toBe(7);
    expect(c.pendingSeconds).toBe(700);
    expect(takeUsageBatch(newUsageClock()).batch).toBeNull();
  });

  it('files counts under the device category', () => {
    expect(usageDevice('ios')).toBe('iphone');
    expect(usageDevice('ios', true)).toBe('ipad');
    expect(usageDevice('android')).toBe('android');
    expect(usageDevice('web')).toBe('web');
    expect(usageDevice('windows')).toBe('other');
  });

  it('says durations in plain words', () => {
    expect(usageDuration(45)).toBe('45 sec');
    expect(usageDuration(720)).toBe('12 min');
    expect(usageDuration(3 * 3600 + 300)).toBe('3 hr 5 min');
    expect(usageDuration(7200)).toBe('2 hr');
    expect(usageDuration(null)).toBe('0 sec');
  });
});
