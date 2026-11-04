/**
 * Social (core/social, migration 20261102900000_social_hub.sql): the Social feed, likes,
 * comments, posts with a photo, rider profiles and reporting a post or comment. Until the
 * migration runs, reads fail soft (SocialOffError) and the home Feed falls back to home_feed.
 */
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { handleProError } from '@/lib/pro';
import {
  fitWithin, friendlySocialError, isTransientError, nextQuality, parseComment, parseProfile, parseSocial, POST_PHOTO_BUCKET, POST_PHOTO_MAX,
  POST_PHOTO_MAX_BYTES, POST_PHOTO_QUALITY, postPhotoPath, socialNotSwitchedOn, type Comment, type RiderProfile, type SocialItem,
} from '@/core/social';
import { track } from './analytics';
import { readPhotoBytes } from './photo-bytes';
import { supabase, supabaseUrl } from './supabase';

import { tc } from '@/core/i18n';
export class SocialOffError extends Error {}

type Res = { data: unknown; error: { message: string; code?: string } | null };

function check(res: Res): unknown {
  if (res.error) {
    if (socialNotSwitchedOn(res.error.message, res.error.code)) throw new SocialOffError(res.error.message);
    // A Free rider tried a Pro action: the Pro prompt opens; the caller just stops.
    if (handleProError(res.error)) throw new ProNeededError(res.error.message);
    throw new Error(friendly(res.error.message));
  }
  return res.data;
}

/** Thrown after the Pro prompt has opened, so screens can stop without showing an error. */
export class ProNeededError extends Error {}

const friendly = (message: string) => friendlySocialError(message, tc);

/**
 * A read, tried once more after a moment when the first try never got an answer (no signal for
 * a second, or iOS cancelling the request as the app came to the front), so a comment opened
 * from a notification doesn't show an error for a request that would have worked.
 */
async function read(name: string, args: Record<string, unknown>): Promise<Res> {
  const first = (await supabase.rpc(name, args)) as Res;
  if (!first.error || !isTransientError(first.error.message)) return first;
  await new Promise((r) => setTimeout(r, 600));
  return (await supabase.rpc(name, args)) as Res;
}

export async function socialFeed(limit = 30, before?: string | null): Promise<SocialItem[]> {
  return parseSocial(check(await read('social_feed', { p_limit: limit, p_before: before ?? null })), supabaseUrl);
}

export async function riderTimeline(userId: string, limit = 30, before?: string | null): Promise<SocialItem[]> {
  return parseSocial(check(await read('rider_timeline', { p_user: userId, p_limit: limit, p_before: before ?? null })), supabaseUrl);
}

export async function feedItem(key: string): Promise<SocialItem | null> {
  return parseSocial(check(await read('feed_item', { p_key: key })), supabaseUrl)[0] ?? null;
}

export async function itemComments(key: string): Promise<Comment[]> {
  return parseComment(check(await read('feed_item_comments', { p_key: key })));
}

export async function itemLikers(key: string): Promise<{ userId: string; name: string }[]> {
  const rows = check(await read('feed_item_likes', { p_key: key }));
  return Array.isArray(rows)
    ? rows.filter((r) => r && typeof r.user_id === 'string').map((r) => ({ userId: r.user_id as string, name: (typeof r.name === 'string' && r.name) || tc('Rider') }))
    : [];
}

export async function riderProfile(userId: string): Promise<RiderProfile | null> {
  return parseProfile(check(await supabase.rpc('rider_profile', { p_user: userId })));
}

/** Like or unlike; returns the new count. */
export async function setLike(key: string, liked: boolean): Promise<number> {
  const n = check(await supabase.rpc('set_feed_like', { p_key: key, p_liked: liked }));
  if (liked) track('feed_like', { kind: key.split(':')[0] });
  return typeof n === 'number' ? n : 0;
}

export async function addComment(key: string, body: string): Promise<string> {
  const id = check(await supabase.rpc('add_feed_comment', { p_key: key, p_body: body }));
  track('feed_comment', { kind: key.split(':')[0] });
  return String(id);
}

export async function deleteComment(id: string): Promise<void> {
  check(await supabase.rpc('delete_feed_comment', { p_id: id }));
}

/** Lets the rider pick a photo for a post (library, or the camera in the app). Null when cancelled. */
export async function pickPostPhoto(source: 'camera' | 'library'): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('OnMyLead needs the camera to take a photo. Turn it on in Settings, or choose one instead.');
    const res = await ImagePicker.launchCameraAsync(options);
    return res.canceled ? null : (res.assets[0] ?? null);
  }
  const res = await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : (res.assets[0] ?? null);
}

/**
 * Shrinks a photo to at most 1280 px on its long side and saves it as JPEG, lowering the quality
 * until it's under the size cap, so a post photo is about 120-300 KB wherever it was taken.
 */
async function shrinkPhoto(asset: ImagePicker.ImagePickerAsset): Promise<{ uri: string; bytes: ArrayBuffer | Blob }> {
  const size = fitWithin(asset.width || POST_PHOTO_MAX, asset.height || POST_PHOTO_MAX);
  let quality: number | null = POST_PHOTO_QUALITY;
  while (quality != null) {
    const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (asset.width && asset.height && (size.width < asset.width || size.height < asset.height)) ctx.resize(size);
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: ImageManipulator.SaveFormat.JPEG });
    const bytes = await readPhotoBytes({ uri: saved.uri, mimeType: 'image/jpeg' });
    const length = bytes instanceof Blob ? bytes.size : bytes.byteLength;
    const next = nextQuality(quality, length, POST_PHOTO_MAX_BYTES);
    if (next === quality) return { uri: saved.uri, bytes };
    quality = next;
  }
  throw new Error('That photo is too big to post. Try another one.');
}

/** Posts to the rider's profile (and their friends' feeds). Pro only; the server checks too. */
export async function createPost(body: string, photo: ImagePicker.ImagePickerAsset | null, userId: string): Promise<string> {
  let path: string | null = null;
  const bucket = supabase.storage.from(POST_PHOTO_BUCKET);
  if (photo) {
    const { bytes } = await shrinkPhoto(photo);
    path = postPhotoPath(userId, Crypto.randomUUID());
    const { error } = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw new Error(/bucket not found/i.test(error.message) ? 'Photos in posts start with the next server update.' : error.message);
  }
  try {
    const id = check(await supabase.rpc('create_rider_post', { p_body: body, p_photo_path: path }));
    track('feed_post', { photo: !!path, platform: Platform.OS });
    return String(id);
  } catch (e) {
    if (path) await bucket.remove([path]);
    throw e;
  }
}

export async function deletePost(postId: string): Promise<void> {
  const path = check(await supabase.rpc('delete_rider_post', { p_id: postId }));
  if (typeof path === 'string' && path) await supabase.storage.from(POST_PHOTO_BUCKET).remove([path]);
}

/** Report a post or comment (the server fills in who wrote it and saves the text). */
export async function reportContent(target: { postId?: string; commentId?: string; userId: string }, reason: string, details: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    kind: 'rider',
    reported_user_id: target.userId,
    post_id: target.postId ?? null,
    comment_id: target.commentId ?? null,
    source: target.postId ? 'post' : 'comment',
    reason,
    details: details.trim() || null,
  });
  if (error) throw new Error(/post_id|comment_id|schema cache/i.test(error.message) ? 'Reporting posts starts with the next server update. You can still report the rider from their profile.' : error.message);
  track('report_sent', { kind: 'rider', source: target.postId ? 'post' : 'comment' });
}

// Admin Dashboard ---------------------------------------------------------------

export type AdminPost = { id: string; body: string | null; photo_path: string | null; created_at: string; hidden_at: string | null; hidden_reason: string | null; hidden_by: string | null; likes: number; comments: number; reports: number };
export type AdminComment = { id: string; item_key: string; body: string; created_at: string; hidden_at: string | null; hidden_reason: string | null; hidden_by: string | null; owner_name: string; reports: number };

export async function adminRiderSocial(userId: string): Promise<{ posts: AdminPost[]; comments: AdminComment[] }> {
  const { data, error } = await supabase.rpc('admin_rider_social', { p_user: userId });
  if (error) {
    if (socialNotSwitchedOn(error.message, error.code) || /admin_rider_social/.test(error.message)) return { posts: [], comments: [] };
    throw new Error(error.message);
  }
  const d = (data ?? {}) as { posts?: AdminPost[]; comments?: AdminComment[] };
  return { posts: d.posts ?? [], comments: d.comments ?? [] };
}

export async function adminSetPostHidden(id: string, hidden: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_post_hidden', { p_id: id, p_hidden: hidden, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}

export async function adminSetCommentHidden(id: string, hidden: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_comment_hidden', { p_id: id, p_hidden: hidden, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}

export async function adminDeletePost(id: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_delete_post', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
  if (typeof data === 'string' && data) await supabase.storage.from(POST_PHOTO_BUCKET).remove([data]);
}

/** A post photo's public address (admin view). */
export function postPhotoAddress(authorId: string, path: string | null): string | null {
  if (!path || !path.startsWith(`${authorId}/`)) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${POST_PHOTO_BUCKET}/${path}`;
}
