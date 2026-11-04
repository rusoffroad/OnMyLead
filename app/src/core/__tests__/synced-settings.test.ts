import { describe, expect, it } from 'vitest';

import {
  agoText, areasToOffer, DEVICE_ONLY, isNewer, isSyncedKey, mergeSynced, offlineAreaKey, offlineAreaValue, parseOfflineArea,
  parseSyncedMap, seedFromDevice, stamp, syncSummary, SYNCED_SETTINGS, MAX_VALUE_LENGTH,
} from '../synced-settings';
import { RADIUS_STORAGE_KEY } from '../home';
import { TRACK_LINE_STORAGE_KEY, TRACK_LINE_SWITCH_KEY } from '../track-line';

describe('which settings follow the account', () => {
  it('syncs the rider’s choices and keeps device things on the device', () => {
    for (const k of ['map.layers.v1', 'map.followMe.v1', 'directions.app.v1', 'ride.savedReplies.v1', RADIUS_STORAGE_KEY, TRACK_LINE_SWITCH_KEY]) {
      expect(isSyncedKey(k)).toBe(true);
    }
    for (const k of Object.keys(DEVICE_ONLY)) expect(isSyncedKey(k)).toBe(false);
  });

  it('never syncs location history', () => {
    for (const k of [TRACK_LINE_STORAGE_KEY, 'nav.recording.v1', 'ride.trackQueue.v2', 'ride.trackContext.v1']) {
      expect(isSyncedKey(k)).toBe(false);
      expect(DEVICE_ONLY[k]).toBeTruthy();
    }
  });

  it('keeps the battery choice and the rider agreement per device', () => {
    expect(isSyncedKey('battery.mode.v1')).toBe(false);
    expect(isSyncedKey('onmylead.riderAgreement')).toBe(false);
  });

  it('lists no key in both places', () => {
    for (const k of Object.keys(SYNCED_SETTINGS)) expect(DEVICE_ONLY[k]).toBeUndefined();
  });

  it('syncs each offline area as its own entry', () => {
    expect(isSyncedKey(offlineAreaKey('abc'))).toBe(true);
    expect(isSyncedKey('offline-maps.area.')).toBe(false);
    expect(offlineAreaKey('a/b c')).toBe('offline-maps.area.abc');
  });
});

describe('merging two devices', () => {
  const phone = { 'map.followMe.v1': { v: '0', at: 2000 }, 'directions.app.v1': { v: 'google', at: 1000 } };
  const account = { 'map.followMe.v1': { v: '1', at: 1000 }, 'map.layers.v1': { v: '{"base":"topo"}', at: 1500 }, 'directions.app.v1': { v: 'apple', at: 3000 } };

  it('keeps the newer change setting by setting', () => {
    const { merged, apply, push } = mergeSynced(phone, account);
    expect(merged['map.followMe.v1'].v).toBe('0');
    expect(merged['directions.app.v1'].v).toBe('apple');
    expect(merged['map.layers.v1'].v).toBe('{"base":"topo"}');
    expect(Object.keys(push)).toEqual(['map.followMe.v1']);
    expect(Object.keys(apply).sort()).toEqual(['directions.app.v1', 'map.layers.v1']);
  });

  it('does nothing when both sides agree', () => {
    const { apply, push } = mergeSynced(account, account);
    expect(apply).toEqual({});
    expect(push).toEqual({});
  });

  it('breaks a tie the same way on every device', () => {
    const a = { v: 'apple', at: 5 };
    const b = { v: 'google', at: 5 };
    expect(isNewer(b, a)).toBe(true);
    expect(isNewer(a, b)).toBe(false);
  });

  it('stamps a change later than the last one even if the clock went back', () => {
    expect(stamp({ v: 'x', at: 9000 }, 'y', 5000).at).toBe(9001);
    expect(stamp(undefined, 'y', 5000)).toEqual({ v: 'y', at: 5000 });
  });

  it('lets the account win over settings set before sync, and fills the gaps', () => {
    const seeded = seedFromDevice({ 'map.followMe.v1': '0', 'map.layers.v1': null, 'battery.mode.v1': 'saver' }, true);
    expect(seeded).toEqual({ 'map.followMe.v1': { v: '0', at: 0 } });
    expect(mergeSynced(seeded, account).merged['map.followMe.v1'].v).toBe('1');
    expect(mergeSynced(seeded, {}).push['map.followMe.v1'].v).toBe('0');
  });

  it('never carries one rider’s settings into another account', () => {
    expect(seedFromDevice({ 'map.followMe.v1': '0' }, false)).toEqual({});
  });

  it('drops malformed entries from storage or the server', () => {
    expect(
      parseSyncedMap({
        good: { v: 'x', at: 1.7 },
        cleared: { v: null, at: 2 },
        'bad key': { v: 'x', at: 1 },
        noTime: { v: 'x' },
        number: { v: 5, at: 1 },
        huge: { v: 'x'.repeat(MAX_VALUE_LENGTH + 1), at: 1 },
      }),
    ).toEqual({ good: { v: 'x', at: 1 }, cleared: { v: null, at: 2 } });
    expect(parseSyncedMap(null)).toEqual({});
    expect(parseSyncedMap([1])).toEqual({});
  });
});

describe('offline areas from other devices', () => {
  const area = { id: 'm1', name: 'Moab', kind: 'area' as const, box: { minLat: 38, minLng: -110, maxLat: 39, maxLng: -109 }, choices: ['topo'], createdAt: '2026-11-01T00:00:00Z' };

  it('round-trips only what another device needs', () => {
    const v = offlineAreaValue({ ...area, ...({ bytes: 9, status: 'done' } as object) });
    expect(JSON.parse(v)).toEqual(area);
    expect(parseOfflineArea(v)).toEqual(area);
    expect(parseOfflineArea('{"id":1}')).toBeNull();
    expect(parseOfflineArea('nope')).toBeNull();
  });

  it('offers areas this device doesn’t have, newest first', () => {
    const older = { ...area, id: 'm0', createdAt: '2026-10-01T00:00:00Z' };
    const ride = { ...area, id: 'r9', kind: 'ride' as const, rideId: 'ride-1', createdAt: '2026-11-02T00:00:00Z' };
    const offered = areasToOffer([offlineAreaValue(older), offlineAreaValue(area), offlineAreaValue(ride), null], [{ id: 'm1' }, { id: 'x', rideId: 'ride-1' }]);
    expect(offered.map((a) => a.id)).toEqual(['m0']);
  });
});

describe('the You tab line', () => {
  const now = 10 * 3600_000;
  it('says when the device last synced', () => {
    expect(syncSummary({ lastSyncedAt: now - 3 * 60_000, syncing: false, failed: false }, now)).toMatch(/Synced 3 min ago$/);
    expect(syncSummary({ lastSyncedAt: null, syncing: true, failed: false }, now)).toBe('Syncing now…');
    expect(syncSummary({ lastSyncedAt: now - 2 * 3600_000, syncing: false, failed: true }, now)).toBe('Waiting for signal. Last synced 2 hours ago');
    expect(syncSummary({ lastSyncedAt: null, syncing: false, failed: true }, now)).toBe('Waiting for signal to sync');
  });
  it('reads naturally', () => {
    expect(agoText(10_000)).toBe('just now');
    expect(agoText(3600_000)).toBe('1 hour ago');
    expect(agoText(30 * 3600_000)).toBe('yesterday');
    expect(agoText(80 * 3600_000)).toBe('3 days ago');
  });
});
