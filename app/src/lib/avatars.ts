import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import {
  AVATAR_BUCKET, AVATAR_MAX_BYTES, AVATAR_QUALITY, AVATAR_SIZE, avatarPath, avatarUrl, chunk, idsToFetch, isOwnAvatarPath, squareCrop,
} from '@/core/avatar';
import { nextQuality } from '@/core/social';
import { track } from './analytics';
import { readPhotoBytes } from './photo-bytes';
import { supabase, supabaseUrl } from './supabase';

/**
 * Profile pictures. Riders' photos are read from profiles.avatar_path (readable by signed-in
 * riders, like the ride name) and cached for the app session. Components ask with useAvatar;
 * every id asked for in the same moment goes in one query.
 */

// user id -> picture URL (null = no picture, or not visible to this rider).
const known = new Map<string, string | null>();
const pending = new Set<string>();
const queued = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

async function flush() {
  timer = null;
  const ids = [...queued];
  queued.clear();
  for (const id of ids) pending.add(id);
  for (const group of chunk(ids)) {
    const { data, error } = await supabase.from('profiles').select('id, avatar_path').in('id', group);
    // Older servers (before the migration) have no avatar_path: everyone keeps their initial.
    const rows = error ? [] : ((data ?? []) as { id: string; avatar_path: string | null }[]);
    const byId = new Map(rows.map((r) => [r.id, r.avatar_path]));
    for (const id of group) {
      pending.delete(id);
      // A failed request (no signal) is asked again next time instead of caching "no photo".
      if (error && !/avatar_path|column|schema cache/i.test(error.message)) continue;
      known.set(id, avatarUrl(supabaseUrl, id, byId.get(id)));
    }
  }
  emit();
}

function request(ids: readonly string[]) {
  const missing = idsToFetch(ids, known, pending);
  const fresh = missing.filter((id) => !queued.has(id));
  if (!fresh.length) return;
  for (const id of fresh) queued.add(id);
  if (!timer) timer = setTimeout(flush, 0);
}

/** A rider's picture URL, or null while loading or when they have none. */
export function useAvatar(userId: string | null | undefined): string | null {
  // The snapshot is the value itself (undefined = not asked yet), so React re-renders when it changes.
  const value = useSyncExternalStore(subscribe, () => (userId ? known.get(userId) : null), () => null);
  useEffect(() => {
    if (userId && value === undefined) request([userId]);
  }, [userId, value]);
  return value ?? null;
}

// Signing in or out changes what this device may see (profiles are for signed-in riders only).
let viewer: string | null | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const id = session?.user.id ?? null;
  if (viewer !== undefined && id !== viewer) {
    known.clear();
    emit();
  }
  viewer = id;
});

function remember(userId: string, path: string | null) {
  known.set(userId, avatarUrl(supabaseUrl, userId, path));
  emit();
}

export type AvatarSource = 'camera' | 'library';

/** The camera is offered in the app; on the website the browser's file chooser covers it. */
export const canUseCamera = Platform.OS !== 'web';

/**
 * Lets the rider take or pick a photo, cropped square (the native crop screen on iPhone, iPad
 * and Android). Returns null when they cancel or say no to access.
 */
export async function pickAvatar(source: AvatarSource): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1,
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('OnMyLead needs the camera to take your picture. Turn it on in Settings, or choose a photo instead.');
    const res = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front });
    return res.canceled ? null : (res.assets[0] ?? null);
  }
  const res = await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : (res.assets[0] ?? null);
}

/**
 * Squares (auto-crops to the centre) and shrinks a picked photo to a 512 x 512 JPEG, saving it
 * again at lower quality while it's over AVATAR_MAX_BYTES, so every picture stays small in storage.
 */
async function squareJpeg(asset: ImagePicker.ImagePickerAsset): Promise<{ uri: string; bytes: ArrayBuffer | Blob }> {
  let quality: number | null = AVATAR_QUALITY;
  while (quality != null) {
    const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (asset.width && asset.height && asset.width !== asset.height) ctx.crop(squareCrop(asset.width, asset.height));
    ctx.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: ImageManipulator.SaveFormat.JPEG });
    const bytes = await readPhotoBytes({ uri: saved.uri, mimeType: 'image/jpeg' });
    const next = nextQuality(quality, bytes instanceof Blob ? bytes.size : bytes.byteLength, AVATAR_MAX_BYTES);
    if (next === quality) return { uri: saved.uri, bytes };
    quality = next;
  }
  throw new Error('That photo is too big. Try another one.');
}

async function signedInId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  return data.user.id;
}

/** The signed-in rider's saved picture path, or null. */
async function myAvatarPath(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('avatar_path').eq('id', userId).maybeSingle();
  if (error) throw new Error(/avatar_path|column|schema cache/i.test(error.message) ? 'Profile pictures aren’t switched on yet. Try again after the next update.' : error.message);
  return (data as { avatar_path: string | null } | null)?.avatar_path ?? null;
}

/** Uploads the picked photo as the rider's picture and removes the old file. */
export async function saveAvatar(asset: ImagePicker.ImagePickerAsset): Promise<void> {
  const uid = await signedInId();
  const old = await myAvatarPath(uid);
  const { bytes } = await squareJpeg(asset);
  const path = avatarPath(uid, Crypto.randomUUID());
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { error: upErr } = await bucket.upload(path, bytes, {
    contentType: 'image/jpeg', upsert: false, cacheControl: '31536000',
  });
  if (upErr) throw new Error(upErr.message);
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  if (error) {
    await bucket.remove([path]);
    throw new Error(error.message);
  }
  remember(uid, path);
  if (isOwnAvatarPath(uid, old) && old !== path) await bucket.remove([old]);
  track('profile_photo_saved', { platform: Platform.OS });
}

/** Removes the rider's picture; they show as their initial again. */
export async function removeAvatar(): Promise<void> {
  const uid = await signedInId();
  const old = await myAvatarPath(uid);
  if (!old) return remember(uid, null);
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', uid);
  if (error) throw new Error(error.message);
  remember(uid, null);
  if (isOwnAvatarPath(uid, old)) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
  track('profile_photo_removed');
}

/**
 * Admin: takes down a rider's picture with a reason (logged in the Audit Log), then deletes the
 * file. The admin storage policy allows the delete for admins signed in with two-factor.
 */
export async function adminRemoveAvatar(userId: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_remove_profile_photo', { p_user: userId, p_reason: reason });
  if (error) throw new Error(error.message);
  remember(userId, null);
  if (typeof data === 'string' && isOwnAvatarPath(userId, data)) await supabase.storage.from(AVATAR_BUCKET).remove([data]);
}
