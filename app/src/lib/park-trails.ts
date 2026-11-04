import AsyncStorage from '@react-native-async-storage/async-storage';

import { PARK_TRAILS_MAX_LINES, parseParkSummaries, parseParkTrails, type ParkSummary, type ParkTrail } from '@/core/park-trails';
import { encodePolyline } from '@/core/polyline';
import { supabase } from '@/lib/supabase';

import type { Box } from './nav-trails';

/**
 * Park trails from the server (park_trails_in_area, park_trail_parks: migration
 * 20261104180000_park_trails.sql), open to everyone, signed in or not. Each park's lines are kept
 * on the phone once seen, so a park you looked at draws again with no signal; the park list is
 * kept too, so the park names show from far out at once.
 */

const PARKS_KEY = 'park-trails.parks.v1';
const PARK_KEY = (osmId: number) => `park-trails.park.${osmId}.v1`;

export async function parkTrailsIn(box: Box): Promise<ParkTrail[]> {
  const { data, error } = await supabase.rpc('park_trails_in_area', {
    p_min_lat: box.minLat, p_min_lng: box.minLng, p_max_lat: box.maxLat, p_max_lng: box.maxLng,
    // As many lines as the map draws, so a big park isn't cut short at the server's default.
    p_limit: PARK_TRAILS_MAX_LINES,
  });
  if (error) throw new Error(error.message);
  const trails = parseParkTrails(data);
  rememberParks(trails, box).catch(() => {});
  return trails;
}

/**
 * Keeps each park whose every line was inside the box (a partial view would be saved short). An
 * answer cut at the server's line limit may be missing some park's lines, so none is kept then.
 */
async function rememberParks(trails: ParkTrail[], box: Box) {
  if (trails.length >= PARK_TRAILS_MAX_LINES) return;
  const byPark = new Map<number, ParkTrail[]>();
  for (const t of trails) byPark.set(t.parkOsmId, [...(byPark.get(t.parkOsmId) ?? []), t]);
  const parks = await loadParks();
  for (const [id, lines] of byPark) {
    const p = parks.find((x) => x.parkOsmId === id);
    const whole = p ? p.box.minLat >= box.minLat && p.box.maxLat <= box.maxLat && p.box.minLng >= box.minLng && p.box.maxLng <= box.maxLng : false;
    if (whole) await AsyncStorage.setItem(PARK_KEY(id), JSON.stringify(lines.map(raw)));
  }
}

/** The stored shape is the server row, so parse reads both the same way. */
const raw = (t: ParkTrail) => ({
  id: t.id, park_osm_id: t.parkOsmId, park_name: t.parkName, park_state: t.parkState, park_website: t.parkWebsite,
  name: t.name, level: t.level, kind: t.kind, closed: t.closed, oneway: t.oneway, surface: t.surface,
  route_enc: encodeBack(t), length_m: t.lengthM, attribution: t.attribution, box: [t.box.minLat, t.box.minLng, t.box.maxLat, t.box.maxLng],
});

const encodeBack = (t: ParkTrail) => encodePolyline(t.points);

/** Park lines saved on the phone for the parks crossing the box (no signal). */
export async function savedParkTrailsIn(box: Box): Promise<ParkTrail[]> {
  const parks = await loadParks();
  const out: ParkTrail[] = [];
  for (const p of parks) {
    if (p.box.maxLat < box.minLat || p.box.minLat > box.maxLat || p.box.maxLng < box.minLng || p.box.minLng > box.maxLng) continue;
    try {
      const v = await AsyncStorage.getItem(PARK_KEY(p.parkOsmId));
      if (v) out.push(...parseParkTrails(JSON.parse(v)));
    } catch {
      // A saved park that can't be read is skipped.
    }
  }
  return out;
}

let parksCache: ParkSummary[] | null = null;

async function loadParks(): Promise<ParkSummary[]> {
  if (parksCache) return parksCache;
  try {
    const v = await AsyncStorage.getItem(PARKS_KEY);
    if (v) parksCache = parseParkSummaries(JSON.parse(v));
  } catch {
    // Nothing saved yet.
  }
  return parksCache ?? [];
}

/** Every park with trails: from the phone first, then the server (saved for next time). */
export async function parkList(refresh = true): Promise<ParkSummary[]> {
  const saved = await loadParks();
  if (!refresh) return saved;
  try {
    const { data, error } = await supabase.rpc('park_trail_parks');
    if (error) throw new Error(error.message);
    const parks = parseParkSummaries(data);
    if (parks.length || !saved.length) {
      parksCache = parks;
      await AsyncStorage.setItem(PARKS_KEY, JSON.stringify((data as unknown[]) ?? []));
    }
    return parksCache ?? saved;
  } catch {
    return saved;
  }
}
