import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LatLng } from '@/core/geo';
import { parseSavedMiles, parseSpotDetail, parseSpots, type Spot, type SpotDetail, type SpotKind, type SpotSuggestion } from '@/core/spots';
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
