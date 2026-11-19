import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LatLng } from '@/core/geo';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { nextQuality } from '@/core/social';
import {
  isOwnSpotPhoto, parseSavedMiles, parseSpotDetail, parseSpotPage, parseSpots, REVIEW_MAX_PHOTOS, SPOT_PHOTO_BUCKET, spotPhotoPath,
  type ReviewDraft, type Spot, type SpotDetail, type SpotKind, type SpotPage, type SpotSuggestion,
} from '@/core/spots';
import { track } from './analytics';
import { readPhotoBytes } from './photo-bytes';
import { supabase } from './supabase';

// Scout (Find > Places to Ride). The server side is migration 20261104170000_riding_spots.sql.

/** Null until the server has Scout (the migration hasn't run yet): the screen says "coming soon". */
const notYet = (message: string) => /riding_spots|schema cache|does not exist|could not find the function/i.test(message);

/** Places to ride within `miles` of a point, nearest first. Null when the server doesn't have Scout yet. */
export async function spotsNear(at: LatLng, miles: number, kinds: SpotKind[] = []): Promise<Spot[] | null> {
  const { data, error } = await supabase.rpc('riding_spots_near', {
    p_lat: at.lat,
    p_lng: at.lng,
    p_miles: miles,
    p_kinds: kinds.length ? kinds : null,
    p_limit: 400,
  });
  if (error) {
    if (notYet(error.message)) return null;
    throw error;
  }
  return parseSpots(data);
}

// Only the columns riders may read (the suggester and their note are never sent).
const DETAIL = 'id, source, name, kind, lat, lng, state, area_name, description, website, vehicle_types, license, attribution';

export async function fetchSpot(id: string): Promise<SpotDetail | null> {
  const { data, error } = await supabase.from('riding_spots').select(DETAIL).eq('id', id).maybeSingle();
  if (error) {
    if (notYet(error.message) || /invalid input syntax/i.test(error.message)) return null;
    throw error;
  }
  return parseSpotDetail(data);
}

/** Sends a missing place to the admin; it shows once approved. */
export async function suggestSpot(s: SpotSuggestion, state: string | null): Promise<void> {
  if (!s.kind || !s.at) throw new Error('Pick what kind of place it is and where it is.');
  const { error } = await supabase.rpc('suggest_riding_spot', {
    p_name: s.name.trim(),
    p_kind: s.kind,
    p_lat: s.at.lat,
    p_lng: s.at.lng,
    p_website: s.website.trim() || null,
    p_note: s.note.trim() || null,
    p_state: state,
  });
  if (error) {
    if (/sign in/i.test(error.message)) throw new Error('Sign in to suggest a place.');
    throw new Error(error.message);
  }
}

// The rider's search distance stays on this device.
const MILES_KEY = 'scout.miles';
export const readScoutMiles = () => AsyncStorage.getItem(MILES_KEY).then(parseSavedMiles).catch(() => parseSavedMiles(null));
export const saveScoutMiles = (miles: number) => AsyncStorage.setItem(MILES_KEY, String(miles)).catch(() => {});

// ---- Place page, reviews and favorites (3.4, migration 20261119100000_places_to_ride.sql) -----

/** The function isn't on the server yet (the migration hasn't run): fall back to the plain place. */
const pageNotYet = (message: string) => /riding_spot_page|schema cache|could not find the function/i.test(message);

/**
 * A place page: details, trails by level, reviews and whether it's a favorite. Before the server
 * update it falls back to the plain place (no details, no reviews). Null when it isn't listed.
 */
export async function fetchSpotPage(id: string): Promise<SpotPage | null> {
  const { data, error } = await supabase.rpc('riding_spot_page', { p_id: id });
  if (error) {
    if (/invalid input syntax/i.test(error.message)) return null;
    if (!pageNotYet(error.message)) throw error;
    const plain = await fetchSpot(id);
    if (!plain) return null;
    return {
      spot: { ...plain, address: null, phone: null, hours: [], fees: null, season: null, detailsSource: null, detailsChecked: null },
      trails: null,
      reviews: { count: 0, average: null, photos: [], list: [], mine: null },
      favorite: false,
    };
  }
  return parseSpotPage(data);
}

/** A review photo's web address (the bucket is public; paths are unguessable). */
export const spotPhotoUrl = (path: string) => supabase.storage.from(SPOT_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

const PHOTO_SIDE = 1600;
const PHOTO_MAX_BYTES = 600 * 1024;

/** Lets the rider pick photos for a review (up to `room` of them). */
export async function pickReviewPhotos(room: number): Promise<ImagePicker.ImagePickerAsset[]> {
  if (room <= 0) return [];
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: room > 1, selectionLimit: room, quality: 1 });
  return res.canceled ? [] : res.assets.slice(0, room);
}

/** Shrinks a photo to 1,600 points on its long side and uploads it to the rider's own folder. Returns its path. */
export async function uploadReviewPhoto(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sign in to add photos.');
  const long = Math.max(asset.width || 0, asset.height || 0);
  const resize = long > PHOTO_SIDE ? (asset.width >= asset.height ? { width: PHOTO_SIDE } : { height: PHOTO_SIDE }) : null;
  let quality: number | null = 0.75;
  let bytes: ArrayBuffer | Blob | null = null;
  while (quality != null) {
    const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (resize) ctx.resize(resize);
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: ImageManipulator.SaveFormat.JPEG });
    bytes = await readPhotoBytes({ uri: saved.uri, mimeType: 'image/jpeg' });
    const next = nextQuality(quality, bytes instanceof Blob ? bytes.size : bytes.byteLength, PHOTO_MAX_BYTES);
    if (next === quality) break;
    quality = next;
  }
  if (!bytes || quality == null) throw new Error('That photo is too big. Try another one.');
  const path = spotPhotoPath(data.user.id, Crypto.randomUUID());
  const { error } = await supabase.storage.from(SPOT_PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? 'Photos for reviews arrive with the next update.' : error.message);
  return path;
}

/** Removes review photo files (best effort: they sit at unguessable paths anyway). */
export async function removeReviewPhotos(paths: string[]): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const mine = data.user ? paths.filter((p) => isOwnSpotPhoto(data.user!.id, p)) : [];
  if (mine.length) await supabase.storage.from(SPOT_PHOTO_BUCKET).remove(mine).catch(() => {});
}

/** Saves the rider's review of a place (one per place; saving again changes it). */
export async function saveSpotReview(spotId: string, d: ReviewDraft): Promise<void> {
  const { error } = await supabase.rpc('save_riding_spot_review', {
    p_spot: spotId, p_stars: d.stars, p_body: d.body.trim() || null, p_photos: d.photos.slice(0, REVIEW_MAX_PHOTOS),
  });
  if (error) {
    if (pageNotYet(error.message) || /save_riding_spot_review/i.test(error.message)) throw new Error('Reviews arrive with the next update.');
    throw new Error(error.message);
  }
  track('spot_reviewed', { stars: d.stars, photos: d.photos.length, words: d.body.trim() ? 1 : 0 });
}

/** Deletes the rider's review of a place and its photo files. */
export async function deleteSpotReview(spotId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_my_riding_spot_review', { p_spot: spotId });
  if (error) throw new Error(error.message);
  await removeReviewPhotos(Array.isArray(data) ? (data as string[]) : []);
}

/** Saves or unsaves a favorite place. Returns whether it is now a favorite. */
export async function setFavoriteSpot(spotId: string, on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_riding_spot_favorite', { p_spot: spotId, p_on: on });
  if (error) {
    if (/set_riding_spot_favorite|schema cache/i.test(error.message)) throw new Error('Favorite Places arrive with the next update.');
    throw new Error(error.message);
  }
  track(on ? 'spot_favorited' : 'spot_unfavorited');
  return data === true;
}

/** The rider's favorite places, newest saved first, with the distance from `at` when given. Empty signed out. */
export async function favoriteSpots(at: LatLng | null): Promise<Spot[]> {
  const { data, error } = await supabase.rpc('my_favorite_riding_spots', { p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
  if (error) {
    if (/my_favorite_riding_spots|schema cache/i.test(error.message)) return [];
    throw error;
  }
  // Keep the saved order (parseSpots sorts by distance).
  const parsed = parseSpots(data);
  const order = new Map((Array.isArray(data) ? data : []).map((r, i) => [String((r as { id?: unknown }).id), i]));
  return parsed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
