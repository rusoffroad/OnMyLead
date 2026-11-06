import { describe, expect, it } from 'vitest';

import { NO_SETTINGS, parseAppSettings } from '../app-settings';
import {
  compareVersions, isVersion, newestVersion, NO_VERSIONS, noticeForVersion, parseAppStoreLookup, parseAppVersions, parsePlayPage,
  updateState, versionLabel, versionsProblem, versionsValue,
  type AppVersions,
} from '../app-versions';

const v = (o: Partial<AppVersions>): AppVersions => ({ ...NO_VERSIONS, ...o });

describe('compareVersions', () => {
  it('compares number by number', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.2', '1.0.3')).toBe(-1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('2', '1.9.9')).toBe(1);
    expect(compareVersions(' 1.1 ', '1.1.0')).toBe(0);
  });

  it('knows a version when it sees one', () => {
    expect(isVersion('1.0.3')).toBe(true);
    expect(isVersion('1')).toBe(true);
    expect(isVersion('1.0.3.4')).toBe(false);
    expect(isVersion('v1.0')).toBe(false);
    expect(isVersion('')).toBe(false);
    expect(isVersion(3)).toBe(false);
  });
});

describe('parseAppVersions', () => {
  it('reads both stores and the version notice', () => {
    expect(parseAppVersions({
      ios: { minimum: '1.0.2', latest: '1.0.4' },
      android: { latest: '1.0.4' },
      notice: { versions: ['1.0.3', 'bad'], text: ' Chat is broken in 1.0.3 ', until: '2026-11-10T00:00:00Z' },
    })).toEqual({
      ios: { minimum: '1.0.2', latest: '1.0.4' },
      android: { minimum: null, latest: '1.0.4' },
      notice: { versions: ['1.0.3'], text: 'Chat is broken in 1.0.3', until: '2026-11-10T00:00:00Z' },
    });
  });

  it('drops anything malformed instead of failing', () => {
    expect(parseAppVersions(null)).toEqual(NO_VERSIONS);
    expect(parseAppVersions([])).toEqual(NO_VERSIONS);
    expect(parseAppVersions({ ios: { minimum: 'soon' }, notice: { versions: [], text: 'x' } })).toEqual(NO_VERSIONS);
    expect(parseAppVersions({ notice: { versions: ['1.0.3'], text: '' } }).notice).toBeNull();
  });

  it('comes with the other app settings, and older servers send none', () => {
    expect(parseAppSettings({ flags: {} }).versions).toEqual(NO_VERSIONS);
    expect(NO_SETTINGS.versions).toEqual(NO_VERSIONS);
    expect(parseAppSettings({ app_versions: { android: { minimum: '1.0.1' } } }).versions.android.minimum).toBe('1.0.1');
  });
});

describe('updateState', () => {
  const controls = v({ ios: { minimum: '1.0.2', latest: '1.0.4' }, android: { minimum: null, latest: '1.0.4' } });

  it('asks riders below the minimum to update', () => {
    expect(updateState(controls, 'ios', '1.0.1')).toEqual({ kind: 'required', minimum: '1.0.2' });
  });

  it('tells riders when a newer version is waiting', () => {
    expect(updateState(controls, 'ios', '1.0.3')).toEqual({ kind: 'available', latest: '1.0.4' });
    expect(updateState(controls, 'android', '1.0.1')).toEqual({ kind: 'available', latest: '1.0.4' });
  });

  it('shows nothing when up to date, on the website, or without a version', () => {
    expect(updateState(controls, 'ios', '1.0.4')).toEqual({ kind: 'none' });
    expect(updateState(controls, 'ios', '1.1')).toEqual({ kind: 'none' });
    expect(updateState(controls, 'web', '1.0.0')).toEqual({ kind: 'none' });
    expect(updateState(controls, 'android', null)).toEqual({ kind: 'none' });
    expect(updateState(NO_VERSIONS, 'ios', '1.0.0')).toEqual({ kind: 'none' });
  });
});

describe('noticeForVersion', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const controls = v({ notice: { versions: ['1.0.3'], text: 'Fix coming', until: '2026-11-06T00:00:00Z' } });

  it('shows only on the listed versions', () => {
    expect(noticeForVersion(controls, 'ios', '1.0.3', now)?.text).toBe('Fix coming');
    expect(noticeForVersion(controls, 'android', '1.0.3', now)?.text).toBe('Fix coming');
    expect(noticeForVersion(controls, 'ios', '1.0.4', now)).toBeNull();
    expect(noticeForVersion(controls, 'web', '1.0.3', now)).toBeNull();
  });

  it('hides once its time is up', () => {
    expect(noticeForVersion(controls, 'ios', '1.0.3', Date.parse('2026-11-06T00:00:01Z'))).toBeNull();
  });
});

describe('versionsProblem and versionsValue', () => {
  it('refuses a minimum newer than the latest', () => {
    expect(versionsProblem(v({ ios: { minimum: '1.0.5', latest: '1.0.4' } }))).toMatch(/iPhone and iPad/);
    expect(versionsProblem(v({ android: { minimum: '1.0.4', latest: '1.0.4' } }))).toBeNull();
  });

  it('saves only what is set', () => {
    expect(versionsValue(NO_VERSIONS)).toEqual({});
    expect(versionsValue(v({ android: { minimum: '1.0.2', latest: null } }))).toEqual({ android: { minimum: '1.0.2' } });
  });
});

describe('store version (automatic Update Available)', () => {
  it('reads the App Store lookup and the Google Play page', () => {
    expect(parseAppStoreLookup({ resultCount: 1, results: [{ version: '1.0.4', trackName: 'OnMyLead' }] })).toBe('1.0.4');
    expect(parseAppStoreLookup({ resultCount: 0, results: [] })).toBeNull();
    expect(parseAppStoreLookup({ results: [{ version: 'beta' }] })).toBeNull();
    expect(parseAppStoreLookup(null)).toBeNull();
    expect(parseAppStoreLookup('nope')).toBeNull();
    expect(parsePlayPage('x,[[["1.0.3"]],[[[36]],[[[24,"7.0"]]]]],y')).toBe('1.0.3');
    expect(parsePlayPage('<html>Varies with device</html>')).toBeNull();
  });

  it('shows Update Available from the store with nothing set on the Releases page', () => {
    expect(updateState(NO_VERSIONS, 'ios', '1.0.3', '1.0.4')).toEqual({ kind: 'available', latest: '1.0.4' });
    expect(updateState(NO_VERSIONS, 'android', '1.0.3', '1.0.4')).toEqual({ kind: 'available', latest: '1.0.4' });
    // Same or older in the store (a build waiting for review, or a test build): nothing.
    expect(updateState(NO_VERSIONS, 'ios', '1.0.4', '1.0.4')).toEqual({ kind: 'none' });
    expect(updateState(NO_VERSIONS, 'ios', '1.0.4', '1.0')).toEqual({ kind: 'none' });
    expect(updateState(NO_VERSIONS, 'ios', '1.0.3', null)).toEqual({ kind: 'none' });
    expect(updateState(NO_VERSIONS, 'web', '1.0.3', '1.0.4')).toEqual({ kind: 'none' });
  });

  it('uses the newer of the store and the Releases page, and minimum still wins', () => {
    const set = parseAppVersions({ ios: { minimum: '1.0.2', latest: '1.0.5' } });
    expect(updateState(set, 'ios', '1.0.3', '1.0.4')).toEqual({ kind: 'available', latest: '1.0.5' });
    expect(updateState(parseAppVersions({ ios: { latest: '1.0.4' } }), 'ios', '1.0.3', '1.0.6')).toEqual({ kind: 'available', latest: '1.0.6' });
    expect(updateState(set, 'ios', '1.0.1', '1.0.4')).toEqual({ kind: 'required', minimum: '1.0.2' });
    expect(newestVersion('1.0.10', '1.0.9')).toBe('1.0.10');
    expect(newestVersion(null, 'x')).toBeNull();
    expect(newestVersion(undefined, '1.1')).toBe('1.1');
  });
});

describe('versionLabel', () => {
  it('shows the version and build number', () => {
    expect(versionLabel('2.1', '10')).toBe('2.1 (10)');
    expect(versionLabel('2.1.1', 11)).toBe('2.1.1 (11)');
  });

  it('shows the version alone when the build is unknown', () => {
    expect(versionLabel('2.1', null)).toBe('2.1');
    expect(versionLabel('2.1', ' ')).toBe('2.1');
  });

  it('shows nothing without a version (the website)', () => {
    expect(versionLabel(null, '10')).toBeNull();
    expect(versionLabel(undefined, undefined)).toBeNull();
    expect(versionLabel('', '10')).toBeNull();
  });
});
