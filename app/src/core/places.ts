import { normalizeState } from './discovery';
import { distanceM, type LatLng } from './geo';

/**
 * Finding a place by name ("Hidden Falls Adventure Park", "Hell's Revenge Trailhead") or by street
 * address ("501 Congress Ave, Austin") for a meeting point, a destination or a ride search. The names come from OpenStreetMap through Photon, a free search
 * service with no key and no account. Only the typed words and a rough map centre are sent,
 * never who is asking.
 */

export const PHOTON_URL = 'https://photon.komoot.io/api/';
/** OpenStreetMap's licence asks every app that shows its data to say so. */
export const PLACES_CREDIT = 'Places from OpenStreetMap';
/** Shorter than this and a name search is mostly noise. */
export const MIN_QUERY = 3;

export type Place = {
  id: string;
  name: string;
  /** What it is, in a word or two: "Trailhead", "Off-Road Park", "Town". */
  kind: string;
  /** Where it is: "Burnet, Texas". */
  where: string;
  lat: number;
  lng: number;
  /** Two-letter US state, when it is in one. */
  state: string | null;
  /** The street address, when OpenStreetMap has one: "501 Congress Avenue". */
  address: string | null;
  /** How far a park, forest or town reaches, when OpenStreetMap knows: frames the whole area on a map. */
  bounds?: Bounds | null;
};

export type Bounds = { north: number; south: number; east: number; west: number };

/** "38.5733, -109.5498" typed into the search box is a place too. */
export function parseCoords(q: string): LatLng | null {
  const m = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** The search address: US places only, ranked toward `near` (the rider or the map) when known. */
export function placeSearchUrl(query: string, near?: LatLng | null, limit = 8): string {
  const p = [`q=${encodeURIComponent(query.trim())}`, `limit=${limit}`, 'lang=en', 'countrycode=US'];
  // Rounded so the search service learns a region, not where the rider is standing.
  if (near) p.push(`lat=${near.lat.toFixed(1)}`, `lon=${near.lng.toFixed(1)}`, 'location_bias_scale=0.3');
  return `${PHOTON_URL}?${p.join('&')}`;
}

/** OpenStreetMap tags (key/value) as words a rider uses. */
const KINDS: Record<string, string> = {
  'highway/trailhead': 'Trailhead',
  'highway/track': 'Trail',
  'highway/path': 'Trail',
  'highway/bridleway': 'Trail',
  'route/hiking': 'Trail',
  'leisure/park': 'Park',
  'leisure/nature_reserve': 'Nature Area',
  'leisure/track': 'Off-Road Park',
  'leisure/sports_centre': 'Off-Road Park',
  'sport/motocross': 'Off-Road Park',
  'boundary/protected_area': 'Public Land',
  'boundary/national_park': 'National Park',
  'tourism/camp_site': 'Campground',
  'tourism/caravan_site': 'Campground',
  'tourism/picnic_site': 'Picnic Area',
  'tourism/attraction': 'Attraction',
  'tourism/viewpoint': 'Viewpoint',
  'tourism/hotel': 'Hotel',
  'tourism/motel': 'Motel',
  'amenity/parking': 'Parking',
  'amenity/fuel': 'Gas Station',
  'amenity/restaurant': 'Restaurant',
  'amenity/fast_food': 'Restaurant',
  'amenity/cafe': 'Cafe',
  'shop/convenience': 'Store',
  'shop/motorcycle': 'Powersports Shop',
  'information/guidepost': 'Trailhead',
  'tourism/information': 'Info Point',
  'natural/peak': 'Peak',
  'waterway/waterfall': 'Waterfall',
  'natural/water': 'Lake',
  'water/lake': 'Lake',
  'water/reservoir': 'Reservoir',
  'place/city': 'City',
  'place/town': 'Town',
  'place/village': 'Town',
  'place/hamlet': 'Town',
  'place/locality': 'Area',
};

const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function kindOf(key?: string, value?: string): string {
  if (!key) return 'Place';
  return KINDS[`${key}/${value}`] ?? (key === 'highway' ? 'Road' : key === 'place' ? 'Area' : title(value && value !== 'yes' ? value : key));
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    countrycode?: string;
    /** [west, north, east, south] for places that are an area, not a point. */
    extent?: [number, number, number, number];
  };
};

/** Photon's extent as map bounds; anything malformed or flat is ignored. */
function boundsOf(e: unknown): Bounds | null {
  if (!Array.isArray(e) || e.length !== 4 || !e.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [west, north, east, south] = e as number[];
  return north > south && east > west ? { north, south, east, west } : null;
}

/** A Photon answer as places: named ones only, the same place listed once. */
export function parsePlaces(json: unknown): Place[] {
  const features = ((json as { features?: PhotonFeature[] })?.features ?? []) as PhotonFeature[];
  const out: Place[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const address = p.street && p.housenumber ? `${p.housenumber.trim()} ${p.street.trim()}` : null;
    const named = p.name?.trim();
    const name = named || address || p.street?.trim() || '';
    if (!name) continue;
    const [lng, lat] = c;
    // A house number with no name of its own is a street address, whatever building it is.
    const kind = !named && address ? 'Address' : kindOf(p.osm_key, p.osm_value);
    const town = p.city ?? p.district ?? (p.county ? p.county.replace(/ County$/, '') + ' County' : undefined);
    const where = [town && town !== name ? town : null, p.state && p.state !== name ? p.state : null].filter(Boolean).join(', ');
    const place: Place = {
      id: `${p.osm_type ?? 'X'}${p.osm_id ?? `${lat},${lng}`}`,
      name,
      kind,
      where,
      lat,
      lng,
      state: normalizeState(p.state),
      address: named ? address : null,
      bounds: boundsOf(p.extent),
    };
    // OpenStreetMap often draws one trail or parking lot as several pieces with the same name.
    const twin = out.find((o) => o.name.toLowerCase() === name.toLowerCase() && o.kind === kind && distanceM(o, place) < 8000);
    if (!twin) out.push(place);
  }
  return out;
}

/** One line under the name: "Trailhead in Moab, Utah", "Restaurant at 501 Congress Avenue, Austin". */
export function placeDetail(p: Place): string {
  if (p.address) return [`${p.kind} at ${p.address}`, p.where.split(', ')[0] || null].filter(Boolean).join(', ');
  if (p.kind === 'Address') return p.where ? `Street Address in ${p.where}` : 'Street Address';
  return p.where ? `${p.kind} in ${p.where}` : p.kind;
}

/** The meeting point's place name when a search result is picked: "Hidden Falls Adventure Park, Burnet, TX". */
export function placeLabel(p: Place): string {
  const town = p.where.split(', ')[0];
  return [p.name, p.address, town && !/County$/.test(town) && town !== p.where ? town : null, p.state].filter(Boolean).join(', ');
}
