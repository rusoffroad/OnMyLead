/**
 * Map Mode waypoints: the spots a rider drops by pressing and holding the map when they aren't on
 * a group ride (a spring, a gate, a camp). They are the rider's own, never shared. They live on the
 * device (lib/map-waypoints.ts) so they work with no signal, and are backed up privately to the
 * rider's account (migration 20261104150000_waypoint_alerts.sql, rider_map_waypoints) so they
 * show on each device they sign in on, with Sync like their trails.
 *
 * They use the same Waypoint shape as ride waypoints, so the same sheet, symbols and markers draw
 * them; ride_id is empty and shared is always false.
 *
 * Pure, so it is tested without a phone.
 */
import { symbolKind, type WaypointSymbol } from './waypoint-symbols';
import { cleanWaypointName, WAYPOINT_NOTE_MAX, type Waypoint } from './waypoints';

/** How many a rider can keep (the backup holds as many). */
export const MAP_WAYPOINT_MAX = 2000;

export type MapWaypointDraft = { name: string; symbol: WaypointSymbol; note?: string | null; lat: number; lng: number };

/** A new Map Mode waypoint, owned by the signed-in rider (or nobody yet, when signed out). */
export function newMapWaypoint(d: MapWaypointDraft, id: string, owner: string | null, now: number): Waypoint {
  const at = new Date(now).toISOString();
  return {
    id,
    ride_id: '',
    user_id: owner ?? '',
    name: cleanWaypointName(d.name),
    kind: symbolKind(d.symbol),
    symbol: d.symbol,
    note: cleanNote(d.note),
    lat: d.lat,
    lng: d.lng,
    shared: false,
    created_at: at,
    updated_at: at,
  };
}

/** The same waypoint with the rider's changes; its spot and owner stay. */
export function editMapWaypoint(
  w: Waypoint,
  patch: Partial<Pick<MapWaypointDraft, 'name' | 'symbol' | 'note'>>,
  now: number,
): Waypoint {
  return {
    ...w,
    ...(patch.name != null ? { name: cleanWaypointName(patch.name) } : {}),
    ...(patch.symbol ? { symbol: patch.symbol, kind: symbolKind(patch.symbol) } : {}),
    ...(patch.note !== undefined ? { note: cleanNote(patch.note) } : {}),
    shared: false,
    updated_at: new Date(Math.max(now, mapWaypointTime(w) + 1)).toISOString(),
  };
}

const cleanNote = (n: string | null | undefined) => (n ?? '').trim().slice(0, WAYPOINT_NOTE_MAX) || null;

/** When it last changed, ms. */
export const mapWaypointTime = (w: Pick<Waypoint, 'updated_at' | 'created_at'>) => Date.parse(w.updated_at || w.created_at) || 0;

/** The ones this rider sees: their own, and any dropped while signed out. */
export const visibleMapWaypoints = (all: Waypoint[], viewer: string | null) =>
  all.filter((w) => !w.user_id || w.user_id === viewer).sort((a, b) => a.created_at.localeCompare(b.created_at));

/** A device-made id: unique enough across one rider's devices, and within the server's 64 characters. */
export const mapWaypointId = (now: number, random: number) => `mw-${now.toString(36)}-${Math.floor(random * 36 ** 8).toString(36)}`;

/** Read a stored waypoint list, dropping anything that isn't one. */
export function parseMapWaypoints(raw: unknown): Waypoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (w): w is Waypoint =>
      !!w && typeof w === 'object' && typeof w.id === 'string' && typeof w.name === 'string' && typeof w.lat === 'number' && typeof w.lng === 'number',
  );
}

export type BackupRow = { id: string; deleted: boolean; at: number };

/** The server's rows (waypoint_id, deleted, updated_at), as the planner wants them. */
export function parseBackupList(rows: unknown): BackupRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r.waypoint_id === 'string')
    .map((r) => ({ id: r.waypoint_id as string, deleted: !!r.deleted, at: Date.parse(r.updated_at) || 0 }));
}

export type MapWaypointSyncPlan = {
  /** New or changed here: send them. */
  upload: Waypoint[];
  /** Deleted here: tell the backup. */
  markDeleted: { id: string; at: number }[];
  /** Newer on another device (or only there): fetch them. */
  restore: string[];
  /** Deleted on another device: take them off this one. */
  removeLocal: string[];
  /** Tombstones the backup already agrees with. */
  settledTombstones: string[];
};

/**
 * What to swap with the backup. The newer change wins, waypoint by waypoint; a delete is a change
 * like any other, so an edit made after a delete on another device brings the waypoint back.
 * Waypoints another account dropped on this device are left alone.
 */
export function planMapWaypointSync(
  local: Waypoint[],
  tombstones: Record<string, number>,
  remote: BackupRow[],
  me: string,
): MapWaypointSyncPlan {
  const plan: MapWaypointSyncPlan = { upload: [], markDeleted: [], restore: [], removeLocal: [], settledTombstones: [] };
  const byId = new Map(remote.map((r) => [r.id, r]));
  const localIds = new Set<string>();
  for (const w of local) {
    if (w.user_id && w.user_id !== me) continue;
    localIds.add(w.id);
    const r = byId.get(w.id);
    const t = mapWaypointTime(w);
    if (!r || t > r.at || (!w.user_id && t >= r.at)) plan.upload.push(w);
    else if (r.at > t) (r.deleted ? plan.removeLocal : plan.restore).push(w.id);
  }
  for (const [id, at] of Object.entries(tombstones)) {
    if (localIds.has(id)) continue;
    const r = byId.get(id);
    if (!r || r.deleted) plan.settledTombstones.push(id);
    else if (r.at > at) {
      plan.restore.push(id);
      plan.settledTombstones.push(id);
    } else plan.markDeleted.push({ id, at });
  }
  for (const r of remote) {
    if (r.deleted || localIds.has(r.id) || r.id in tombstones) continue;
    plan.restore.push(r.id);
  }
  return plan;
}
