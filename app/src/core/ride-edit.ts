import { tc } from './i18n';
import { atMinutes, canRideOn, startOfDay } from './calendar';
import { fuzzLocation } from './geo';
import { clockText, parseTime } from './time';

/**
 * Edit Ride Details: the leader (organizer or co-organizer) changes a ride after creating it, on
 * the app and the website. This file is the whole rule, shared by every device: what the form
 * starts with, what may change while the ride is live, what gets saved, and how the change is
 * described to riders. Tested in core/__tests__/ride-edit.test.ts.
 *
 * Saving goes through the edit_ride RPC (20261104120000), which also tells riders. Until that
 * migration is applied, the app writes the same patch straight to the tables (the leader could
 * always update them), and the existing ride_change_notify trigger still sends the new time and
 * meeting spot notifications.
 */

/** The ride columns this form reads and writes (a subset of lib/types Ride). */
export type EditableRide = {
  name: string;
  description: string | null;
  meet_at: string;
  depart_at: string | null;
  expected_finish_at: string | null;
  meet_area_lat: number;
  meet_area_lng: number;
  meet_area_label: string | null;
  meet_state?: string | null;
  destination_label: string | null;
  vehicle_types: string[];
  difficulty: string | null;
  experience_level: string | null;
  max_riders: number | null;
  max_vehicles: number | null;
  what_to_bring: string | null;
  required_equipment: string | null;
  fuel_notes: string | null;
  route_miles: number | null;
  visibility: 'public' | 'unlisted' | 'private';
  join_policy: 'open' | 'approval' | 'invite_only';
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
};

export type EditablePrivate = { meet_lat: number; meet_lng: number; meet_label: string | null; instructions: string | null };

export type RideEditForm = {
  name: string;
  description: string;
  /** Local midnight of the ride day, in ms. */
  day: number;
  meetTime: string;
  departTime: string;
  finishTime: string;
  /** "38.57330, -109.54980" */
  coords: string;
  meetLabel: string;
  meetState: string | null;
  destination: string;
  vehicleTypes: string[];
  difficulty: string | null;
  experience: string | null;
  maxVehicles: string;
  maxRiders: string;
  routeMiles: string;
  whatToBring: string;
  requiredEquipment: string;
  fuelNotes: string;
  instructions: string;
  joinPolicy: 'open' | 'approval' | 'invite_only';
};

/** What a saved edit changed, in the order riders read it. */
export type RideChange = 'name' | 'time' | 'place' | 'details';

export type RidePatch = {
  ride: Partial<EditableRide>;
  /** Null when the exact meeting point and instructions didn't change (or the leader can't see them). */
  private: Partial<EditablePrivate> | null;
  changed: RideChange[];
};

export const NAME_MAX = 120;

/** The vehicle choices on Create a Ride and Edit Ride Details. */
export const VEHICLE_TYPES = ['SXS/UTV', 'ATV', 'Dirt Bike', 'Motorcycle', 'Jeep/4x4', 'Truck', 'Overland Rig', 'Snowmobile', 'Car'];

/** Who may edit: the leader and co-leaders, while the ride hasn't ended or been cancelled. */
export function canEditRide(status: EditableRide['status'], isManager: boolean): boolean {
  return isManager && (status === 'scheduled' || status === 'live');
}

/** Once the ride is live, everyone is already at the meeting point: the day, times and spot stay put. */
export function canEditWhenAndWhere(status: EditableRide['status']): boolean {
  return status === 'scheduled';
}

const coordsText = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const clockOf = (iso: string | null) => (iso ? clockText(new Date(iso)) : '');

/** The form, filled in with the ride as it is now. */
export function formFromRide(ride: EditableRide, details: EditablePrivate | null): RideEditForm {
  return {
    name: ride.name,
    description: ride.description ?? '',
    day: startOfDay(new Date(ride.meet_at)).getTime(),
    meetTime: clockOf(ride.meet_at),
    departTime: clockOf(ride.depart_at),
    finishTime: clockOf(ride.expected_finish_at),
    coords: details ? coordsText(details.meet_lat, details.meet_lng) : '',
    meetLabel: details?.meet_label ?? '',
    meetState: ride.meet_state ?? null,
    destination: ride.destination_label ?? '',
    vehicleTypes: [...ride.vehicle_types],
    difficulty: ride.difficulty,
    experience: ride.experience_level,
    maxVehicles: ride.max_vehicles ? String(ride.max_vehicles) : '',
    maxRiders: ride.max_riders ? String(ride.max_riders) : '',
    routeMiles: ride.route_miles != null ? String(ride.route_miles) : '',
    whatToBring: ride.what_to_bring ?? '',
    requiredEquipment: ride.required_equipment ?? '',
    fuelNotes: ride.fuel_notes ?? '',
    instructions: details?.instructions ?? '',
    joinPolicy: ride.join_policy,
  };
}

export function parseCoords(s: string): { lat: number; lng: number } | null {
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** The public "near" label: the last two parts of the place name (town, state), as createRide saves it. */
export function publicAreaLabel(label: string): string | null {
  const t = label.trim();
  return t ? t.split(',').slice(-2).join(',').trim() : null;
}

const text = (s: string) => (s.trim() ? s.trim() : null);
const count = (s: string) => (s.trim() ? Math.max(1, parseInt(s, 10)) || null : null);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
// The form holds minutes, so a saved time's seconds never count as a change.
const minuteOf = (iso: string | null | undefined) => (iso ? Math.floor(new Date(iso).getTime() / 60000) : null);
const sameTime = (a: string | null | undefined, b: string | null | undefined) => minuteOf(a) === minuteOf(b);

/**
 * Checks the form and works out exactly what changed. Returns an error line for the rider, or the
 * patch to save (only the columns that changed) and what it changed. `now` keeps the day rule
 * testable: a scheduled ride's new day must be from today up to three years out.
 */
export function ridePatch(
  ride: EditableRide,
  details: EditablePrivate | null,
  form: RideEditForm,
  now: Date,
): { error: string } | RidePatch {
  const name = form.name.trim();
  if (!name) return { error: tc('Give the ride a name.') };
  if (name.length > NAME_MAX) return { error: tc('Keep the name under {v} characters.', { v: NAME_MAX }) };

  const r: Partial<EditableRide> = {};
  const p: Partial<EditablePrivate> = {};
  const changed = new Set<RideChange>();

  if (name !== ride.name) {
    r.name = name;
    changed.add('name');
  }

  if (canEditWhenAndWhere(ride.status)) {
    const dayDate = new Date(form.day);
    const meet = atMinutes(dayDate, parseTime(form.meetTime));
    if (!meet) return { error: tc('Pick a meeting time.') };
    const dayChanged = startOfDay(new Date(ride.meet_at)).getTime() !== startOfDay(dayDate).getTime();
    // A ride already on its day can keep it even after midnight passes; a new day must be bookable.
    if (dayChanged && !canRideOn(dayDate, now)) return { error: tc('Pick a day from today up to three years out.') };
    const depart = form.departTime.trim() ? atMinutes(dayDate, parseTime(form.departTime)) : null;
    if (form.departTime.trim() && !depart) return { error: tc('Check the departure time.') };
    const finish = form.finishTime.trim() ? atMinutes(dayDate, parseTime(form.finishTime)) : null;
    if (form.finishTime.trim() && !finish) return { error: tc('Check the expected finish time.') };
    if (!sameTime(meet.toISOString(), ride.meet_at)) {
      r.meet_at = meet.toISOString();
      changed.add('time');
    }
    const departIso = depart?.toISOString() ?? null;
    if (!sameTime(departIso, ride.depart_at)) {
      r.depart_at = departIso;
      changed.add('time');
    }
    const finishIso = finish?.toISOString() ?? null;
    if (!sameTime(finishIso, ride.expected_finish_at)) {
      r.expected_finish_at = finishIso;
      changed.add('details');
    }

    // The exact spot only reaches riders on the ride; the leader always has it, but stay safe if not.
    if (details) {
      const spot = parseCoords(form.coords);
      if (!spot) return { error: tc('Set the meeting point: search a place, tap the map or paste coordinates like "38.57, -109.55".') };
      const label = text(form.meetLabel);
      const moved = coordsText(spot.lat, spot.lng) !== coordsText(details.meet_lat, details.meet_lng);
      if (moved) {
        p.meet_lat = spot.lat;
        p.meet_lng = spot.lng;
        const area = fuzzLocation(spot);
        // The grid's east-west step shifts a hair with latitude, so compare within ~150 m (a tenth of a square), not exactly.
        if (Math.abs(area.lat - ride.meet_area_lat) > 0.0015 || Math.abs(area.lng - ride.meet_area_lng) > 0.0015) {
          r.meet_area_lat = area.lat;
          r.meet_area_lng = area.lng;
        }
        changed.add('place');
      }
      if (label !== (details.meet_label ?? null)) {
        p.meet_label = label;
        changed.add('place');
      }
      const areaLabel = label ? publicAreaLabel(label) : ride.meet_area_label;
      if ((moved || label !== (details.meet_label ?? null)) && areaLabel !== ride.meet_area_label) r.meet_area_label = areaLabel;
    }
    if (ride.visibility === 'public' && form.meetState !== (ride.meet_state ?? null) && form.meetState) {
      r.meet_state = form.meetState;
      changed.add('place');
    }
  }

  const description = text(form.description);
  if (description !== (ride.description ?? null)) {
    r.description = description;
    changed.add('details');
  }
  const fields: [keyof EditableRide, string | null, string | null][] = [
    ['destination_label', text(form.destination), ride.destination_label],
    ['what_to_bring', text(form.whatToBring), ride.what_to_bring],
    ['required_equipment', text(form.requiredEquipment), ride.required_equipment],
    ['fuel_notes', text(form.fuelNotes), ride.fuel_notes],
    ['difficulty', form.difficulty, ride.difficulty],
    ['experience_level', form.experience, ride.experience_level],
  ];
  for (const [key, next, was] of fields) {
    if (next !== (was ?? null)) {
      (r as Record<string, unknown>)[key] = next;
      changed.add('details');
    }
  }
  if (!sameList(form.vehicleTypes, ride.vehicle_types)) {
    r.vehicle_types = [...form.vehicleTypes];
    changed.add('details');
  }
  const maxV = count(form.maxVehicles);
  if (maxV !== (ride.max_vehicles ?? null)) {
    r.max_vehicles = maxV;
    changed.add('details');
  }
  const maxR = count(form.maxRiders);
  if (maxR !== (ride.max_riders ?? null)) {
    r.max_riders = maxR;
    changed.add('details');
  }
  const milesTyped = form.routeMiles.trim();
  const miles = milesTyped ? Number(milesTyped) : null;
  if (miles != null && (!Number.isFinite(miles) || miles < 0)) return { error: tc('Route length is a number of miles, like 42.5.') };
  if (miles !== (ride.route_miles ?? null)) {
    r.route_miles = miles;
    changed.add('details');
  }
  // A private ride's invite code is the invitation, so it always stays open.
  if (ride.visibility === 'public' && form.joinPolicy !== ride.join_policy) {
    r.join_policy = form.joinPolicy;
    changed.add('details');
  }
  if (details) {
    const instructions = text(form.instructions);
    if (instructions !== (details.instructions ?? null)) {
      p.instructions = instructions;
      changed.add('details');
    }
  }

  const order: RideChange[] = ['name', 'time', 'place', 'details'];
  return { ride: r, private: Object.keys(p).length ? p : null, changed: order.filter((c) => changed.has(c)) };
}

/** True when nothing would be saved. */
export function isEmptyPatch(patch: RidePatch): boolean {
  return !Object.keys(patch.ride).length && !patch.private;
}

const CHANGE_WORDS: Record<RideChange, () => string> = { name: () => tc('Name'), time: () => tc('Time'), place: () => tc('Meeting Point'), details: () => tc('Details') };

/** "New Time and Meeting Point", "New Name, Time and Details": the tag riders see on the ride page. */
export function changeLabel(changed: readonly string[]): string | null {
  const words = (['name', 'time', 'place', 'details'] as RideChange[]).filter((c) => changed.includes(c)).map((c) => CHANGE_WORDS[c]());
  if (!words.length) return null;
  const list = words.length === 1 ? words[0] : tc('{list} and {last}', { list: words.slice(0, -1).join(', '), last: words[words.length - 1] });
  return tc('New {list}', { list });
}

/** How long ago the leader last changed the ride, for "Updated 5 min ago". Null past a week (old news). */
export function editedAgo(editedAt: string | null | undefined, now: Date): string | null {
  if (!editedAt) return null;
  const mins = Math.floor((now.getTime() - new Date(editedAt).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return tc('Updated Just Now');
  if (mins < 1) return tc('Updated Just Now');
  if (mins < 60) return tc('Updated {mins} min Ago', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tc('Updated {hours} hr Ago', { hours });
  const days = Math.floor(hours / 24);
  if (days > 7) return null;
  return days === 1 ? tc('Updated Yesterday') : tc('Updated {days} Days Ago', { days });
}
