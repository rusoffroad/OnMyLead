import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { areaFromPlace } from '@/core/areas';
import { parseAreas, parseLeaderboard, parseSettings, type LeaderArea, type Leaderboard, type LeaderFilter, type LeaderSettings } from '@/core/leaderboard';
import { currentPosition } from './location';
import { supabase } from './supabase';

/** Null until the server has the leaderboard (migration 20261104050000_badge_leaderboard.sql). */
const notYet = (message: string) => /badge_leaderboard|leaderboard_settings|schema cache|does not exist/i.test(message);

export async function fetchLeaderboard(f: LeaderFilter, limit = 50): Promise<Leaderboard | null> {
  const { data, error } = await supabase.rpc('badge_leaderboard', { p_country: f.country, p_state: f.state, p_limit: limit });
  if (error) {
    if (notYet(error.message)) return null;
    throw error;
  }
  return parseLeaderboard(data);
}

export async function fetchLeaderAreas(): Promise<LeaderArea[]> {
  const { data, error } = await supabase.rpc('badge_leaderboard_areas');
  if (error) {
    if (notYet(error.message)) return [];
    throw error;
  }
  return parseAreas(data);
}

export async function fetchLeaderSettings(): Promise<LeaderSettings | null> {
  const { data, error } = await supabase.rpc('my_leaderboard_settings');
  if (error) {
    if (notYet(error.message)) return null;
    throw error;
  }
  return parseSettings(data);
}

/** Saves where the rider rides from (an empty country clears it). */
export async function saveLeaderArea(country: string | null, state: string | null): Promise<LeaderSettings> {
  const { data, error } = await supabase.rpc('set_leaderboard_settings', { p_country: country, p_state: state, p_shown: null, p_area: true });
  if (error) throw error;
  return parseSettings(data);
}

/** Show Me on the Leaderboard. */
export async function saveLeaderShown(shown: boolean): Promise<LeaderSettings> {
  const { data, error } = await supabase.rpc('set_leaderboard_settings', { p_country: null, p_state: null, p_shown: shown, p_area: false });
  if (error) throw error;
  return parseSettings(data);
}

/** The phone can look up its country and state (the website can't: no geocoder there). */
export const canDetectArea = Platform.OS !== 'web';

/**
 * The country and state the rider is in now, from one location fix and the phone's own geocoder.
 * Only the two codes come back; the position itself is never saved or sent to OnMyLead.
 */
export async function detectArea(): Promise<{ country: string; state: string | null } | null> {
  if (!canDetectArea) return null;
  const p = await currentPosition(Location.Accuracy.Low);
  const [place] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
  return areaFromPlace(place);
}
