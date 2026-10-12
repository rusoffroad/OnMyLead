import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { LatLng } from '@/core/geo';
import {
  finishedStatus, planArea, planRide, rideBox, tileKey, tilesToRemove, type DownloadPlan, type OfflineChoice,
  type OfflineLayer, type OfflineMap,
} from '@/core/offline-maps';
import { fillTemplate, type Box, type Tile } from '@/core/trails';
import { templateFor, tileFile } from '@/lib/trail-tiles';

/**
 * Downloaded maps. The squares go into the same folders the ride maps already read from
 * (lib/trail-tiles), so a downloaded area simply shows, signal or not. Each download keeps a list
 * of its squares beside the list of downloads, so deleting one removes only what no other
 * download still needs. One download runs at a time, four squares at once, which keeps the
 * agencies' free map servers happy and still saves a typical ride in a couple of minutes on LTE.
 */

const KEY = 'offline-maps.v1';
const MANIFESTS = new Directory(Paths.document, 'offline-maps');
const manifestFile = (id: string) => new File(MANIFESTS, `${id}.json`);

type Manifest = { layers: { layer: OfflineLayer; tiles: [number, number, number][] }[] };

let maps: OfflineMap[] = [];
let loaded = false;
const listeners = new Set<() => void>();
let queue: string[] = [];
let running: string | null = null;
let stopRequested: string | null = null;

function emit() {
  maps = [...maps];
  listeners.forEach((l) => l());
}

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(maps)).catch(() => {});
}

function update(id: string, patch: Partial<OfflineMap>, save = true) {
  maps = maps.map((m) => (m.id === id ? { ...m, ...patch } : m));
  if (save) persist();
  emit();
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as OfflineMap[]) : [];
    // A download the app was closed in the middle of waits for the rider to resume it.
    maps = saved.map((m) => (m.status === 'downloading' ? { ...m, status: 'paused' } : m));
  } catch {
    maps = [];
  }
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => listeners.delete(l);
}

/** Every download on this phone, newest first, kept live while a download runs. */
export function useOfflineMaps(): OfflineMap[] {
  return useSyncExternalStore(subscribe, () => maps, () => maps);
}

export function rideDownload(list: OfflineMap[], rideId: string | undefined): OfflineMap | undefined {
  return rideId ? list.find((m) => m.rideId === rideId) : undefined;
}

export { planArea, planRide };

/** Start downloading a framed area. Returns the new download's id. */
export async function downloadArea(name: string, box: Box, choices: OfflineChoice[]): Promise<string> {
  return start({ name, kind: 'area', box }, planArea(box, choices), choices);
}

/** Download the area around a ride's route, or refresh it if this ride was downloaded before. */
export async function downloadRide(rideId: string, name: string, route: LatLng[], choices: OfflineChoice[]): Promise<string> {
  await load();
  const before = maps.find((m) => m.rideId === rideId);
  if (before) await deleteOfflineMap(before.id);
  return start({ name, kind: 'ride', rideId, box: rideBox(route)! }, planRide(route, choices), choices);
}

async function start(base: Pick<OfflineMap, 'name' | 'kind' | 'rideId' | 'box'>, plan: DownloadPlan, choices: OfflineChoice[]) {
  await load();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const manifest: Manifest = { layers: plan.layers.map((p) => ({ layer: p.layer, tiles: p.tiles.map((t) => [t.z, t.x, t.y]) })) };
  if (!MANIFESTS.exists) MANIFESTS.create({ intermediates: true, idempotent: true });
  manifestFile(id).write(JSON.stringify(manifest));
  maps = [
    { ...base, id, choices, status: 'paused', total: plan.tiles, saved: 0, failed: 0, bytes: 0, createdAt: new Date().toISOString() },
    ...maps,
  ];
  persist();
  emit();
  resumeDownload(id);
  return id;
}

/** Continue a paused or partly failed download. Squares already on the phone are skipped. */
export function resumeDownload(id: string) {
  if (running === id || queue.includes(id)) return;
  update(id, { status: 'downloading' });
  queue.push(id);
  pump();
}

export function pauseDownload(id: string) {
  if (running === id) stopRequested = id;
  else if (queue.includes(id)) {
    queue = queue.filter((q) => q !== id);
    update(id, { status: 'paused' });
  }
}

async function pump() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  running = id;
  try {
    await run(id);
  } finally {
    running = null;
    stopRequested = null;
    pump();
  }
}

async function readManifest(id: string): Promise<Manifest | null> {
  try {
    return JSON.parse(await manifestFile(id).text()) as Manifest;
  } catch {
    return null;
  }
}

async function run(id: string) {
  const manifest = await readManifest(id);
  if (!manifest) return update(id, { status: 'partial' });
  const jobs = manifest.layers.flatMap(({ layer, tiles }) => tiles.map(([z, x, y]) => ({ layer, t: { z, x, y } as Tile })));
  let saved = 0;
  let failed = 0;
  let bytes = 0;
  let next = 0;
  let lastEmit = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 400) return;
    lastEmit = now;
    update(id, { saved, failed, bytes, total: jobs.length }, false);
  };

  const worker = async () => {
    while (next < jobs.length && stopRequested !== id && maps.some((m) => m.id === id)) {
      const { layer, t } = jobs[next++];
      const file = tileFile(layer, t.z, t.x, t.y);
      try {
        if (!file.exists) await fetchTile(layer, t, file);
        bytes += file.size ?? 0;
        saved++;
      } catch {
        failed++;
      }
      report();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!maps.some((m) => m.id === id)) return; // deleted while downloading
  const done = next >= jobs.length && stopRequested !== id;
  update(id, { saved, failed, bytes, total: jobs.length, status: done ? finishedStatus(jobs.length, failed) : 'paused' });
}

async function fetchTile(layer: OfflineLayer, t: Tile, file: File) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(fillTemplate(templateFor(layer), t), { signal: controller.signal });
    const type = res.headers.get('content-type') ?? '';
    // ArcGIS answers errors with JSON and a 200, so only keep real images.
    if (!res.ok || !type.startsWith('image/')) throw new Error(`tile ${res.status} ${type}`);
    const data = new Uint8Array(await res.arrayBuffer());
    const dir = file.parentDirectory;
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    file.write(data);
  } finally {
    clearTimeout(timer);
  }
}

/** Remove a download and the squares no other download needs. */
export async function deleteOfflineMap(id: string) {
  queue = queue.filter((q) => q !== id);
  if (running === id) stopRequested = id;
  const others = maps.filter((m) => m.id !== id);
  const mine = await readManifest(id);
  maps = others;
  persist();
  emit();
  if (!mine) return;
  const keys = (m: Manifest) => m.layers.flatMap(({ layer, tiles }) => tiles.map(([z, x, y]) => tileKey(layer, { z, x, y })));
  const keep: string[] = [];
  for (const o of others) {
    const m = await readManifest(o.id);
    if (m) keep.push(...keys(m));
  }
  for (const k of tilesToRemove(keys(mine), keep)) {
    const [layer, z, x, y] = k.split('/');
    try {
      const f = tileFile(layer as OfflineLayer, Number(z), Number(x), Number(y));
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
  try {
    manifestFile(id).delete();
  } catch {
    // Already gone.
  }
}

export function renameOfflineMap(id: string, name: string) {
  update(id, { name: name.trim() || 'Map Area' });
}

/** Free space left on the phone, in bytes, or null when the phone won't say. */
export function freeSpace(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}
