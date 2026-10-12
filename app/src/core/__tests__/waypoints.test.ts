import { describe, expect, it } from 'vitest';

import {
  canEditWaypoint, canRemoveWaypoint, canShareWaypoints, cleanWaypointName, friendlyWaypointError, isPlannedStopsNotSwitchedOn,
  isWaypointsNotSwitchedOn, moveStop, parseStopTime, plannedStops, sortWaypoints, stopNumber, stopTimeInput, stopTimeLabel,
  suggestWaypointName, waypointAudience, waypointNameProblem, type Waypoint,
} from '../waypoints';

describe('waypoint names', () => {
  it('tidies and checks length', () => {
    expect(cleanWaypointName('  Lunch   Spot ')).toBe('Lunch Spot');
    expect(waypointNameProblem('  ')).toMatch(/name/);
    expect(waypointNameProblem('x'.repeat(61))).toMatch(/60/);
    expect(waypointNameProblem('Camp')).toBeNull();
  });
  it('suggests the kind, numbered when taken', () => {
    expect(suggestWaypointName('camp', [])).toBe('Camp');
    expect(suggestWaypointName('camp', [{ name: 'camp' }])).toBe('Camp 2');
    expect(suggestWaypointName('view', [{ name: 'Viewpoint' }, { name: 'Viewpoint 2' }])).toBe('Viewpoint 3');
  });
});

describe('who can share', () => {
  const joined = (role: string) => ({ status: 'joined', role });
  it('lets the leader and organizers share, not riders', () => {
    expect(canShareWaypoints('l', joined('leader'), ['l'])).toBe(true);
    expect(canShareWaypoints('o', joined('organizer'), ['l'])).toBe(true);
    expect(canShareWaypoints('c', joined('co_organizer'), ['l'])).toBe(true);
    expect(canShareWaypoints('r', joined('rider'), ['l'])).toBe(false);
    expect(canShareWaypoints('s', joined('sweep'), ['l'])).toBe(false);
  });
  it('needs a joined rider', () => {
    expect(canShareWaypoints('l', { status: 'pending', role: 'leader' }, ['l'])).toBe(false);
    expect(canShareWaypoints(null, joined('leader'), ['l'])).toBe(false);
  });
  it('removing: your own, or a shared one when you can share', () => {
    expect(canRemoveWaypoint({ user_id: 'me', shared: false }, 'me', false)).toBe(true);
    expect(canRemoveWaypoint({ user_id: 'x', shared: true }, 'me', false)).toBe(false);
    expect(canRemoveWaypoint({ user_id: 'x', shared: true }, 'me', true)).toBe(true);
    expect(canRemoveWaypoint({ user_id: 'x', shared: false }, 'me', true)).toBe(false);
  });
});

describe('labels and order', () => {
  it('says who sees it', () => {
    expect(waypointAudience({ user_id: 'me', shared: false }, 'me', 'Liam')).toBe('Only You');
    expect(waypointAudience({ user_id: 'me', shared: true }, 'me', 'Liam')).toBe('Shared with Everyone');
    expect(waypointAudience({ user_id: 'l', shared: true }, 'me', 'Liam')).toBe('From Liam');
  });
  it('puts shared first, then oldest first', () => {
    const list = [
      { id: 'a', shared: false, created_at: '2026-10-12T10:00:00Z' },
      { id: 'b', shared: true, created_at: '2026-10-12T11:00:00Z' },
      { id: 'c', shared: true, created_at: '2026-10-12T09:00:00Z' },
    ];
    expect(sortWaypoints(list).map((w) => w.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('errors', () => {
  it('spots a server without waypoints', () => {
    expect(isWaypointsNotSwitchedOn('relation "ride_waypoints" does not exist', '42P01')).toBe(true);
    expect(isWaypointsNotSwitchedOn("Could not find the table 'public.ride_waypoints' in the schema cache", 'PGRST205')).toBe(true);
    expect(isWaypointsNotSwitchedOn('new row violates row-level security policy for table "ride_waypoints"')).toBe(false);
    expect(friendlyWaypointError('x', 'PGRST205')).toMatch(/not switched on/);
    expect(friendlyWaypointError('waypoint_limit: 100 waypoints per ride')).toMatch(/100/);
    expect(friendlyWaypointError('new row violates row-level security policy')).toMatch(/leader/);
  });
});

describe('planned stops', () => {
  const wp = (id: string, extra: Partial<Waypoint> = {}): Waypoint => ({
    id, ride_id: 'r', user_id: 'l', name: id, kind: 'spot', note: null, lat: 0, lng: 0, shared: false,
    created_at: `2026-10-12T10:0${id.length}:00Z`, updated_at: '', ...extra,
  });
  const list = [
    wp('mine'),
    wp('lunch', { shared: true, planned_stop: true, stop_order: 5 }),
    wp('fuel', { shared: true, planned_stop: true, stop_order: 2 }),
    wp('view', { shared: true }),
  ];
  it('puts stops first in ride order, then shared, then your own', () => {
    expect(sortWaypoints(list).map((w) => w.id)).toEqual(['fuel', 'lunch', 'view', 'mine']);
    expect(plannedStops(list).map((w) => w.id)).toEqual(['fuel', 'lunch']);
  });
  it('numbers stops by place, not by the stored order', () => {
    expect(stopNumber(list[1], list)).toBe(2);
    expect(stopNumber(list[2], list)).toBe(1);
    expect(stopNumber(list[0], list)).toBeNull();
  });
  it('reads and shows planned times', () => {
    expect(parseStopTime('12:30 pm')).toBe('12:30');
    expect(parseStopTime('9 am')).toBe('09:00');
    expect(parseStopTime('  ')).toBe('');
    expect(parseStopTime('lunchtime')).toBeNull();
    expect(stopTimeLabel('12:30:00')).toBe('12:30 PM');
    expect(stopTimeLabel('00:05:00')).toBe('12:05 AM');
    expect(stopTimeLabel(null)).toBeNull();
    expect(stopTimeInput('14:00:00')).toBe('2:00 pm');
  });
  it('moves a stop one place', () => {
    expect(moveStop(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveStop(['a', 'b', 'c'], 'c', 1)).toBeNull();
  });
  it('lets only the leader change a planned stop', () => {
    const stop = { user_id: 'old', planned_stop: true };
    expect(canEditWaypoint(stop, 'new', true)).toBe(true);
    expect(canEditWaypoint(stop, 'old', false)).toBe(false);
    expect(canEditWaypoint({ user_id: 'me', planned_stop: false }, 'me', false)).toBe(true);
    expect(waypointAudience({ user_id: 'l', shared: true, planned_stop: true }, 'r', 'Liam')).toBe('Planned Stop');
  });
  it('spots a server without planned stops', () => {
    expect(isPlannedStopsNotSwitchedOn('column ride_waypoints.planned_stop does not exist', '42703')).toBe(true);
    expect(isPlannedStopsNotSwitchedOn("Could not find the 'planned_stop' column of 'ride_waypoints' in the schema cache", 'PGRST204')).toBe(true);
    expect(isPlannedStopsNotSwitchedOn('new row violates row-level security policy', '42501')).toBe(false);
    expect(friendlyWaypointError('column ride_waypoints.stop_time does not exist', '42703')).toMatch(/Planned stops are not switched on/);
  });
});
