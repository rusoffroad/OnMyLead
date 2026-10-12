import { describe, expect, it } from 'vitest';

import { APP_FLAG_KEYS, flagOn, liveNotice, NO_SETTINGS, noticeKey, parseAppSettings } from '../app-settings';

describe('parseAppSettings', () => {
  it('reads notices and boolean flags', () => {
    const s = parseAppSettings({
      announcement: { text: ' New: Waypoints ', until: '2026-11-01T23:59:59.000Z' },
      maintenance: null,
      flags: { starlink: false, rus_gear: true, junk: 'no' },
    });
    expect(s.announcement).toEqual({ text: 'New: Waypoints', until: '2026-11-01T23:59:59.000Z' });
    expect(s.maintenance).toBeNull();
    expect(s.flags).toEqual({ starlink: false, rus_gear: true });
  });

  it('drops malformed values instead of failing', () => {
    expect(parseAppSettings(null)).toEqual(NO_SETTINGS);
    expect(parseAppSettings('x')).toEqual(NO_SETTINGS);
    const s = parseAppSettings({ announcement: { text: '' }, maintenance: { text: 'Down Sunday', until: 'soon' }, flags: [true] });
    expect(s.announcement).toBeNull();
    expect(s.maintenance).toEqual({ text: 'Down Sunday' });
    expect(s.flags).toEqual({});
  });
});

describe('liveNotice', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  it('shows until its end time, then hides', () => {
    expect(liveNotice({ text: 'a' }, now)).toEqual({ text: 'a' });
    expect(liveNotice({ text: 'a', until: '2026-10-12T23:59:59Z' }, now)).not.toBeNull();
    expect(liveNotice({ text: 'a', until: '2026-10-12T11:59:59Z' }, now)).toBeNull();
    expect(liveNotice(null, now)).toBeNull();
  });
});

describe('flagOn', () => {
  it('leaves features on unless switched off', () => {
    expect(flagOn(NO_SETTINGS, 'starlink')).toBe(true);
    expect(flagOn({ ...NO_SETTINGS, flags: { starlink: true } }, 'starlink')).toBe(true);
    expect(flagOn({ ...NO_SETTINGS, flags: { starlink: false } }, 'starlink')).toBe(false);
  });

  it('has no flag for safety features', () => {
    for (const k of APP_FLAG_KEYS) expect(k).not.toMatch(/sos|help|mechanical|share|chat|join|ride_mode|bubble/);
  });
});

describe('noticeKey', () => {
  it('changes when the wording changes', () => {
    expect(noticeKey({ text: 'a' })).toBe(noticeKey({ text: 'a' }));
    expect(noticeKey({ text: 'a' })).not.toBe(noticeKey({ text: 'b' }));
    expect(noticeKey({ text: 'a' })).not.toBe(noticeKey({ text: 'a', until: '2026-11-01T00:00:00Z' }));
  });
});
