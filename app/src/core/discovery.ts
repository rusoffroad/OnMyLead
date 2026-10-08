/**
 * Finding public rides: by distance from the rider, or by US state. Works on the rounded
 * meeting area (about a mile), never on an exact pin.
 */
import { distanceM, metersToMiles, type LatLng } from './geo';

export const RADIUS_CHOICES_MI = [25, 50, 100, 250] as const;

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export type UsState = Bounds & { code: string; name: string };

// Approximate bounding boxes (degrees). Used to centre the map, to narrow the database query,
// and as a last-resort guess of a ride's state when the phone cannot reverse-geocode.
const RAW: [string, string, number, number, number, number][] = [
  ['AL', 'Alabama', 30.14, 35.01, -88.47, -84.89],
  ['AK', 'Alaska', 51.21, 71.39, -179.15, -129.98],
  ['AZ', 'Arizona', 31.33, 37.0, -114.82, -109.04],
  ['AR', 'Arkansas', 33.0, 36.5, -94.62, -89.64],
  ['CA', 'California', 32.53, 42.01, -124.41, -114.13],
  ['CO', 'Colorado', 36.99, 41.0, -109.06, -102.04],
  ['CT', 'Connecticut', 40.98, 42.05, -73.73, -71.79],
  ['DE', 'Delaware', 38.45, 39.84, -75.79, -75.05],
  ['DC', 'District of Columbia', 38.79, 39.0, -77.12, -76.91],
  ['FL', 'Florida', 24.4, 31.0, -87.63, -80.03],
  ['GA', 'Georgia', 30.36, 35.0, -85.61, -80.84],
  ['HI', 'Hawaii', 18.91, 22.24, -160.25, -154.81],
  ['ID', 'Idaho', 41.99, 49.0, -117.24, -111.04],
  ['IL', 'Illinois', 36.97, 42.51, -91.51, -87.49],
  ['IN', 'Indiana', 37.77, 41.76, -88.1, -84.78],
  ['IA', 'Iowa', 40.38, 43.5, -96.64, -90.14],
  ['KS', 'Kansas', 36.99, 40.0, -102.05, -94.59],
  ['KY', 'Kentucky', 36.5, 39.15, -89.57, -81.96],
  ['LA', 'Louisiana', 28.93, 33.02, -94.04, -88.82],
  ['ME', 'Maine', 43.06, 47.46, -71.08, -66.95],
  ['MD', 'Maryland', 37.91, 39.72, -79.49, -75.05],
  ['MA', 'Massachusetts', 41.24, 42.89, -73.51, -69.93],
  ['MI', 'Michigan', 41.7, 48.31, -90.42, -82.41],
  ['MN', 'Minnesota', 43.5, 49.38, -97.24, -89.49],
  ['MS', 'Mississippi', 30.17, 35.0, -91.66, -88.1],
  ['MO', 'Missouri', 35.99, 40.61, -95.77, -89.1],
  ['MT', 'Montana', 44.36, 49.0, -116.05, -104.04],
  ['NE', 'Nebraska', 40.0, 43.0, -104.05, -95.31],
  ['NV', 'Nevada', 35.0, 42.0, -120.01, -114.04],
  ['NH', 'New Hampshire', 42.7, 45.31, -72.56, -70.61],
  ['NJ', 'New Jersey', 38.93, 41.36, -75.56, -73.89],
  ['NM', 'New Mexico', 31.33, 37.0, -109.05, -103.0],
  ['NY', 'New York', 40.5, 45.02, -79.76, -71.86],
  ['NC', 'North Carolina', 33.84, 36.59, -84.32, -75.46],
  ['ND', 'North Dakota', 45.94, 49.0, -104.05, -96.55],
  ['OH', 'Ohio', 38.4, 41.98, -84.82, -80.52],
  ['OK', 'Oklahoma', 33.62, 37.0, -103.0, -94.43],
  ['OR', 'Oregon', 41.99, 46.29, -124.57, -116.46],
  ['PA', 'Pennsylvania', 39.72, 42.27, -80.52, -74.69],
  ['RI', 'Rhode Island', 41.15, 42.02, -71.86, -71.12],
  ['SC', 'South Carolina', 32.03, 35.22, -83.35, -78.54],
  ['SD', 'South Dakota', 42.48, 45.95, -104.06, -96.44],
  ['TN', 'Tennessee', 34.98, 36.68, -90.31, -81.65],
  ['TX', 'Texas', 25.84, 36.5, -106.65, -93.51],
  ['UT', 'Utah', 37.0, 42.0, -114.05, -109.04],
  ['VT', 'Vermont', 42.73, 45.02, -73.44, -71.46],
  ['VA', 'Virginia', 36.54, 39.47, -83.68, -75.24],
  ['WA', 'Washington', 45.54, 49.0, -124.85, -116.92],
  ['WV', 'West Virginia', 37.2, 40.64, -82.64, -77.72],
  ['WI', 'Wisconsin', 42.49, 47.31, -92.89, -86.25],
  ['WY', 'Wyoming', 40.99, 45.01, -111.06, -104.05],
];

export const US_STATES: UsState[] = RAW.map(([code, name, minLat, maxLat, minLng, maxLng]) => ({
  code, name, minLat, maxLat, minLng, maxLng,
}));

const byCode = new Map(US_STATES.map((s) => [s.code, s]));
const byName = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s]));

export const stateByCode = (code: string | null | undefined) => (code ? byCode.get(code.toUpperCase()) : undefined);

/** "UT", "Utah" or "utah" (what iOS and Android reverse geocoding return) to "UT". */
export function normalizeState(region: string | null | undefined): string | null {
  if (!region) return null;
  const r = region.trim();
  return byCode.get(r.toUpperCase())?.code ?? byName.get(r.toLowerCase())?.code ?? null;
}

const contains = (b: Bounds, p: LatLng) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
const area = (b: Bounds) => (b.maxLat - b.minLat) * (b.maxLng - b.minLng);

/**
 * Best guess of the state a point is in, from bounding boxes: the smallest box that holds it.
 * Right away from borders, can be wrong near them, so the organizer can correct it.
 */
export function guessState(p: LatLng): string | null {
  let best: UsState | null = null;
  for (const s of US_STATES) if (contains(s, p) && (!best || area(s) < area(best))) best = s;
  return best?.code ?? null;
}

/** Box around a centre that contains every point within `miles` of it. */
export function boundsAround(c: LatLng, miles: number): Bounds {
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.max(0.05, Math.cos((c.lat * Math.PI) / 180)));
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng };
}

type Located = { meet_area_lat: number; meet_area_lng: number };

/** Rides within `miles`, nearest first, with their distance in miles. */
export function withinRadius<T extends Located>(rides: T[], c: LatLng, miles: number): (T & { distanceMi: number })[] {
  return rides
    .map((r) => ({ ...r, distanceMi: metersToMiles(distanceM(c, { lat: r.meet_area_lat, lng: r.meet_area_lng })) }))
    .filter((r) => r.distanceMi <= miles)
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

/** Rides in a state. Rides saved before the state was recorded fall back to a location guess. */
export function inState<T extends Located & { meet_state?: string | null }>(rides: T[], code: string): T[] {
  return rides.filter((r) => (r.meet_state ? r.meet_state === code : guessState({ lat: r.meet_area_lat, lng: r.meet_area_lng }) === code));
}

/** Map region (react-native-maps shape) that shows a whole state. */
export function regionFor(b: Bounds) {
  return {
    latitude: (b.minLat + b.maxLat) / 2,
    longitude: (b.minLng + b.maxLng) / 2,
    latitudeDelta: (b.maxLat - b.minLat) * 1.15,
    longitudeDelta: (b.maxLng - b.minLng) * 1.15,
  };
}

/** "Join my private ride ..." text used for the share sheet, text messages and email. */
export function inviteMessage(ride: { name: string; invite_code: string; visibility: string }, link: string | null) {
  const what = ride.visibility === 'private' ? 'my private ride' : 'my ride';
  return [`Join ${what} "${ride.name}" on OnMyLead.`, link ? `Open: ${link}` : null, `Invite code: ${ride.invite_code}`]
    .filter(Boolean)
    .join('\n');
}

/** sms: link with a prefilled body. iOS wants "&body=", everyone else "?body=". */
export function smsUrl(body: string, platform: string) {
  return `sms:${platform === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

export function mailUrl(subject: string, body: string) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
