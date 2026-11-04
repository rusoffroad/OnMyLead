import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { can } from '@/core/entitlements';
import {
  editMapWaypoint, MAP_WAYPOINT_MAX, mapWaypointId, mapWaypointTime, newMapWaypoint, parseBackupList, parseMapWaypoints,
  planMapWaypointSync, visibleMapWaypoints, type MapWaypointDraft,
} from '@/core/map-waypoints';
import type { Waypoint } from '@/core/waypoints';
import { track } from './analytics';
import { currentEntitlements } from './entitlements';
import { isBackendConfigured, supabase } from './supabase';

/**
 * Map Mode waypoints (core/map-waypoints.ts has the rules): kept on the device so they work with
 * no signal, and backed up to the rider's account a few seconds after each change, and with the
 * settings sync (startSettingsSync in app/_layout.tsx). Sync is Pro, like trail backups; a Free
 * rider's waypoints stay on this device.
 */
const KEY = 'nav.mapWaypoints.v1';
/** Waypoints deleted here, by id, with the time, so the delete reaches the rider's other devices. */
const TOMBSTONES_KEY = 'nav.mapWaypointTombstones.v1';

let all: Waypoint[] = [];
let viewer: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      all = parseMapWaypoints(raw ? JSON.parse(raw) : []);
    })
    .catch(() => {
      all = [];
    })
    .finally(publish);
  return loading;
}

async function persist(next: Waypoint[]) {
  all = next;
  publish();
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

async function readTombstones(): Promise<Record<string, number>> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(TOMBSTONES_KEY)) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}
const writeTombstones = (t: Record<string, number>) => AsyncStorage.setItem(TOMBSTONES_KEY, JSON.stringify(t)).catch(() => {});

async function currentUser(): Promise<string | null> {
  if (!isBackendConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** The rider's Map Mode waypoints, kept up to date. */
export function useMapWaypoints(): Waypoint[] {
  const [list, setList] = useState(() => visibleMapWaypoints(all, viewer));
  useEffect(() => {
    const update = () => setList(visibleMapWaypoints(all, viewer));
    listeners.add(update);
    load().then(update);
    currentUser().then((me) => {
      if (me !== viewer) {
        viewer = me;
        publish();
      }
    });
    return () => {
      listeners.delete(update);
    };
  }, []);
  return list;
}

export async function addMapWaypoint(d: MapWaypointDraft): Promise<Waypoint> {
  await load();
  if (visibleMapWaypoints(all, viewer).length >= MAP_WAYPOINT_MAX) {
    throw new Error(`You have ${MAP_WAYPOINT_MAX.toLocaleString('en-US')} waypoints. Remove a few to add more.`);
  }
  const now = Date.now();
  const w = newMapWaypoint(d, mapWaypointId(now, Math.random()), viewer, now);
  await persist([...all, w]);
  track('waypoint_added', { kind: w.kind, symbol: d.symbol, shared: false, where: 'map_mode' });
  backupSoon();
  return w;
}

export async function updateMapWaypoint(id: string, patch: Partial<Pick<MapWaypointDraft, 'name' | 'symbol' | 'note'>>): Promise<Waypoint> {
  await load();
  const w = all.find((x) => x.id === id);
  if (!w) throw new Error('That waypoint was already removed.');
  const next = editMapWaypoint(w, patch, Date.now());
  await persist(all.map((x) => (x.id === id ? next : x)));
  backupSoon();
  return next;
}

export async function removeMapWaypoint(id: string): Promise<void> {
  await load();
  const w = all.find((x) => x.id === id);
  if (!w) return;
  await persist(all.filter((x) => x.id !== id));
  const tomb = await readTombstones();
  tomb[id] = Math.max(Date.now(), mapWaypointTime(w) + 1);
  await writeTombstones(tomb);
  backupSoon();
}

let timer: ReturnType<typeof setTimeout> | null = null;
function backupSoon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    backupMapWaypointsNow();
  }, 4_000);
}

let running: Promise<void> | null = null;

/** Swap Map Mode waypoints with the backup now. Safe to call often; does nothing when signed out or offline. */
export function backupMapWaypointsNow(): Promise<void> {
  running ??= run()
    .catch(() => {
      // Offline, or the server doesn't have the backup yet: try again next time.
    })
    .finally(() => {
      running = null;
    });
  return running;
}

async function run() {
  if (!can(currentEntitlements(), 'sync')) return;
  const me = await currentUser();
  if (me !== viewer) {
    viewer = me;
    publish();
  }
  if (!me) return;
  await load();

  const { data: list, error } = await supabase.from('rider_map_waypoints').select('waypoint_id, deleted, updated_at');
  if (error) throw new Error(error.message);
  const tombstones = await readTombstones();
  const plan = planMapWaypointSync(all, tombstones, parseBackupList(list), me);

  const claimed = new Map<string, Waypoint>();
  for (const w of plan.upload) {
    const copy = { ...w, user_id: me };
    const { error: e } = await supabase.rpc('backup_map_waypoint', {
      p_waypoint_id: w.id, p_data: copy, p_updated_at: new Date(mapWaypointTime(w)).toISOString(),
    });
    if (!e && !w.user_id) claimed.set(w.id, copy);
  }

  const tomb = { ...tombstones };
  for (const d of plan.markDeleted) {
    const { error: e } = await supabase.rpc('backup_map_waypoint', { p_waypoint_id: d.id, p_data: null, p_updated_at: new Date(d.at).toISOString() });
    if (!e) delete tomb[d.id];
  }
  for (const id of plan.settledTombstones) delete tomb[id];
  await writeTombstones(tomb);

  const restored = new Map<string, Waypoint>();
  for (let i = 0; i < plan.restore.length; i += 50) {
    const { data: rows, error: e } = await supabase
      .from('rider_map_waypoints')
      .select('waypoint_id, data, deleted')
      .in('waypoint_id', plan.restore.slice(i, i + 50));
    if (e) break;
    for (const w of parseMapWaypoints((rows ?? []).filter((r) => !r.deleted).map((r) => r.data))) restored.set(w.id, { ...w, user_id: me, shared: false });
  }

  if (!claimed.size && !restored.size && !plan.removeLocal.length) return;
  const gone = new Set(plan.removeLocal);
  const kept = all.filter((w) => !gone.has(w.id) && !restored.has(w.id)).map((w) => claimed.get(w.id) ?? w);
  await persist([...kept, ...restored.values()]);
}
