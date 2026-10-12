import { parseCoords, parsePlaces, placeSearchUrl, MIN_QUERY, type Place } from '@/core/places';
import type { LatLng } from '@/core/geo';

/**
 * Looks places up by name (see core/places.ts). Pass the AbortSignal of a search the rider has
 * since typed past, so only the newest answer lands.
 */
export async function searchPlaces(query: string, near: LatLng | null, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  const typed = parseCoords(q);
  if (typed) {
    return [{ id: `coords:${typed.lat},${typed.lng}`, name: `${typed.lat.toFixed(5)}, ${typed.lng.toFixed(5)}`, kind: 'Coordinates', where: '', ...typed, state: null, address: null }];
  }
  if (q.length < MIN_QUERY) return [];
  const res = await fetch(placeSearchUrl(q, near), { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(res.status === 429 ? 'Place search is busy. Try again in a moment.' : 'Place search is not answering right now.');
  return parsePlaces(await res.json());
}
