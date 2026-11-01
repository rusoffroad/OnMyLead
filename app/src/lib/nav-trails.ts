/**
 * Navigation Mode trails: the rider's own trails kept on this phone, the trails other riders
 * shared, and the calls that share, rate and update them (migration 20261101600000_nav_trails.sql).
 *
 * Phone trails are in AsyncStorage (one key, a few hundred KB for a busy season), so they work with
 * no signal and never leave the phone unless the rider taps Share with Everyone. Their photos are
 * copied into the app's documents folder (lib/trail-photo-files) so they outlive the picker's cache.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { LatLng } from '@/core/geo';
import {
  lineForSharing, parsePublicTrail, parsePublicTrails, shareStateOf, syncShareStates, toLineString, toLatLngs, trackStats,
  type LocalTrail, type PublicTrail, type TrackPoint,
} from '@/core/nav-trails';
import { lineLengthM } from '@/core/route';
import { track } from './analytics';
import { keepPhoto, dropPhoto } from './trail-photo-files';
import { readPhotoBytes } from './photo-bytes';
import { supabase } from './supabase';

const KEY = 'nav.trails.v1';
/** A recording in progress, saved as it grows so a crash or a dead battery keeps the trail. */
const RECORDING_KEY = 'nav.recording.v1';
export const TRAIL_PHOTO_BUCKET = 'trail-photos';

let trails: LocalTrail[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let loading: Promise<void> | null = null;

/** Read the phone's trails once. Safe to call often. */
export function loadTrails(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const list = raw ? (JSON.parse(raw) as LocalTrail[]) : [];
      trails = Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.points)) : [];
    })
    .catch(() => {
      trails = [];
    })
    .finally(() => {
      loaded = true;
      publish();
    });
  return loading;
}

async function persist(next: LocalTrail[]) {
  trails = next;
  publish();
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

type Snapshot = { trails: LocalTrail[]; loaded: boolean };
let snap: Snapshot = { trails, loaded };
const getSnapshot = () => (snap.trails === trails && snap.loaded === loaded ? snap : (snap = { trails, loaded }));

/** The trails on this phone, newest first. */
export function useLocalTrails(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const getLocalTrail = (id: string) => trails.find((t) => t.id === id) ?? null;

/** Add or replace one trail on the phone. */
export async function saveLocalTrail(t: LocalTrail): Promise<LocalTrail> {
  await loadTrails();
  const next = { ...t, updatedAt: new Date().toISOString() };
  await persist([next, ...trails.filter((x) => x.id !== t.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  return next;
}

/** Delete a trail from the phone (and its public copy, if it was shared). */
export async function deleteLocalTrail(id: string): Promise<void> {
  await loadTrails();
  const t = getLocalTrail(id);
  if (!t) return;
  if (t.shared) await stopSharing(t);
  for (const p of t.photos) dropPhoto(p);
  await persist(trails.filter((x) => x.id !== id));
}

/** Copy a picked photo next to the trail so it stays after the picker's cache is cleared. */
export async function addLocalPhoto(t: LocalTrail, picked: { uri: string; mimeType?: string | null }): Promise<LocalTrail> {
  const uri = await keepPhoto(picked, t.id);
  return saveLocalTrail({ ...t, photos: [...t.photos, uri] });
}

export async function removeLocalPhoto(t: LocalTrail, uri: string): Promise<LocalTrail> {
  if (!uri.startsWith('https://')) dropPhoto(uri);
  return saveLocalTrail({ ...t, photos: t.photos.filter((p) => p !== uri) });
}

// --- Recording in progress ------------------------------------------------------

export type Recording = { startedAt: number; points: TrackPoint[]; paused: boolean };

export async function readRecording(): Promise<Recording | null> {
  try {
    const raw = await AsyncStorage.getItem(RECORDING_KEY);
    const r = raw ? (JSON.parse(raw) as Recording) : null;
    return r && Array.isArray(r.points) ? r : null;
  } catch {
    return null;
  }
}

export const writeRecording = (r: Recording | null) =>
  (r ? AsyncStorage.setItem(RECORDING_KEY, JSON.stringify(r)) : AsyncStorage.removeItem(RECORDING_KEY)).catch(() => {});

// --- Sharing with everyone -------------------------------------------------------

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sign in to share trails.');
  return data.user.id;
}

const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/** Upload phone photos (file URIs) to the trail-photos bucket; https ones are already there. */
async function uploadPhotos(me: string, t: LocalTrail): Promise<string[]> {
  const bucket = supabase.storage.from(TRAIL_PHOTO_BUCKET);
  const out: string[] = [];
  for (const [i, p] of t.photos.slice(0, 6).entries()) {
    if (p.startsWith('https://')) {
      out.push(p);
      continue;
    }
    const ext = /\.png$/i.test(p) ? 'png' : 'jpg';
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const path = `${me}/${t.id}-${Date.now()}-${i}.${PHOTO_EXT[contentType]}`;
    const { error } = await bucket.upload(path, await readPhotoBytes({ uri: p, mimeType: contentType }), { contentType, upsert: false });
    if (error) throw new Error(error.message);
    out.push(bucket.getPublicUrl(path).data.publicUrl);
  }
  return out;
}

/**
 * Share a phone trail with everyone (or update its public copy). The line that goes up has its
 * ends trimmed (core/nav-trails lineForSharing). The phone copy keeps the full line and its photos.
 */
export async function shareTrail(t: LocalTrail): Promise<LocalTrail> {
  const me = await uid();
  const line = lineForSharing(t.points);
  if (!line.length) throw new Error('This trail is too short to share.');
  const stats = trackStats(t.points);
  const photos = await uploadPhotos(me, t);
  const row = {
    owner_id: me,
    client_id: t.id,
    name: t.details.name.trim(),
    description: t.details.description.trim() || null,
    difficulty: t.details.difficulty,
    vehicles: t.details.vehicles,
    surface: t.details.surface,
    season: t.details.season,
    max_width_in: t.details.maxWidthIn,
    one_way: t.details.oneWay,
    route: toLineString(line),
    length_m: Math.round(lineLengthM(line)),
    elevation_gain_m: stats.gainM,
    high_point_m: stats.highM,
    photos,
  };
  const { data, error } = await supabase.from('shared_trails').upsert(row, { onConflict: 'owner_id,client_id' }).select('id').single();
  if (error) throw new Error(error.message);
  const detail = await getPublicTrail((data as { id: string }).id);
  track(t.shared ? 'trail_share_updated' : 'trail_shared', { difficulty: t.details.difficulty, vehicles: t.details.vehicles.length });
  return saveLocalTrail({ ...t, photos, shared: detail ? shareStateOf(detail) : t.shared });
}

/** Take the public copy down. The trail stays on the phone. */
export async function stopSharing(t: LocalTrail): Promise<LocalTrail> {
  if (t.shared) {
    const { error } = await supabase.from('shared_trails').delete().eq('id', t.shared.id);
    if (error) throw new Error(error.message);
  }
  const next = { ...t, shared: null };
  if (getLocalTrail(t.id)) return saveLocalTrail(next);
  return next;
}

/** The mapper saw the "hidden" notice: don't show it again. */
export async function markHiddenSeen(t: LocalTrail): Promise<void> {
  if (!t.shared) return;
  await supabase.from('shared_trails').update({ hidden_seen_at: new Date().toISOString() }).eq('id', t.shared.id);
  await saveLocalTrail({ ...t, shared: { ...t.shared, hiddenSeen: true } });
}

/** Refresh each phone trail's public status (public, hidden after ratings, removed). */
export async function syncMyTrails(): Promise<void> {
  await loadTrails();
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return;
  const { data, error } = await supabase.rpc('my_shared_trails');
  if (error) return;
  const next = syncShareStates(trails, parsePublicTrails(data));
  if (next.some((t, i) => t !== trails[i])) await persist(next);
}

// --- Other riders' trails ---------------------------------------------------------

export type Box = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export async function publicTrailsIn(box: Box): Promise<PublicTrail[]> {
  const { data, error } = await supabase.rpc('trails_in_area', {
    p_min_lat: box.minLat, p_min_lng: box.minLng, p_max_lat: box.maxLat, p_max_lng: box.maxLng,
  });
  if (error) throw new Error(error.message);
  return parsePublicTrails(data);
}

export async function getPublicTrail(id: string): Promise<PublicTrail | null> {
  const { data, error } = await supabase.rpc('trail_detail', { p_trail: id });
  if (error) throw new Error(error.message);
  return parsePublicTrail(data);
}

/** Rate how accurate a trail is (1-5) and, if they like, how good a ride it is (1-5). */
export async function rateTrail(id: string, accuracy: number | null, quality: number | null, note: string | null) {
  const { data, error } = await supabase.rpc('rate_trail', { p_trail: id, p_score: accuracy, p_note: note, p_quality: quality });
  if (error) throw new Error(error.message);
  track('trail_rated', { accuracy, quality });
  return data as { status: string; rating_count: number; average: number | null };
}

/** Keep someone's public trail on this phone, to follow it offline or use it for a ride. */
export async function savePublicTrail(t: PublicTrail): Promise<LocalTrail> {
  await loadTrails();
  const existing = trails.find((x) => x.savedFrom?.id === t.id);
  const now = new Date().toISOString();
  const base = t.points.map((p, i): TrackPoint => [p.lat, p.lng, null, i]);
  return saveLocalTrail({
    id: existing?.id ?? `s${t.id.replace(/-/g, '').slice(0, 16)}`,
    details: {
      name: t.name, description: t.description ?? '', difficulty: t.difficulty, vehicles: t.vehicles, surface: t.surface,
      season: t.season, maxWidthIn: t.maxWidthIn, oneWay: t.oneWay,
    },
    points: base,
    source: 'saved',
    photos: t.photos,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    shared: null,
    savedFrom: { id: t.id, mapper: t.mapper },
  });
}

/** Points of any phone trail as plain coordinates. */
export const trailLine = (t: LocalTrail): LatLng[] => toLatLngs(t.points);
