import { describe, expect, it } from 'vitest';

import {
  alwaysStatus,
  fromAndroidResults,
  fromBluetoothAuthorization,
  fromBrowser,
  fromExpo,
  needsAttention,
  permissionAction,
  permissionsFor,
  platformStatus,
  preciseStatus,
  PERMISSIONS,
} from '../permissions';

describe('rows per device', () => {
  it('lists the iPhone-only and Android-only rows on their own platform', () => {
    const ios = permissionsFor('ios').map((p) => p.id);
    const android = permissionsFor('android').map((p) => p.id);
    expect(ios).toEqual(expect.arrayContaining(['location', 'locationAlways', 'preciseLocation', 'notifications', 'bluetooth', 'motion', 'camera', 'tracking', 'localNetwork', 'music']));
    expect(ios).not.toContain('googleAccuracy');
    expect(android).toEqual(expect.arrayContaining(['location', 'preciseLocation', 'googleAccuracy', 'notifications', 'bluetooth', 'camera', 'music']));
    expect(android).not.toContain('locationAlways');
    expect(android).not.toContain('tracking');
    expect(permissionsFor('web').map((p) => p.id)).toEqual(['location']);
  });

  it('hides rows whose feature is off', () => {
    expect(permissionsFor('ios', ['bluetooth', 'music']).map((p) => p.id)).not.toContain('bluetooth');
  });

  it('marks location, notifications and Bluetooth as needed for a ride', () => {
    const essential = PERMISSIONS.filter((p) => p.essential).map((p) => p.id);
    expect(essential).toEqual(expect.arrayContaining(['location', 'notifications', 'bluetooth']));
    expect(essential).not.toContain('camera');
    expect(essential).not.toContain('tracking');
  });
});

describe('reading the phone', () => {
  it('maps expo answers', () => {
    expect(fromExpo({ status: 'granted', canAskAgain: true })).toBe('granted');
    expect(fromExpo({ status: 'undetermined', canAskAgain: true })).toBe('undetermined');
    expect(fromExpo({ status: 'denied', canAskAgain: true })).toBe('denied');
    expect(fromExpo({ status: 'denied', canAskAgain: false })).toBe('blocked');
    expect(fromExpo(null)).toBe('unknown');
  });

  it('treats any no on iPhone as only fixable in Settings', () => {
    expect(platformStatus('denied', 'ios')).toBe('blocked');
    expect(platformStatus('denied', 'android')).toBe('denied');
  });

  it('Always needs While Using first, then iPhone asks once', () => {
    expect(alwaysStatus('undetermined', 'undetermined')).toBe('needsFirst');
    expect(alwaysStatus('blocked', 'blocked')).toBe('needsFirst');
    expect(alwaysStatus('granted', 'undetermined')).toBe('undetermined');
    expect(alwaysStatus('granted', 'blocked')).toBe('limited');
    expect(alwaysStatus('granted', 'granted')).toBe('granted');
  });

  it('reads Approximate Location on both platforms', () => {
    expect(preciseStatus('granted', 'reduced')).toBe('limited');
    expect(preciseStatus('granted', 'coarse')).toBe('limited');
    expect(preciseStatus('granted', 'full')).toBe('granted');
    expect(preciseStatus('granted', 'fine')).toBe('granted');
    expect(preciseStatus('denied', 'fine')).toBe('needsFirst');
    expect(preciseStatus('granted', undefined)).toBe('unknown');
  });

  it('reads Bluetooth on iPhone, Android and older builds', () => {
    expect(fromBluetoothAuthorization('granted')).toBe('granted');
    expect(fromBluetoothAuthorization('denied')).toBe('blocked');
    expect(fromBluetoothAuthorization('restricted')).toBe('blocked');
    expect(fromBluetoothAuthorization('undetermined')).toBe('undetermined');
    expect(fromBluetoothAuthorization(null)).toBe('unknown');
    expect(fromAndroidResults(['granted', 'granted', 'granted'])).toBe('granted');
    expect(fromAndroidResults(['granted', 'denied', 'granted'])).toBe('denied');
    expect(fromAndroidResults(['never_ask_again', 'denied', 'granted'])).toBe('blocked');
  });

  it('reads the browser', () => {
    expect(fromBrowser('granted')).toBe('granted');
    expect(fromBrowser('prompt')).toBe('undetermined');
    expect(fromBrowser('denied')).toBe('blocked');
    expect(fromBrowser(undefined)).toBe('unknown');
  });
});

describe('what a tap does', () => {
  it('asks when the phone still can, otherwise opens Settings', () => {
    expect(permissionAction('bluetooth', 'undetermined', 'ios')).toBe('ask');
    expect(permissionAction('bluetooth', 'blocked', 'ios')).toBe('settings');
    expect(permissionAction('bluetooth', 'denied', 'android')).toBe('ask');
    expect(permissionAction('bluetooth', 'blocked', 'android')).toBe('settings');
    expect(permissionAction('notifications', 'granted', 'ios')).toBe('none');
    expect(permissionAction('locationAlways', 'needsFirst', 'ios')).toBe('ask');
    expect(permissionAction('localNetwork', 'unknown', 'ios')).toBe('settings');
  });

  it('asks Android again for Precise; iPhone needs Settings for it', () => {
    expect(permissionAction('preciseLocation', 'limited', 'android')).toBe('ask');
    expect(permissionAction('preciseLocation', 'limited', 'ios')).toBe('settings');
    expect(permissionAction('locationAlways', 'limited', 'ios')).toBe('settings');
  });

  it('opens Notification Access for Android music, never a question', () => {
    expect(permissionAction('music', 'denied', 'android')).toBe('settings');
    expect(permissionAction('music', 'undetermined', 'ios')).toBe('ask');
  });

  it('website: asks unless the browser blocked it', () => {
    expect(permissionAction('location', 'undetermined', 'web')).toBe('ask');
    expect(permissionAction('location', 'unknown', 'web')).toBe('ask');
    expect(permissionAction('location', 'blocked', 'web')).toBe('none');
  });
});

describe('the summary', () => {
  it('counts only needed rows that are not allowed', () => {
    const rows = permissionsFor('ios').map((def) => ({
      def,
      status: def.id === 'bluetooth' ? ('blocked' as const) : def.id === 'camera' ? ('blocked' as const) : def.id === 'localNetwork' ? ('unknown' as const) : ('granted' as const),
    }));
    expect(needsAttention(rows)).toEqual(['bluetooth']);
  });
});
