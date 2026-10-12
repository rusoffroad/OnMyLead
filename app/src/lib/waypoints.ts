import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  cleanWaypointName, friendlyWaypointError, isPlannedStopsNotSwitchedOn, isWaypointsNotSwitchedOn, sortWaypoints, type Waypoint,
  type WaypointKind,
} from '@/core/waypoints';
import { track } from './analytics';
import { supabase } from './supabase';

const cacheKey = (rideId: string) => `ride.waypoints.v1.${rideId}`;

type DbError = { message: string; code?: string } | null;

function check(error: DbError) {
  if (error) throw new Error(friendlyWaypointError(error.message, error.code));
}

export type WaypointList = {
  waypoints: Waypoint[];
  /** The server doesn't have waypoints yet. */
  switchedOff: boolean;
  /** The server has waypoints but not planned stops yet. */
  stopsSwitchedOff: boolean;
  /** No signal: these are the ones saved on this phone. */
  offline: boolean;
};

/**
 * The waypoints this rider can see on a ride: the shared ones and their own (the database decides).
 * Kept on the phone, so they're still on the map with no signal.
 */
export async function rideWaypoints(rideId: string): Promise<WaypointList> {
  // Ask for the planned stop columns by name, so a server without them says so (then fall back).
  const query = (cols: string) => supabase.from('ride_waypoints').select(cols).eq('ride_id', rideId).order('created_at');
  let stopsSwitchedOff = false;
  let { data, error } = await query('*, planned_stop, stop_order, stop_time');
  if (error && isPlannedStopsNotSwitchedOn(error.message, error.code)) {
    stopsSwitchedOff = true;
    ({ data, error } = await query('*'));
  }
  if (error) {
    if (isWaypointsNotSwitchedOn(error.message, error.code)) return { waypoints: [], switchedOff: true, stopsSwitchedOff: true, offline: false };
    const raw = await AsyncStorage.getItem(cacheKey(rideId)).catch(() => null);
    return { waypoints: raw ? JSON.parse(raw) : [], switchedOff: false, stopsSwitchedOff, offline: true };
  }
  const list = sortWaypoints((data ?? []) as unknown as Waypoint[]);
  await AsyncStorage.setItem(cacheKey(rideId), JSON.stringify(list)).catch(() => {});
  return { waypoints: list, switchedOff: false, stopsSwitchedOff, offline: false };
}

export type WaypointDraft = {
  name: string; kind: WaypointKind; note?: string | null; lat: number; lng: number; shared: boolean;
  /** A planned stop (always shared), with its time ("12:30") or null. */
  planned_stop?: boolean;
  stop_time?: string | null;
};

/** Only send the planned stop fields when they're used, so plain waypoints work before that server update. */
const stopFields = (w: Partial<WaypointDraft>) =>
  w.planned_stop ? { planned_stop: true, shared: true, stop_time: w.stop_time || null } : w.planned_stop === false ? { planned_stop: false } : {};

export async function addWaypoint(rideId: string, w: WaypointDraft): Promise<Waypoint> {
  const { data, error } = await supabase
    .from('ride_waypoints')
    .insert({
      ride_id: rideId, name: cleanWaypointName(w.name), kind: w.kind, note: w.note?.trim() || null, lat: w.lat, lng: w.lng, shared: w.shared,
      ...stopFields(w),
    })
    .select('*')
    .single();
  check(error);
  track(w.planned_stop ? 'planned_stop_added' : 'waypoint_added', { kind: w.kind, shared: w.shared });
  return data as Waypoint;
}

export async function updateWaypoint(
  id: string,
  patch: Partial<Pick<WaypointDraft, 'name' | 'kind' | 'note' | 'shared' | 'planned_stop' | 'stop_time'>>,
): Promise<Waypoint> {
  const { planned_stop, stop_time, ...rest } = patch;
  const next = { ...rest, ...(rest.name != null ? { name: cleanWaypointName(rest.name) } : {}), ...stopFields({ planned_stop, stop_time }) };
  const { data, error } = await supabase.from('ride_waypoints').update(next).eq('id', id).select('*');
  check(error);
  if (!data?.length) throw new Error('Only the rider who added this waypoint can change it.');
  return data[0] as Waypoint;
}

/** Put the ride's planned stops in this order (every one of them, first stop first). Leader only. */
export async function reorderPlannedStops(rideId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_planned_stops', { p_ride: rideId, p_ids: ids });
  check(error);
}

export async function removeWaypoint(id: string): Promise<void> {
  const { data, error } = await supabase.from('ride_waypoints').delete().eq('id', id).select('id');
  check(error);
  if (!data?.length) throw new Error('That waypoint was already removed, or isn’t yours to remove.');
}
