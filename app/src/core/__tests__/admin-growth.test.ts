import { describe, expect, it } from 'vitest';

import { deviceLabel, downloadSeries, needsRefresh, signInMethodLabel, storeState, type StoreDownloads } from '../admin-growth';

const base: StoreDownloads = {
  checked_at: null, ok_at: null, latest_day: null, error: null, downloads: 0, redownloads: 0, updates: 0, uninstalls: null, all_time: 0,
};

describe('storeState', () => {
  it('is not connected until the keys are set and a report is read', () => {
    expect(storeState(base, false)).toMatchObject({ label: 'Not Connected Yet', connected: false });
    expect(storeState(null, null).label).toBe('Not Connected Yet');
    expect(storeState(base, true)).toMatchObject({ label: 'Waiting for First Report', connected: false });
  });
  it('is connected after a good read, and shows a later failure', () => {
    const ok = { ...base, checked_at: '2026-10-15T10:00:00Z', ok_at: '2026-10-15T10:00:00Z' };
    expect(storeState(ok, true)).toMatchObject({ label: 'Connected', tone: 'ok' });
    expect(storeState({ ...ok, checked_at: '2026-10-15T12:00:00Z', error: 'HTTP 403' }, true)).toMatchObject({ label: 'Problem', connected: true });
    expect(storeState({ ...base, checked_at: '2026-10-15T12:00:00Z', error: 'HTTP 401' }, true)).toMatchObject({ label: 'Problem', connected: false });
  });
});

describe('needsRefresh', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  it('reads again after six hours or when never read', () => {
    expect(needsRefresh(null, now)).toBe(true);
    expect(needsRefresh('2026-10-15T07:00:00Z', now)).toBe(false);
    expect(needsRefresh('2026-10-15T05:00:00Z', now)).toBe(true);
    expect(needsRefresh('nonsense', now)).toBe(true);
  });
});

describe('labels and series', () => {
  it('names sign-in methods', () => {
    expect(signInMethodLabel('apple')).toBe('Sign in with Apple');
    expect(signInMethodLabel(null)).toBe('Email Link');
    expect(signInMethodLabel('twitter')).toBe('Twitter');
  });
  it('names devices', () => {
    expect(deviceLabel('apple', 'iPad')).toBe('iPad');
    expect(deviceLabel('apple', 'Desktop')).toBe('Mac');
    expect(deviceLabel('google', 'Android')).toBe('Android (Phones and Tablets)');
  });
  it('splits downloads by store', () => {
    expect(downloadSeries([{ bucket_start: 'a', apple: 2, google: 1 }])).toEqual({ apple: [{ t: 'a', v: 2 }], google: [{ t: 'a', v: 1 }] });
    expect(downloadSeries(null)).toEqual({ apple: [], google: [] });
  });
});
