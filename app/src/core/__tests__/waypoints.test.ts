import { describe, expect, it } from 'vitest';

import {
  canRemoveWaypoint, canShareWaypoints, cleanWaypointName, friendlyWaypointError, isWaypointsNotSwitchedOn, sortWaypoints,
  suggestWaypointName, waypointAudience, waypointNameProblem,
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
