import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocalTrail } from '@/core/nav-trails';
import {
  backupCopy, backupPhotoPath, backupPhotoPathsOf, BACKUP_PHOTO_PREFIX, fitsBackup, parseBackupRows, planTrailSync, trailTime,
  TRAIL_BACKUP_BUCKET,
} from '@/core/trail-backup';
import { allLocalTrails, putBackedUpTrails, readTombstones, setTrailBackupHooks, setTrailViewer, writeTombstones } from './nav-trails';
import { readPhotoBytes } from './photo-bytes';
import { isBackendConfigured, supabase } from './supabase';
import { restorePhoto } from './trail-photo-files';
import { can } from '@/core/entitlements';
import { currentEntitlements } from './entitlements';

/**
 * The rider's private trail backup (core/trail-backup.ts has the rules): every recorded, drawn and
 * saved Map Mode trail goes to their account, so it shows on each device they sign in on. Runs with
 * the settings sync (lib/settings-sync startSettingsSync) and a few seconds after a trail changes.
 * Offline it simply waits; the trails are on the device either way.
 */

/** Which backup copy each photo on this device is (device file -> path in the private bucket). */
const PHOTO_MAP_KEY = 'nav.trailPhotoBackups.v1';

async function readPhotoMap(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PHOTO_MAP_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
const writePhotoMap = (m: Record<string, string>) => AsyncStorage.setItem(PHOTO_MAP_KEY, JSON.stringify(m)).catch(() => {});

let timer: ReturnType<typeof setTimeout> | null = null;
setTrailBackupHooks(() => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    backupTrailsNow();
  }, 4_000);
});

let running: Promise<void> | null = null;
let again = false;

/** Swap trails with the backup now. Safe to call often; does nothing when signed out. */
export function backupTrailsNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run()
    .catch(() => {
      // Offline, or the server doesn't have the backup yet: try again next time.
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        backupTrailsNow();
      }
    });
  return running;
}

async function run() {
  if (!isBackendConfigured) return;
  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user.id ?? null;
  // Whoever is signed in sees their own trails (and the device's unowned ones), Pro or not.
  setTrailViewer(me);
  if (!me) return;
  // Sync across devices is Pro: a Free account keeps its settings and trails on this device.
  if (!can(currentEntitlements(), 'sync')) return;

  const { data: list, error } = await supabase.from('rider_trail_backups').select('trail_id, deleted, updated_at');
  if (error) throw new Error(error.message);
  const local = await allLocalTrails();
  const tombstones = await readTombstones();
  const plan = planTrailSync(local, tombstones, parseBackupRows(list), me, Date.now());
  const bucket = supabase.storage.from(TRAIL_BACKUP_BUCKET);
  const photoMap = await readPhotoMap();

  // 1. Up: new and changed trails, photos first.
  const claimed: LocalTrail[] = [];
  for (const t of plan.upload) {
    for (const [i, p] of t.photos.entries()) {
      if (p.startsWith('https://') || p.startsWith(BACKUP_PHOTO_PREFIX) || photoMap[p]) continue;
      const path = backupPhotoPath(me, t.id, p, i);
      const png = path.endsWith('.png');
      const contentType = png ? 'image/png' : 'image/jpeg';
      const { error: upErr } = await bucket.upload(path, await readPhotoBytes({ uri: p, mimeType: contentType }), { contentType, upsert: true });
      if (!upErr) photoMap[p] = path;
    }
    const { data } = backupCopy(t, photoMap, me);
    if (!fitsBackup(data)) continue;
    const { error: e } = await supabase.rpc('backup_trail', { p_trail_id: t.id, p_data: data, p_updated_at: new Date(trailTime(t)).toISOString() });
    if (e) continue;
    if (!t.owner) claimed.push({ ...t, owner: me });
  }
  await writePhotoMap(photoMap);

  // 2. Deletes made here.
  const tomb = { ...tombstones };
  for (const d of plan.markDeleted) {
    const { error: e } = await supabase.rpc('backup_trail', { p_trail_id: d.trailId, p_data: null, p_updated_at: new Date(d.at).toISOString() });
    if (e) continue;
    delete tomb[d.trailId];
    removeBackupPhotos(me, d.trailId);
  }
  for (const id of plan.settledTombstones) delete tomb[id];
  await writeTombstones(tomb);

  // 3. Down: trails changed or added on the rider's other devices.
  const restored: LocalTrail[] = [];
  const ids = plan.restore.map((r) => r.trailId);
  for (let i = 0; i < ids.length; i += 20) {
    const { data: rows, error: e } = await supabase
      .from('rider_trail_backups')
      .select('trail_id, data, deleted, updated_at')
      .in('trail_id', ids.slice(i, i + 20));
    if (e) break;
    for (const r of parseBackupRows(rows)) {
      if (!r.data) continue;
      restored.push(await withDevicePhotos(r.data, me, photoMap));
    }
  }
  await writePhotoMap(photoMap);

  await putBackedUpTrails([...claimed, ...restored], plan.removeLocal);
}

/** Bring a backed-up trail's private photos onto this device; public (https) ones stay links. */
async function withDevicePhotos(t: LocalTrail, me: string, photoMap: Record<string, string>): Promise<LocalTrail> {
  const paths = backupPhotoPathsOf(t);
  const byPath = new Map(Object.entries(photoMap).map(([uri, path]) => [path, uri]));
  const photos: string[] = [];
  for (const p of t.photos) {
    if (!p.startsWith(BACKUP_PHOTO_PREFIX)) {
      photos.push(p);
      continue;
    }
    const path = p.slice(BACKUP_PHOTO_PREFIX.length);
    const have = byPath.get(path);
    if (have) {
      photos.push(have);
      continue;
    }
    if (!paths.includes(path)) continue;
    try {
      const { data, error } = await supabase.storage.from(TRAIL_BACKUP_BUCKET).createSignedUrl(path, 300);
      if (error || !data) continue;
      const uri = await restorePhoto(data.signedUrl, t.id, path.endsWith('.png'));
      photoMap[uri] = path;
      photos.push(uri);
    } catch {
      // Left out on this device; it's still in the backup.
    }
  }
  return { ...t, photos, owner: me };
}

/** Best effort: the photos of a trail deleted for good. */
async function removeBackupPhotos(me: string, trailId: string) {
  try {
    const folder = `${me}/${trailId.replace(/[^A-Za-z0-9_-]/g, '')}`;
    const bucket = supabase.storage.from(TRAIL_BACKUP_BUCKET);
    const { data } = await bucket.list(folder);
    if (data?.length) await bucket.remove(data.map((f) => `${folder}/${f.name}`));
  } catch {
    // An orphan photo is private and only the rider can reach it.
  }
}
