import { describe, expect, it } from 'vitest';

import { fuzzLocation } from '../geo';
import {
  canEditRide, canEditWhenAndWhere, changeLabel, editedAgo, formFromRide, isEmptyPatch, parseCoords, publicAreaLabel, ridePatch,
  type EditablePrivate, type EditableRide, type RidePatch,
} from '../ride-edit';

const meet = new Date(2026, 10, 14, 8, 0); // Sat Nov 14 2026, 8:00 am local
const area = fuzzLocation({ lat: 38.5733, lng: -109.5498 });
const ride: EditableRide = {
  name: 'Hell’s Revenge',
  description: 'Easy pace',
  meet_at: meet.toISOString(),
  depart_at: new Date(2026, 10, 14, 8, 30).toISOString(),
  expected_finish_at: null,
  meet_area_lat: area.lat,
  meet_area_lng: area.lng,
  meet_area_label: 'Moab, UT',
  meet_state: 'UT',
  destination_label: null,
  vehicle_types: ['SXS/UTV'],
  difficulty: 'hard',
  experience_level: null,
  max_riders: null,
  max_vehicles: 12,
  what_to_bring: null,
  required_equipment: 'Whip flag',
  fuel_notes: null,
  route_miles: 14,
  visibility: 'public',
  join_policy: 'open',
  status: 'scheduled',
};
const details: EditablePrivate = { meet_lat: 38.5733, meet_lng: -109.5498, meet_label: 'Maverik, Main St, Moab, UT', instructions: null };
const now = new Date(2026, 10, 4, 12, 0);

const patch = (form: Partial<ReturnType<typeof formFromRide>>, r = ride, d: EditablePrivate | null = details) =>
  ridePatch(r, d, { ...formFromRide(r, d), ...form }, now) as RidePatch;

describe('who can edit', () => {
  it('lets the leader edit until the ride ends, and only the details once it is live', () => {
    expect(canEditRide('scheduled', true)).toBe(true);
    expect(canEditRide('live', true)).toBe(true);
    expect(canEditRide('ended', true)).toBe(false);
    expect(canEditRide('cancelled', true)).toBe(false);
    expect(canEditRide('scheduled', false)).toBe(false);
    expect(canEditWhenAndWhere('scheduled')).toBe(true);
    expect(canEditWhenAndWhere('live')).toBe(false);
  });
});

describe('formFromRide', () => {
  it('fills the form with the ride as it is', () => {
    const f = formFromRide(ride, details);
    expect(f.name).toBe('Hell’s Revenge');
    expect(f.meetTime).toBe('8:00 am');
    expect(f.departTime).toBe('8:30 am');
    expect(f.finishTime).toBe('');
    expect(f.coords).toBe('38.57330, -109.54980');
    expect(f.maxVehicles).toBe('12');
    expect(f.routeMiles).toBe('14');
    expect(new Date(f.day).getDate()).toBe(14);
  });

  it('saves nothing when nothing changed', () => {
    const p = patch({});
    expect(isEmptyPatch(p)).toBe(true);
    expect(p.changed).toEqual([]);
  });

  it('ignores the seconds on a saved time', () => {
    const withSeconds = { ...ride, meet_at: new Date(2026, 10, 14, 8, 0, 37).toISOString() };
    expect(isEmptyPatch(patch({}, withSeconds))).toBe(true);
  });
});

describe('ridePatch', () => {
  it('gives a ride with no saved spot one, and leaves it alone until the leader fills it in', () => {
    expect(isEmptyPatch(patch({}, ride, null))).toBe(true);
    const p = patch({ coords: '38.57, -109.55', meetLabel: 'Lions Park' }, ride, null);
    expect(p.private).toMatchObject({ meet_lat: 38.57, meet_lng: -109.55, meet_label: 'Lions Park' });
    expect(p.changed).toContain('place');
    // Instructions ride along with the spot; alone, the server would have no row to put them on.
    const both = patch({ coords: '38.57, -109.55', instructions: 'Air down at the lot' }, ride, null);
    expect(both.private).toMatchObject({ meet_lat: 38.57, instructions: 'Air down at the lot' });
    expect(both.changed).toEqual(['place', 'details']);
    expect(isEmptyPatch(patch({ instructions: 'Air down' }, ride, null))).toBe(true);
  });

  it('sends only the name when only the name changed', () => {
    const p = patch({ name: '  Fins and Things  ' });
    expect(p.ride).toEqual({ name: 'Fins and Things' });
    expect(p.private).toBeNull();
    expect(p.changed).toEqual(['name']);
  });

  it('refuses an empty or too-long name', () => {
    expect(ridePatch(ride, details, { ...formFromRide(ride, details), name: ' ' }, now)).toEqual({ error: 'Give the ride a name.' });
    expect('error' in ridePatch(ride, details, { ...formFromRide(ride, details), name: 'x'.repeat(121) }, now)).toBe(true);
  });

  it('moves the meeting time on the same day', () => {
    const p = patch({ meetTime: '9:15 am' });
    expect(p.ride.meet_at).toBe(new Date(2026, 10, 14, 9, 15).toISOString());
    expect(p.changed).toEqual(['time']);
  });

  it('moves the ride to another day, keeping the times', () => {
    const p = patch({ day: new Date(2026, 10, 21).getTime() });
    expect(p.ride.meet_at).toBe(new Date(2026, 10, 21, 8, 0).toISOString());
    expect(p.ride.depart_at).toBe(new Date(2026, 10, 21, 8, 30).toISOString());
    expect(p.changed).toEqual(['time']);
  });

  it('refuses a new day in the past', () => {
    const r = ridePatch(ride, details, { ...formFromRide(ride, details), day: new Date(2026, 9, 1).getTime() }, now);
    expect(r).toEqual({ error: 'Pick a day from today up to three years out.' });
  });

  it('keeps a ride already on its day even if that day has passed', () => {
    const late = new Date(2026, 10, 15, 1, 0);
    const r = ridePatch(ride, details, { ...formFromRide(ride, details), name: 'Still On' }, late);
    expect('error' in r).toBe(false);
  });

  it('clears an optional time', () => {
    const p = patch({ departTime: '' });
    expect(p.ride).toEqual({ depart_at: null });
    expect(p.changed).toEqual(['time']);
  });

  it('moves the exact spot, and the public area only when it crosses into another square mile', () => {
    const near = patch({ coords: '38.57340, -109.54990' });
    expect(near.private).toEqual({ meet_lat: 38.5734, meet_lng: -109.5499 });
    expect(near.ride.meet_area_lat).toBeUndefined();
    expect(near.changed).toEqual(['place']);

    const far = patch({ coords: '38.70000, -109.40000', meetLabel: 'Trailhead, Green River, UT' });
    expect(far.private).toEqual({ meet_lat: 38.7, meet_lng: -109.4, meet_label: 'Trailhead, Green River, UT' });
    expect(far.ride.meet_area_lat).toBe(fuzzLocation({ lat: 38.7, lng: -109.4 }).lat);
    expect(far.ride.meet_area_label).toBe('Green River, UT');
  });

  it('never puts the exact spot in the public ride row', () => {
    const p = patch({ coords: '38.70000, -109.40000' });
    expect(JSON.stringify(p.ride)).not.toContain('38.7,');
    expect(p.ride.meet_area_lat).not.toBe(38.7);
  });

  it('refuses a meeting point it can’t read', () => {
    expect(ridePatch(ride, details, { ...formFromRide(ride, details), coords: 'Moab' }, now)).toHaveProperty('error');
  });

  it('leaves the day, times and spot alone once the ride is live', () => {
    const live = { ...ride, status: 'live' as const };
    const p = patch({ meetTime: '11:00 am', coords: '0, 0', description: 'Running late, fuel stop first' }, live);
    expect(p.ride).toEqual({ description: 'Running late, fuel stop first' });
    expect(p.changed).toEqual(['details']);
  });

  it('saves details, limits and the joining choice', () => {
    const p = patch({
      vehicleTypes: ['SXS/UTV', 'ATV'], maxVehicles: '', maxRiders: '20', routeMiles: '18.5', instructions: 'Air down at the lot',
      joinPolicy: 'approval', difficulty: 'extreme',
    });
    expect(p.ride).toEqual({
      vehicle_types: ['SXS/UTV', 'ATV'], max_vehicles: null, max_riders: 20, route_miles: 18.5, join_policy: 'approval', difficulty: 'extreme',
    });
    expect(p.private).toEqual({ instructions: 'Air down at the lot' });
    expect(p.changed).toEqual(['details']);
  });

  it('keeps a private ride open to anyone with the code', () => {
    const priv = { ...ride, visibility: 'private' as const };
    expect(patch({ joinPolicy: 'approval' }, priv).ride.join_policy).toBeUndefined();
  });

  it('refuses a route length that isn’t a number', () => {
    expect(ridePatch(ride, details, { ...formFromRide(ride, details), routeMiles: 'far' }, now)).toHaveProperty('error');
  });

  it('works for a leader without the private details loaded', () => {
    const p = patch({ name: 'New Name' }, ride, null);
    expect(p.private).toBeNull();
    expect(p.ride).toEqual({ name: 'New Name' });
  });
});

describe('what riders see', () => {
  it('names what changed', () => {
    expect(changeLabel(['time'])).toBe('New Time');
    expect(changeLabel(['place', 'time'])).toBe('New Time and Meeting Point');
    expect(changeLabel(['name', 'time', 'details'])).toBe('New Name, Time and Details');
    expect(changeLabel([])).toBeNull();
  });

  it('says how long ago, and goes quiet after a week', () => {
    const t = new Date(2026, 10, 4, 12, 0);
    expect(editedAgo(null, t)).toBeNull();
    expect(editedAgo(new Date(2026, 10, 4, 11, 55).toISOString(), t)).toBe('Updated 5 min Ago');
    expect(editedAgo(new Date(2026, 10, 4, 9, 0).toISOString(), t)).toBe('Updated 3 hr Ago');
    expect(editedAgo(new Date(2026, 10, 3, 9, 0).toISOString(), t)).toBe('Updated Yesterday');
    expect(editedAgo(new Date(2026, 9, 1).toISOString(), t)).toBeNull();
  });

  it('reads coordinates and the public area label', () => {
    expect(parseCoords('38.5, -109.5')).toEqual({ lat: 38.5, lng: -109.5 });
    expect(parseCoords('200, 1')).toBeNull();
    expect(publicAreaLabel('Maverik, Main St, Moab, UT')).toBe('Moab, UT');
    expect(publicAreaLabel(' ')).toBeNull();
  });
});
