/**
 * Group photos: the shared rules for cropping, naming and showing a riding group's photo.
 *
 * Only the group's owner (whoever made it) sets one. The app crops it to a centered 16:9 frame (a
 * crew lined up by their rigs is wide) and saves a 1280 x 720 JPEG before upload, never over
 * GROUP_PHOTO_MAX_BYTES, so it loads fast on weak signal and looks the same on every device. The
 * database keeps only the file's path inside the owner's own folder of the group-photos bucket
 * (migration 20261105080000_group_photos.sql); it refuses any other path.
 */
import type { Rect } from './avatar';

/** Storage bucket for group photos (public read, owner-only write). */
export const GROUP_PHOTO_BUCKET = 'group-photos';

/** Width and height of the saved photo, in pixels (16:9). */
export const GROUP_PHOTO_WIDTH = 1280;
export const GROUP_PHOTO_HEIGHT = 720;
export const GROUP_PHOTO_ASPECT = GROUP_PHOTO_WIDTH / GROUP_PHOTO_HEIGHT;

/** JPEG quality for the saved photo (0-1). Lowered step by step if the file is still too big. */
export const GROUP_PHOTO_QUALITY = 0.72;

/** The most a saved photo may weigh. A very detailed photo is saved again at lower quality until it fits. */
export const GROUP_PHOTO_MAX_BYTES = 400 * 1024;

/**
 * The largest centered rectangle of `aspect` (width / height) inside a width x height image, in
 * whole pixels. Native pickers let the owner frame it first; this also crops a photo picked on the
 * website, where the browser has no crop step.
 */
export function aspectCrop(width: number, height: number, aspect: number = GROUP_PHOTO_ASPECT): Rect {
  const w = Math.max(1, Math.floor(width || 1));
  const h = Math.max(1, Math.floor(height || 1));
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  let cw = w;
  let ch = Math.floor(w / a);
  if (ch > h) {
    ch = h;
    cw = Math.floor(h * a);
  }
  cw = Math.max(1, Math.min(w, cw));
  ch = Math.max(1, Math.min(h, ch));
  return { originX: Math.floor((w - cw) / 2), originY: Math.floor((h - ch) / 2), width: cw, height: ch };
}

/** Does the photo already have this shape (within a pixel or two)? Then it isn't cropped again. */
export function hasAspect(width: number, height: number, aspect: number = GROUP_PHOTO_ASPECT): boolean {
  if (!width || !height) return false;
  return Math.abs(width / height - aspect) < 0.01;
}

/**
 * A new file path for a group's photo: the owner's folder, the group's id, a random token and the
 * time. The bucket is public-read, so the random token is what keeps the address unguessable.
 */
export function groupPhotoPath(ownerId: string, groupId: string, token: string, now: number = Date.now()): string {
  const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (clean.length < 16) throw new Error('group photo token too short');
  const group = groupId.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 36);
  return `${ownerId}/${group}-${clean}-${now}.jpg`;
}

const FILE = /^[A-Za-z0-9._-]{1,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `path` is a file in one rider's folder. With `ownerId` it must be that owner's folder
 * (the same rule the database checks). Without it (the invite link, which doesn't say who owns the
 * group) the folder must at least be a user id. A web address or a nested path is never shown.
 */
export function isGroupPhotoPath(path: string | null | undefined, ownerId?: string | null): path is string {
  if (!path || path.length > 160) return false;
  const slash = path.indexOf('/');
  if (slash < 0) return false;
  const folder = path.slice(0, slash);
  if (ownerId ? folder !== ownerId : !UUID.test(folder)) return false;
  return FILE.test(path.slice(slash + 1));
}

/** The public web address of a group's photo, or null when there is none or the path isn't valid. */
export function groupPhotoUrl(supabaseUrl: string, path: string | null | undefined, ownerId?: string | null): string | null {
  if (!isGroupPhotoPath(path, ownerId)) return null;
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${GROUP_PHOTO_BUCKET}/${path}`;
}

/** Up to two letters for a group without a photo: "Saturday Crew" -> "SC", "Moab" -> "M". */
export function groupInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? '').join('') || 'G';
}
