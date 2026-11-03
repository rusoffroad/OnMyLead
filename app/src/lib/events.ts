import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import {
  EVENT_PHOTO_BUCKET, EVENT_PHOTO_QUALITY, eventPhotoPath, eventPhotoUrl, fitWithin, friendlyEventError,
  type EventCard, type EventDetail, type Rsvp,
} from '@/core/events';
import type { LatLng } from '@/core/geo';
import { track } from './analytics';
import { readPhotoBytes } from './photo-bytes';
import { supabase, supabaseUrl } from './supabase';

/**
 * Events: every read and write goes through the server's event functions
 * (migration 20261102950000_events.sql), which check who may do what.
 */

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyEventError(error.message));
  return data as T;
}

export const photoUrl = (path: string | null | undefined) => eventPhotoUrl(supabaseUrl, path);

export async function upcomingEvents(near?: LatLng | null, miles?: number | null): Promise<EventCard[]> {
  return (await call<EventCard[] | null>('events_list', {
    p_scope: 'upcoming', p_lat: near?.lat ?? null, p_lng: near?.lng ?? null, p_miles: near && miles ? miles : null,
  })) ?? [];
}

/** Events I host, co-host, or said Going or Interested to (including the last 30 days). */
export async function myEvents(): Promise<EventCard[]> {
  return (await call<EventCard[] | null>('events_list', { p_scope: 'mine' })) ?? [];
}

export async function getEvent(codeOrId: string): Promise<EventDetail> {
  return call<EventDetail>('event_detail', { p_code: codeOrId });
}

export async function saveEvent(id: string | null, payload: Record<string, unknown>): Promise<{ id: string; share_code: string }> {
  const r = await call<{ id: string; share_code: string }>('save_event', { p_id: id, p: payload });
  track(id ? 'event_edited' : 'event_created', { platform: Platform.OS });
  return r;
}

export async function setEventCancelled(id: string, cancelled: boolean) {
  await call('set_event_cancelled', { p_event: id, p_cancelled: cancelled });
}

/** Deletes the photo files first (the storage rules need the event to still exist), then the event. */
export async function deleteEvent(e: Pick<EventDetail, 'id' | 'photos'>) {
  const paths = e.photos.map((p) => p.path);
  if (paths.length) await supabase.storage.from(EVENT_PHOTO_BUCKET).remove(paths).catch(() => {});
  await call('delete_event', { p_event: e.id });
  track('event_deleted');
}

export async function rsvp(eventId: string, status: Rsvp | null) {
  await call('rsvp_event', { p_event: eventId, p_status: status });
  track('event_rsvp', { status: status ?? 'none' });
}

export async function addCohost(eventId: string, userId: string) {
  await call('add_event_host', { p_event: eventId, p_user: userId });
}
export async function removeCohost(eventId: string, userId: string) {
  await call('remove_event_host', { p_event: eventId, p_user: userId });
}

export async function saveAgendaItem(eventId: string, itemId: string | null, item: Record<string, unknown>) {
  return call<string>('save_event_agenda_item', { p_event: eventId, p_id: itemId, p: item });
}
export async function deleteAgendaItem(itemId: string) {
  await call('delete_event_agenda_item', { p_id: itemId });
}

export type LinkableRide = { ride_id: string; name: string; meet_at: string; visibility: string; meet_area_label: string | null };
export async function linkableRides(eventId: string): Promise<LinkableRide[]> {
  return (await call<LinkableRide[] | null>('event_linkable_rides', { p_event: eventId })) ?? [];
}
export async function linkRide(eventId: string, rideId: string, label?: string | null) {
  await call('link_event_ride', { p_event: eventId, p_ride: rideId, p_label: label ?? null });
  track('event_ride_linked');
}
export async function unlinkRide(eventId: string, rideId: string) {
  await call('unlink_event_ride', { p_event: eventId, p_ride: rideId });
}
/** 'manager' (they're on the ride), 'invited' (they get a ride invite and manage once they join) or 'cleared'. */
export async function setRideManager(eventId: string, rideId: string, userId: string | null): Promise<'manager' | 'invited' | 'cleared'> {
  return call('set_event_ride_manager', { p_event: eventId, p_ride: rideId, p_user: userId });
}

/** The event a ride belongs to, or null (also null on servers without events). */
export async function eventForRide(rideId: string): Promise<{ share_code: string; title: string; label: string | null } | null> {
  const { data, error } = await supabase.rpc('event_for_ride', { p_ride: rideId });
  if (error) return null;
  return (data as { share_code: string; title: string; label: string | null } | null) ?? null;
}

// ---- Photos ----

/** Picks photos from the library (several at once where the phone allows), or one from the camera. */
export async function pickEventPhotos(source: 'camera' | 'library', max: number): Promise<ImagePicker.ImagePickerAsset[]> {
  if (max <= 0) return [];
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('OnMyLead needs the camera to take a photo. Turn it on in Settings, or choose from your photos.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    return res.canceled ? [] : res.assets.slice(0, 1);
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: max, orderedSelection: true,
  });
  return res.canceled ? [] : res.assets.slice(0, max);
}

/** Shrinks a photo to at most 1600 px on its longest side, as a JPEG (about 150-400 KB). */
async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.height) ctx.resize(fitWithin(asset.width, asset.height));
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: EVENT_PHOTO_QUALITY, format: ImageManipulator.SaveFormat.JPEG });
  return saved.uri;
}

export async function uploadEventPhoto(eventId: string, asset: ImagePicker.ImagePickerAsset): Promise<void> {
  const uri = await shrink(asset);
  const path = eventPhotoPath(eventId, Crypto.randomUUID());
  const bucket = supabase.storage.from(EVENT_PHOTO_BUCKET);
  const { error: upErr } = await bucket.upload(path, await readPhotoBytes({ uri, mimeType: 'image/jpeg' }), {
    contentType: 'image/jpeg', upsert: false, cacheControl: '31536000',
  });
  if (upErr) throw new Error(friendlyEventError(upErr.message));
  try {
    await call('add_event_photo', { p_event: eventId, p_path: path });
  } catch (e) {
    await bucket.remove([path]);
    throw e;
  }
  track('event_photo_added');
}

export async function removeEventPhoto(photoId: string) {
  const path = await call<string>('remove_event_photo', { p_photo: photoId });
  if (path) await supabase.storage.from(EVENT_PHOTO_BUCKET).remove([path]).catch(() => {});
}

export async function makeCover(photoId: string) {
  await call('set_event_cover', { p_photo: photoId });
}

// ---- Admin ----

export type AdminEventRow = {
  id: string; share_code: string; title: string; starts_at: string; ends_at: string; location_name: string; state: string | null;
  visibility: string; status: string; hidden_at: string | null; hidden_reason: string | null; created_at: string;
  owner_id: string; owner_name: string | null; going: number; rides: number; photos: number; reports: number; open_reports: number;
};
export async function adminEvents(filter: 'all' | 'reported' | 'hidden' | 'upcoming', page = 0): Promise<{ rows: AdminEventRow[]; total: number }> {
  return call('admin_events', { p_filter: filter, p_page: page, p_page_size: 50 });
}
export async function adminSetEventHidden(eventId: string, hidden: boolean, reason: string) {
  await call('admin_set_event_hidden', { p_event: eventId, p_hidden: hidden, p_reason: reason });
}
export async function adminRemoveEventPhoto(photoId: string, reason: string) {
  const path = await call<string>('admin_remove_event_photo', { p_photo: photoId, p_reason: reason });
  if (path) await supabase.storage.from(EVENT_PHOTO_BUCKET).remove([path]).catch(() => {});
}
