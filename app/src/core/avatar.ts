/**
 * Profile pictures: the shared rules for cropping, naming and showing a rider's photo.
 *
 * The app crops every photo to a centered square and saves a 512 x 512 JPEG before upload, so a
 * picture is small (about 50-150 KB), loads fast on weak signal and looks the same on every
 * device. The database keeps only the file's path inside the rider's own folder of the
 * rider-avatars bucket (migration 20261102000000_profile_photos.sql); it refuses any other path.
 */

/** Storage bucket for profile pictures (public read, owner-only write). */
export const AVATAR_BUCKET = 'rider-avatars';

/** Width and height of the saved picture, in pixels. */
export const AVATAR_SIZE = 512;

/** JPEG quality for the saved picture (0-1). */
export const AVATAR_QUALITY = 0.8;

export type Rect = { originX: number; originY: number; width: number; height: number };

/**
 * The largest centered square inside a width x height image, in whole pixels. Native pickers
 * already let the rider crop to a square; this also squares a photo picked on the website, where
 * the browser has no crop step.
 */
export function squareCrop(width: number, height: number): Rect {
  const w = Math.max(1, Math.floor(width || 1));
  const h = Math.max(1, Math.floor(height || 1));
  const side = Math.min(w, h);
  return { originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side };
}

/**
 * A new file path for a rider's picture: their folder plus a random token and the time. The
 * bucket is public-read, so the random token is what keeps a picture's address unguessable;
 * the address itself is only handed to signed-in riders (profiles are not readable signed out).
 */
export function avatarPath(userId: string, token: string, now: number = Date.now()): string {
  const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (clean.length < 16) throw new Error('avatar token too short');
  return `${userId}/${clean}-${now}.jpg`;
}

const FILE = /^[A-Za-z0-9._-]{1,80}$/;

/**
 * True when `path` is a picture in this rider's own folder, the same rule the database checks.
 * Anything else (another rider's folder, a web address, a nested path) is never shown.
 */
export function isOwnAvatarPath(userId: string, path: string | null | undefined): path is string {
  if (!path || path.length > 120) return false;
  const slash = path.indexOf('/');
  if (slash < 0 || path.slice(0, slash) !== userId) return false;
  return FILE.test(path.slice(slash + 1));
}

/** The public web address of a picture, or null when there is none or the path isn't valid. */
export function avatarUrl(supabaseUrl: string, userId: string, path: string | null | undefined): string | null {
  if (!isOwnAvatarPath(userId, path)) return null;
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/** Ids not asked for yet, unique and in order, so a screen full of riders costs one query. */
export function idsToFetch(wanted: readonly string[], known: { has(id: string): boolean }, pending: { has(id: string): boolean }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of wanted) {
    if (!id || seen.has(id) || known.has(id) || pending.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Splits ids into groups small enough for one `in (...)` query each. */
export function chunk<T>(items: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
