/**
 * Private trail backup: the rider's own Map Mode trails (recorded, drawn and saved) follow their
 * account to every device they sign in on (lib/trail-backup.ts, migration
 * 20261103300000_account_sync.sql). The backup is private: only the rider can read it, by
 * row-level security, and its photos sit in a private bucket. Share with Everyone is still the
 * only way a trail becomes public, and only the trimmed, thinned copy goes public, as before.
 *
 * Each trail syncs on its own: the newer copy wins. Deleting a trail leaves a tombstone, so the
 * delete reaches the other devices instead of the trail coming back from the backup.
 *
 * Pure, so it is tested without a phone.
 */
import type { LocalTrail } from './nav-trails';

export const TRAIL_BACKUP_BUCKET = 'trail-backups';
/** A photo kept in the private backup bucket is written in a backed-up trail as this, plus its path. */
export const BACKUP_PHOTO_PREFIX = 'backup:';
/** Biggest trail the backup takes (a full day of recording is well under this). */
export const MAX_BACKUP_BYTES = 2_000_000;
/** Tombstones older than this are forgotten (every device has long since synced). */
export const TOMBSTONE_KEEP_MS = 180 * 24 * 3600_000;

/** One row of the backup, as the server returns it. */
export type BackupRow = { trailId: string; data: LocalTrail | null; updatedAt: number; deleted: boolean };

/** Small enough for the backup (core/trail-backup MAX_BACKUP_BYTES)? */
export const fitsBackup = (data: LocalTrail) => JSON.stringify(data).length <= MAX_BACKUP_BYTES;

export type TrailSyncPlan = {
  /** Trails to send: new here, or changed here later than the backup. */
  upload: LocalTrail[];
  /** Deleted here later than the backup copy: mark them deleted there. */
  markDeleted: { trailId: string; at: number }[];
  /** Newer in the backup (or not on this device yet): write them here. */
  restore: BackupRow[];
  /** Deleted on another device later than this device changed them: remove them here. */
  removeLocal: string[];
  /** Tombstones the backup now agrees with (or that are old): forget them. */
  settledTombstones: string[];
};

export const trailTime = (t: Pick<LocalTrail, 'updatedAt' | 'createdAt'>) => {
  const ms = Date.parse(t.updatedAt || t.createdAt);
  return Number.isFinite(ms) ? ms : 0;
};

/** Trails on this device that belong to the signed-in rider (unclaimed ones are claimed). */
export const ownedBy = (t: LocalTrail, me: string) => !t.owner || t.owner === me;

export function parseBackupRows(raw: unknown): BackupRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): BackupRow[] => {
    if (!r || typeof r !== 'object') return [];
    const m = r as Record<string, unknown>;
    if (typeof m.trail_id !== 'string') return [];
    const at = typeof m.updated_at === 'string' ? Date.parse(m.updated_at) : typeof m.updated_at === 'number' ? m.updated_at : NaN;
    if (!Number.isFinite(at)) return [];
    const deleted = m.deleted === true;
    const d = m.data as LocalTrail | null;
    // data is left out when only the list was asked for (lib/trail-backup reads the list first).
    const data = !deleted && d && typeof d === 'object' && typeof d.id === 'string' && Array.isArray(d.points) ? { ...d, id: m.trail_id } : null;
    return [{ trailId: m.trail_id, data, updatedAt: at, deleted }];
  });
}

/** Decide, trail by trail, what goes up, what comes down and what is removed. */
export function planTrailSync(
  local: LocalTrail[],
  tombstones: Record<string, number>,
  remote: BackupRow[],
  me: string,
  now: number,
): TrailSyncPlan {
  const plan: TrailSyncPlan = { upload: [], markDeleted: [], restore: [], removeLocal: [], settledTombstones: [] };
  const byId = new Map(remote.map((r) => [r.trailId, r]));
  const mine = local.filter((t) => ownedBy(t, me));
  const localIds = new Set(local.map((t) => t.id));

  for (const t of mine) {
    const r = byId.get(t.id);
    const at = trailTime(t);
    if (!r || at > r.updatedAt) plan.upload.push(t);
    else if (r.updatedAt > at) {
      if (r.deleted) plan.removeLocal.push(t.id);
      else plan.restore.push(r);
    }
  }
  for (const [id, at] of Object.entries(tombstones)) {
    if (localIds.has(id)) {
      plan.settledTombstones.push(id); // Saved again since: the trail itself wins.
      continue;
    }
    const r = byId.get(id);
    if (!r) plan.settledTombstones.push(id);
    else if (r.deleted || r.updatedAt >= at) {
      // Already gone there, or changed on another device after this delete: that copy wins.
      plan.settledTombstones.push(id);
      if (!r.deleted) plan.restore.push(r);
    } else plan.markDeleted.push({ trailId: id, at });
    if (now - at > TOMBSTONE_KEEP_MS && !plan.settledTombstones.includes(id)) plan.settledTombstones.push(id);
  }
  for (const r of remote) {
    if (r.deleted || localIds.has(r.trailId) || r.trailId in tombstones) continue;
    plan.restore.push(r);
  }
  return plan;
}

/** The trail as the backup keeps it: photos on this device point at their backup copies. */
export function backupCopy(t: LocalTrail, photoPaths: Record<string, string>, me: string): { data: LocalTrail; missing: string[] } {
  const missing: string[] = [];
  const photos = t.photos.flatMap((p) => {
    if (p.startsWith('https://') || p.startsWith(BACKUP_PHOTO_PREFIX)) return [p];
    const path = photoPaths[p];
    if (path) return [BACKUP_PHOTO_PREFIX + path];
    missing.push(p);
    return [];
  });
  return { data: { ...t, photos, owner: me }, missing };
}

/** Where a device photo goes in the private bucket: the rider's own folder, by trail. */
export function backupPhotoPath(me: string, trailId: string, localUri: string, index: number): string {
  const ext = /\.png$/i.test(localUri) || localUri.startsWith('data:image/png') ? 'png' : 'jpg';
  const safeId = trailId.replace(/[^A-Za-z0-9_-]/g, '');
  return `${me}/${safeId}/${index}-${hashText(localUri)}.${ext}`;
}

/** A short stable fingerprint of a text (FNV-1a), so the same photo always gets the same path. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Backup photo paths a trail uses (for restoring on another device). */
export const backupPhotoPathsOf = (t: LocalTrail) =>
  t.photos.filter((p) => p.startsWith(BACKUP_PHOTO_PREFIX)).map((p) => p.slice(BACKUP_PHOTO_PREFIX.length));
