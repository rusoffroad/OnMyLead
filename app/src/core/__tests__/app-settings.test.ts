import { describe, expect, it } from 'vitest';

import { APP_FLAG_KEYS, FLAG_GROUPS, flagChanges, flagOn, flagsInGroup, flagSince, liveNotice, NO_SETTINGS, noticeKey, parseAppSettings } from '../app-settings';

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
  it('keeps a flag that needs setup first off until the owner switches it on', () => {
    expect(flagOn(NO_SETTINGS, 'apple_web_sign_in')).toBe(false);
    expect(flagOn({ ...NO_SETTINGS, flags: { apple_web_sign_in: false } }, 'apple_web_sign_in')).toBe(false);
    expect(flagOn({ ...NO_SETTINGS, flags: { apple_web_sign_in: true } }, 'apple_web_sign_in')).toBe(true);
  });

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

describe('Admin Features page', () => {
  it('puts every flag in exactly one group, and no group is empty', () => {
    const grouped = FLAG_GROUPS.flatMap((g) => flagsInGroup(g.key));
    expect([...grouped].sort()).toEqual([...APP_FLAG_KEYS].sort());
    for (const g of FLAG_GROUPS) expect(flagsInGroup(g.key).length).toBeGreaterThan(0);
  });

  it('keeps the 4.0 switches on until the owner turns them off', () => {
    for (const k of ['route_eta', 'trail_ratings', 'ride_cards', 'social_posting', 'leaderboard', 'founder_tag'] as const) {
      expect(flagOn(NO_SETTINGS, k)).toBe(true);
      expect(flagSince(k)).toBe('4.0');
      expect(flagOn({ ...NO_SETTINGS, flags: { [k]: false } }, k)).toBe(false);
    }
  });

  it('only the flags that need setup or testing start off', () => {
    expect(APP_FLAG_KEYS.filter((k) => !flagOn(NO_SETTINGS, k)).sort()).toEqual(['apple_web_sign_in', 'radio_sharing']);
  });

  it('lists only real changes, by what the app does', () => {
    expect(flagChanges({}, { starlink: true, radio_sharing: false })).toEqual([]);
    expect(flagChanges({}, { starlink: false, radio_sharing: true })).toEqual([
      { flag: 'radio_sharing', on: true },
      { flag: 'starlink', on: false },
    ].sort((a, b) => APP_FLAG_KEYS.indexOf(a.flag as never) - APP_FLAG_KEYS.indexOf(b.flag as never)));
    expect(flagChanges({ route_eta: false }, {})).toEqual([{ flag: 'route_eta', on: true }]);
  });

  it('never offers a switch for safety or core riding', () => {
    for (const k of ['ride_mode', 'emergency', 'sos', 'need_help', 'location_sharing', 'navigation', 'chat', 'join', 'carplay']) {
      expect(APP_FLAG_KEYS as string[]).not.toContain(k);
    }
  });
});
