import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import {
  aspectCrop, GROUP_PHOTO_BUCKET, GROUP_PHOTO_HEIGHT, GROUP_PHOTO_MAX_BYTES, GROUP_PHOTO_QUALITY, GROUP_PHOTO_WIDTH,
  groupPhotoPath, hasAspect, isGroupPhotoPath,
} from '@/core/group-photo';
import { can } from '@/core/entitlements';
import { nextQuality } from '@/core/social';
import { track } from './analytics';
import { currentEntitlements, refreshEntitlements } from './entitlements';
import { readPhotoBytes } from './photo-bytes';
import { supabase } from './supabase';

/**
 * Group photos (core/group-photo, migration 20261105080000_group_photos.sql). The owner of a riding
 * group picks or takes a photo; it is cropped to 16:9, shrunk to 1280 x 720 and saved in their own
 * folder of the group-photos bucket, and the group's photo_path points at it.
 */

export type GroupPhotoSource = 'camera' | 'library';

/** The camera is offered in the app; on the website the browser's file chooser covers it. */
export const canUseGroupCamera = Platform.OS !== 'web';

const NOT_ON = 'Group photos aren’t switched on yet. Try again after the next update.';
const isNotOn = (message: string) => !/check constraint/i.test(message) && /photo_path|schema cache|bucket not found/i.test(message);

/**
 * Lets the owner take or pick a photo. Android's crop screen keeps it 16:9; iPhone and iPad's crop
 * screen can only make squares, so there (and on the website) the photo is centred to 16:9 instead.
 * Returns null when they cancel.
 */
export async function pickGroupPhoto(source: GroupPhotoSource): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], quality: 1,
    ...(Platform.OS === 'android' ? { allowsEditing: true, aspect: [16, 9] as [number, number] } : {}),
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('OnMyLead needs the camera to take the group photo. Turn it on in Settings, or choose a photo instead.');
    const res = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.back });
    return res.canceled ? null : (res.assets[0] ?? null);
  }
  const res = await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : (res.assets[0] ?? null);
}

/** Crops to 16:9 and saves a 1280 x 720 JPEG, again at lower quality while it's too big. */
async function wideJpeg(asset: ImagePicker.ImagePickerAsset): Promise<ArrayBuffer | Blob> {
  let quality: number | null = GROUP_PHOTO_QUALITY;
  while (quality != null) {
    const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (asset.width && asset.height && !hasAspect(asset.width, asset.height)) ctx.crop(aspectCrop(asset.width, asset.height));
    ctx.resize({ width: GROUP_PHOTO_WIDTH, height: GROUP_PHOTO_HEIGHT });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: ImageManipulator.SaveFormat.JPEG });
    const bytes = await readPhotoBytes({ uri: saved.uri, mimeType: 'image/jpeg' });
    const next = nextQuality(quality, bytes instanceof Blob ? bytes.size : bytes.byteLength, GROUP_PHOTO_MAX_BYTES);
    if (next === quality) return bytes;
    quality = next;
  }
  throw new Error('That photo is too big. Try another one.');
}

type Row = { owner_id: string; photo_path: string | null };

async function groupRow(groupId: string): Promise<Row> {
  const { data, error } = await supabase.from('riding_groups').select('owner_id, photo_path').eq('id', groupId).maybeSingle();
  if (error) throw new Error(isNotOn(error.message) ? NOT_ON : error.message);
  if (!data) throw new Error('This group is gone, or you’re no longer in it.');
  return data as Row;
}

async function ownerRow(groupId: string): Promise<Row> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  const row = await groupRow(groupId);
  if (row.owner_id !== data.user.id) throw new Error('Only the rider who made the group can change its photo.');
  return row;
}

/** Uploads the picked photo as the group's photo and removes the old file. */
export async function saveGroupPhoto(groupId: string, asset: ImagePicker.ImagePickerAsset): Promise<void> {
  const row = await ownerRow(groupId);
  const bytes = await wideJpeg(asset);
  const path = groupPhotoPath(row.owner_id, groupId, Crypto.randomUUID());
  const bucket = supabase.storage.from(GROUP_PHOTO_BUCKET);
  const { error: upErr } = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  // The bucket refuses uploads without the feature (a plan that just ended): the Pro prompt shows,
  // but only when the plan, checked again now, really is without it (not a signed-out session).
  if (upErr) {
    if (isNotOn(upErr.message)) throw new Error(NOT_ON);
    if (/row-level security/i.test(upErr.message) && !can(await refreshEntitlements().catch(() => currentEntitlements()), 'group_photos'))
      throw new Error('pro_required:group_photos');
    throw new Error(upErr.message);
  }
  const { data: updated, error } = await supabase.from('riding_groups').update({ photo_path: path }).eq('id', groupId).select('id');
  if (error || !updated?.length) {
    await bucket.remove([path]);
    // No row changed: the group is gone or no longer this rider's.
    throw new Error(error ? (isNotOn(error.message) ? NOT_ON : error.message) : 'This group was deleted or is no longer yours.');
  }
  if (isGroupPhotoPath(row.photo_path, row.owner_id) && row.photo_path !== path) await bucket.remove([row.photo_path]);
  track('group_photo_saved', { platform: Platform.OS });
}

/** Removes the group's photo; the group shows its initials again. */
export async function removeGroupPhoto(groupId: string): Promise<void> {
  const row = await ownerRow(groupId);
  if (!row.photo_path) return;
  const { data: updated, error } = await supabase.from('riding_groups').update({ photo_path: null }).eq('id', groupId).select('id');
  if (error) throw new Error(error.message);
  // No row changed: the group is gone or no longer this rider's, so its file stays.
  if (!updated?.length) throw new Error('This group was deleted or is no longer yours.');
  if (isGroupPhotoPath(row.photo_path, row.owner_id)) await supabase.storage.from(GROUP_PHOTO_BUCKET).remove([row.photo_path]);
  track('group_photo_removed');
}

/** Deleting a group: its photo file goes too (best effort, it sits at an unguessable path anyway). */
export async function removeGroupPhotoFile(ownerId: string, path: string | null | undefined): Promise<void> {
  if (!isGroupPhotoPath(path, ownerId)) return;
  await supabase.storage.from(GROUP_PHOTO_BUCKET).remove([path]).catch(() => {});
}

// --- Admin ---------------------------------------------------------------------

export type AdminGroup = { id: string; name: string; photo_path: string | null; riders: number; created_at: string };

/** The groups a rider runs, with their photos. Empty until the group photo server update is on. */
export async function adminUserGroups(userId: string): Promise<AdminGroup[]> {
  const { data, error } = await supabase.rpc('admin_user_groups', { p_user: userId });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminGroup[];
}

/**
 * Admin: takes down a group's photo with a reason (logged in the Audit Log), then deletes the
 * file. The admin storage policy allows the delete for admins signed in with two-factor.
 */
export async function adminRemoveGroupPhoto(groupId: string, ownerId: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_remove_group_photo', { p_group: groupId, p_reason: reason });
  if (error) throw new Error(error.message);
  if (typeof data === 'string' && isGroupPhotoPath(data, ownerId)) {
    // The group no longer shows it; say so if the file itself is still up (try again to remove it).
    // Storage answers a refused delete with no error and nothing deleted, so check both.
    const { data: gone, error: rmErr } = await supabase.storage.from(GROUP_PHOTO_BUCKET).remove([data]);
    // The group's photo is already cleared, so this can't be retried here: name the file to delete by hand.
    if (rmErr || !gone?.length)
      throw new Error(`The group no longer shows the photo, but its file is still in storage: delete ${GROUP_PHOTO_BUCKET}/${data} in Supabase Storage${rmErr ? ` (${rmErr.message})` : ''}.`);
  }
}
