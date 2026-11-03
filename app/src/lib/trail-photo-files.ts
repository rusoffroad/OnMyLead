import { Directory, File, Paths } from 'expo-file-system';

/** Trail photos the rider added on this phone, kept in the app's documents folder. */
const DIR = new Directory(Paths.document, 'trail-photos');

/** Copy a picked photo (from the picker's cache) next to the trail; returns its lasting file URI. */
export async function keepPhoto(picked: { uri: string; mimeType?: string | null }, trailId: string): Promise<string> {
  if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  const ext = picked.mimeType === 'image/png' || /\.png$/i.test(picked.uri) ? 'png' : 'jpg';
  const dest = new File(DIR, `${trailId}-${Date.now()}.${ext}`);
  new File(picked.uri).copy(dest);
  return dest.uri;
}

/** Delete a photo this app saved. Anything else (an uploaded https photo) is left alone. */
export function dropPhoto(uri: string) {
  if (!uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/** Save a photo from the rider's private trail backup (a short-lived signed link) next to the trail. */
export async function restorePhoto(url: string, trailId: string, png: boolean): Promise<string> {
  if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  const dest = new File(DIR, `${trailId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${png ? 'png' : 'jpg'}`);
  const got = await File.downloadFileAsync(url, dest);
  return got.uri;
}
