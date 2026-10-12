/**
 * Waypoints: named spots a rider drops on a ride's map. A rider's own are only theirs; the ride's
 * leader (or an organizer) can also share one with everyone on the ride. The database enforces who
 * sees what (ride_waypoints row level security); this file is the wording and the ordering.
 */

import { parseTime } from './time';

export type WaypointKind = 'spot' | 'camp' | 'fuel' | 'water' | 'view' | 'hazard' | 'parking';

export type Waypoint = {
  id: string;
  ride_id: string;
  user_id: string;
  name: string;
  kind: WaypointKind;
  note: string | null;
  lat: number;
  lng: number;
  shared: boolean;
  /** A stop the whole ride plans to make (always shared). Missing until the planned stops update is on the server. */
  planned_stop?: boolean;
  /** Its place along the ride; gaps are fine, only the order counts. */
  stop_order?: number | null;
  /** The time of day the group expects to be there, as Postgres sends it ("12:30:00"). */
  stop_time?: string | null;
  created_at: string;
  updated_at: string;
};

/** In the order the picker shows them. */
export const WAYPOINT_KINDS: { kind: WaypointKind; label: string }[] = [
  { kind: 'spot', label: 'Spot' },
  { kind: 'camp', label: 'Camp' },
  { kind: 'fuel', label: 'Fuel' },
  { kind: 'water', label: 'Water' },
  { kind: 'view', label: 'Viewpoint' },
  { kind: 'hazard', label: 'Hazard' },
  { kind: 'parking', label: 'Parking' },
];

export const kindLabel = (kind: WaypointKind) => WAYPOINT_KINDS.find((k) => k.kind === kind)?.label ?? 'Spot';

export const WAYPOINT_NAME_MAX = 60;
export const WAYPOINT_NOTE_MAX = 280;

/** Collapse spaces and trim, like the server does. */
export const cleanWaypointName = (name: string) => name.replace(/\s+/g, ' ').trim();

/** What's wrong with a name, or null when it's fine. */
export function waypointNameProblem(name: string): string | null {
  const n = cleanWaypointName(name);
  if (!n) return 'Give the waypoint a name.';
  if (n.length > WAYPOINT_NAME_MAX) return `Keep the name to ${WAYPOINT_NAME_MAX} characters.`;
  return null;
}

/** A name to start from, so dropping a pin is one tap: "Camp", "Camp 2", "Camp 3". */
export function suggestWaypointName(kind: WaypointKind, existing: Pick<Waypoint, 'name'>[]): string {
  const base = kindLabel(kind);
  const taken = new Set(existing.map((w) => w.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/**
 * Who can share a waypoint with the whole ride: the leader, or an organizer. Matches the server's
 * can_share_waypoint. `leaderIds` is rideLeaderIds (the organizer when nobody holds the Leader role).
 */
export function canShareWaypoints(
  me: string | null | undefined,
  mine: { status: string; role: string } | null | undefined,
  leaderIds: string[],
): boolean {
  if (!me || mine?.status !== 'joined') return false;
  return leaderIds.includes(me) || mine.role === 'organizer' || mine.role === 'co_organizer';
}

/**
 * Can this rider change it? A planned stop belongs to the ride, so whoever can share (the leader or an
 * organizer) changes any of them, and nobody else. Otherwise only your own.
 */
export const canEditWaypoint = (w: Pick<Waypoint, 'user_id' | 'planned_stop'>, me: string | null | undefined, canShare: boolean) =>
  !!me && (w.planned_stop ? canShare : w.user_id === me);

/** Can this rider delete it? Their own always; a shared one if they can share. */
export const canRemoveWaypoint = (w: Pick<Waypoint, 'user_id' | 'shared'>, me: string | null | undefined, canShare: boolean) =>
  !!me && (w.user_id === me || (w.shared && canShare));

/** The line under a waypoint's name: who sees it. */
export function waypointAudience(w: Pick<Waypoint, 'user_id' | 'shared' | 'planned_stop'>, me: string | null | undefined, ownerName: string): string {
  if (w.planned_stop) return 'Planned Stop';
  if (!w.shared) return 'Only You';
  return w.user_id === me ? 'Shared with Everyone' : `From ${ownerName}`;
}

/** Planned stops first, in ride order; then the other shared ones; then your own; each oldest first. */
export function sortWaypoints<T extends Pick<Waypoint, 'shared' | 'created_at' | 'planned_stop' | 'stop_order'>>(list: T[]): T[] {
  const rank = (w: T) => (w.planned_stop ? 0 : w.shared ? 1 : 2);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.planned_stop && b.planned_stop ? (a.stop_order ?? 0) - (b.stop_order ?? 0) : 0) ||
      a.created_at.localeCompare(b.created_at),
  );
}

/** The ride's planned stops in order. Their number on the map is their place here plus one. */
export const plannedStops = <T extends Pick<Waypoint, 'shared' | 'created_at' | 'planned_stop' | 'stop_order'>>(list: T[]): T[] =>
  sortWaypoints(list.filter((w) => w.planned_stop));

/** 1 for the first planned stop, and so on; null for an ordinary waypoint. */
export function stopNumber(w: Pick<Waypoint, 'id' | 'planned_stop'>, list: Waypoint[]): number | null {
  if (!w.planned_stop) return null;
  const i = plannedStops(list).findIndex((s) => s.id === w.id);
  return i < 0 ? null : i + 1;
}

/** "12:30:00" -> "12:30 PM". */
export function stopTimeLabel(t: string | null | undefined): string | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "12:30:00" -> "12:30 pm", for the edit box. */
export const stopTimeInput = (t: string | null | undefined) => stopTimeLabel(t)?.toLowerCase() ?? '';

/** What a rider typed ("12:30 pm", "14:00") as a time for the server, '' for none, or null when unreadable. */
export function parseStopTime(s: string): string | null {
  if (!s.trim()) return '';
  const min = parseTime(s);
  if (min == null) return null;
  const h = Math.floor(min / 60);
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Move one planned stop earlier (-1) or later (+1): the new order of ids, or null at either end. */
export function moveStop(ids: string[], id: string, by: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Did a request fail because the server doesn't have planned stops yet (the waypoints are there)? */
export function isPlannedStopsNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42703', 'PGRST204', 'PGRST202'].includes(code)) return true;
  return !!message && /planned_stop|stop_order|stop_time|reorder_planned_stops/i.test(message) && /does not exist|could not find|schema cache/i.test(message);
}

export const PLANNED_STOPS_NOT_SWITCHED_ON = 'Planned stops are not switched on yet. They start working with the next server update.';

/** Did a request fail because the database doesn't have waypoints yet? */
export function isWaypointsNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', 'PGRST205'].includes(code)) return true;
  return !!message && !/row-level security|permission denied/i.test(message) && /ride_waypoints|schema cache|does not exist/i.test(message);
}

export const WAYPOINTS_NOT_SWITCHED_ON = 'Waypoints are not switched on yet. They start working with the next server update.';

/** A friendly line for a failed save. */
export function friendlyWaypointError(message: string, code?: string | null): string {
  if (isPlannedStopsNotSwitchedOn(message, code)) return PLANNED_STOPS_NOT_SWITCHED_ON;
  if (isWaypointsNotSwitchedOn(message, code)) return WAYPOINTS_NOT_SWITCHED_ON;
  if (/stops_changed/.test(message)) return 'The planned stops just changed. Close this and try again.';
  if (/not_leader/.test(message)) return 'Only the ride’s leader can change the planned stops.';
  if (/waypoint_limit/.test(message)) return 'You have 100 waypoints on this ride. Remove one to add another.';
  if (/row-level security|permission denied/i.test(message)) return 'Only riders on this ride can add waypoints, and only the leader can share them.';
  return message;
}
