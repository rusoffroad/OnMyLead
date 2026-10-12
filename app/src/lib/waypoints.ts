import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  cleanWaypointName, friendlyWaypointError, isWaypointsNotSwitchedOn, sortWaypoints, type Waypoint, type WaypointKind,
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
  /** No signal: these are the ones saved on this phone. */
  offline: boolean;
};

/**
 * The waypoints this rider can see on a ride: the shared ones and their own (the database decides).
 * Kept on the phone, so they're still on the map with no signal.
 */
export async function rideWaypoints(rideId: string): Promise<WaypointList> {
  const { data, error } = await supabase.from('ride_waypoints').select('*').eq('ride_id', rideId).order('created_at');
  if (error) {
    if (isWaypointsNotSwitchedOn(error.message, error.code)) return { waypoints: [], switchedOff: true, offline: false };
    const raw = await AsyncStorage.getItem(cacheKey(rideId)).catch(() => null);
    return { waypoints: raw ? JSON.parse(raw) : [], switchedOff: false, offline: true };
  }
  const list = sortWaypoints((data ?? []) as Waypoint[]);
  await AsyncStorage.setItem(cacheKey(rideId), JSON.stringify(list)).catch(() => {});
  return { waypoints: list, switchedOff: false, offline: false };
}

export type WaypointDraft = { name: string; kind: WaypointKind; note?: string | null; lat: number; lng: number; shared: boolean };

export async function addWaypoint(rideId: string, w: WaypointDraft): Promise<Waypoint> {
  const { data, error } = await supabase
    .from('ride_waypoints')
    .insert({ ride_id: rideId, name: cleanWaypointName(w.name), kind: w.kind, note: w.note?.trim() || null, lat: w.lat, lng: w.lng, shared: w.shared })
    .select('*')
    .single();
  check(error);
  track('waypoint_added', { kind: w.kind, shared: w.shared });
  return data as Waypoint;
}

export async function updateWaypoint(id: string, patch: Partial<Pick<WaypointDraft, 'name' | 'kind' | 'note' | 'shared'>>): Promise<void> {
  const next = { ...patch, ...(patch.name != null ? { name: cleanWaypointName(patch.name) } : {}) };
  const { data, error } = await supabase.from('ride_waypoints').update(next).eq('id', id).select('id');
  check(error);
  if (!data?.length) throw new Error('Only the rider who added this waypoint can change it.');
}

export async function removeWaypoint(id: string): Promise<void> {
  const { data, error } = await supabase.from('ride_waypoints').delete().eq('id', id).select('id');
  check(error);
  if (!data?.length) throw new Error('That waypoint was already removed, or isn’t yours to remove.');
}
