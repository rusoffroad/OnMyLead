import { describe, expect, it } from 'vitest';

import {
  editMapWaypoint, mapWaypointId, mapWaypointTime, newMapWaypoint, parseBackupList, parseMapWaypoints, planMapWaypointSync,
  visibleMapWaypoints,
} from '../map-waypoints';

const T0 = Date.parse('2026-11-04T10:00:00Z');
const draft = { name: '  Hot   Spring ', symbol: 'water' as const, note: '  Warm  ', lat: 38.5, lng: -109.5 };

describe('Map Mode waypoints', () => {
  it('makes a private waypoint with the symbol and its original kind', () => {
    const w = newMapWaypoint(draft, 'mw-1', 'me', T0);
    expect(w).toMatchObject({ id: 'mw-1', ride_id: '', user_id: 'me', name: 'Hot Spring', symbol: 'water', kind: 'water', note: 'Warm', shared: false });
    expect(mapWaypointTime(w)).toBe(T0);
    expect(newMapWaypoint(draft, 'mw-2', null, T0).user_id).toBe('');
  });

  it('edits keep the spot and always move the time forward', () => {
    const w = newMapWaypoint(draft, 'mw-1', 'me', T0);
    const e = editMapWaypoint(w, { name: 'Gate', symbol: 'gate', note: '' }, T0 - 5000);
    expect(e).toMatchObject({ name: 'Gate', symbol: 'gate', note: null, lat: 38.5, lng: -109.5, shared: false });
    expect(mapWaypointTime(e)).toBeGreaterThan(T0);
  });

  it('shows the rider their own and the ones dropped signed out, oldest first', () => {
    const a = newMapWaypoint(draft, 'a', 'me', T0 + 1000);
    const b = newMapWaypoint(draft, 'b', '', T0);
    const c = newMapWaypoint(draft, 'c', 'someone-else', T0);
    expect(visibleMapWaypoints([a, b, c], 'me').map((w) => w.id)).toEqual(['b', 'a']);
    expect(visibleMapWaypoints([a, b, c], null).map((w) => w.id)).toEqual(['b']);
  });

  it('makes ids that fit the backup', () => {
    const id = mapWaypointId(T0, 0.5);
    expect(id).toMatch(/^mw-[0-9a-z]+-[0-9a-z]+$/);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(mapWaypointId(T0, 0.25)).not.toBe(id);
  });

  it('reads stored and server lists safely', () => {
    expect(parseMapWaypoints('junk')).toEqual([]);
    expect(parseMapWaypoints([{ id: 'x' }, null, newMapWaypoint(draft, 'ok', 'me', T0)]).map((w) => w.id)).toEqual(['ok']);
    expect(parseBackupList([{ waypoint_id: 'a', deleted: false, updated_at: '2026-11-04T10:00:00Z' }, { nope: 1 }])).toEqual([{ id: 'a', deleted: false, at: T0 }]);
  });
});

describe('Map Mode waypoint sync', () => {
  const mine = (id: string, at: number, owner = 'me') => newMapWaypoint(draft, id, owner, at);

  it('sends new and newer ones, fetches newer and missing ones, drops ones deleted elsewhere', () => {
    const plan = planMapWaypointSync(
      [mine('new', T0), mine('newer-here', T0 + 10), mine('newer-there', T0), mine('gone-there', T0), mine('same', T0)],
      {},
      [
        { id: 'newer-here', deleted: false, at: T0 },
        { id: 'newer-there', deleted: false, at: T0 + 10 },
        { id: 'gone-there', deleted: true, at: T0 + 10 },
        { id: 'same', deleted: false, at: T0 },
        { id: 'only-there', deleted: false, at: T0 },
        { id: 'old-delete', deleted: true, at: T0 },
      ],
      'me',
    );
    expect(plan.upload.map((w) => w.id)).toEqual(['new', 'newer-here']);
    expect(plan.restore.sort()).toEqual(['newer-there', 'only-there']);
    expect(plan.removeLocal).toEqual(['gone-there']);
    expect(plan.markDeleted).toEqual([]);
  });

  it('sends deletes made here unless the waypoint changed later on another device', () => {
    const plan = planMapWaypointSync(
      [],
      { del: T0 + 10, 'edited-later': T0, 'never-sent': T0, 'already-gone': T0 },
      [
        { id: 'del', deleted: false, at: T0 },
        { id: 'edited-later', deleted: false, at: T0 + 10 },
        { id: 'already-gone', deleted: true, at: T0 },
      ],
      'me',
    );
    expect(plan.markDeleted).toEqual([{ id: 'del', at: T0 + 10 }]);
    expect(plan.restore).toEqual(['edited-later']);
    expect(plan.settledTombstones.sort()).toEqual(['already-gone', 'edited-later', 'never-sent']);
  });

  it('claims the ones dropped signed out and leaves another account’s alone', () => {
    const plan = planMapWaypointSync([mine('anon', T0, ''), mine('theirs', T0, 'someone-else')], {}, [], 'me');
    expect(plan.upload.map((w) => w.id)).toEqual(['anon']);
  });
});
