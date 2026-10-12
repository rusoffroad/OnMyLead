/**
 * Waypoints: named spots a rider drops on a ride's map. A rider's own are only theirs; the ride's
 * leader (or an organizer) can also share one with everyone on the ride. The database enforces who
 * sees what (ride_waypoints row level security); this file is the wording and the ordering.
 */

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

/** Can this rider delete it? Their own always; a shared one if they can share. */
export const canRemoveWaypoint = (w: Pick<Waypoint, 'user_id' | 'shared'>, me: string | null | undefined, canShare: boolean) =>
  !!me && (w.user_id === me || (w.shared && canShare));

/** The line under a waypoint's name: who sees it. */
export function waypointAudience(w: Pick<Waypoint, 'user_id' | 'shared'>, me: string | null | undefined, ownerName: string): string {
  if (!w.shared) return 'Only You';
  return w.user_id === me ? 'Shared with Everyone' : `From ${ownerName}`;
}

/** Shared ones first (the group's plan), then your own; each oldest first. */
export function sortWaypoints<T extends Pick<Waypoint, 'shared' | 'created_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.shared) - Number(a.shared) || a.created_at.localeCompare(b.created_at));
}

/** Did a request fail because the database doesn't have waypoints yet? */
export function isWaypointsNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', 'PGRST205'].includes(code)) return true;
  return !!message && !/row-level security|permission denied/i.test(message) && /ride_waypoints|schema cache|does not exist/i.test(message);
}

export const WAYPOINTS_NOT_SWITCHED_ON = 'Waypoints are not switched on yet. They start working with the next server update.';

/** A friendly line for a failed save. */
export function friendlyWaypointError(message: string, code?: string | null): string {
  if (isWaypointsNotSwitchedOn(message, code)) return WAYPOINTS_NOT_SWITCHED_ON;
  if (/waypoint_limit/.test(message)) return 'You have 100 waypoints on this ride. Remove one to add another.';
  if (/row-level security|permission denied/i.test(message)) return 'Only riders on this ride can add waypoints, and only the leader can share them.';
  return message;
}
