export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
export const METERS_PER_MILE = 1609.344;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in meters. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees, 0 = north, clockwise. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export const metersToMiles = (m: number) => m / METERS_PER_MILE;
export const milesToMeters = (mi: number) => mi * METERS_PER_MILE;

/** Round a point to roughly a one-mile grid so public ride pages never expose an exact pin. */
export function fuzzLocation(p: LatLng, gridMiles = 1): LatLng {
  const latStep = gridMiles / 69;
  const lngStep = gridMiles / (69 * Math.max(0.1, Math.cos(toRad(p.lat))));
  return {
    lat: Math.round(p.lat / latStep) * latStep,
    lng: Math.round(p.lng / lngStep) * lngStep,
  };
}

/** "1.7 miles" / "0.3 miles" / "450 feet" for alert copy. */
export function formatDistance(m: number): string {
  const mi = metersToMiles(m);
  if (mi < 0.2) return `${Math.round(m * 3.28084 / 10) * 10} feet`;
  return `${mi.toFixed(1)} miles`;
}
