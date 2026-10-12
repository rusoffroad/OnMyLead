/**
 * Handing a ride over to Apple Maps or Google Maps for turn-by-turn directions on the road: to the
 * meeting point, a waypoint, a rider, the destination, or along the leader's route. Both apps take
 * a plain web link (no key, no account, nothing paid), and on a phone with the app installed the
 * link opens the app itself. Nothing about the rider is sent, only where they want to go.
 */
import { cumulativeM } from './route';
import type { LatLng } from './geo';

export type MapsApp = 'apple' | 'google';
/** What the rider picked in Profile: always the same app, or ask each time. */
export type MapsPreference = MapsApp | 'ask';

export const MAPS_APP_LABEL: Record<MapsApp, string> = { apple: 'Apple Maps', google: 'Google Maps' };

/** Google Maps takes at most 9 stops between the start and the destination; Apple takes more. */
export const MAX_VIA = 8;

export type DirectionsTarget = {
  /** Shown on the chooser: "Meeting Point", "Fuel Stop". */
  title: string;
  /** A spot, or an address or place name the maps app looks up ("Hell's Revenge, Moab, UT"). */
  to: LatLng | string;
  /** Stops to pass on the way, in order. */
  via?: LatLng[];
};

const coord = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const place = (to: LatLng | string) => (typeof to === 'string' ? to.trim() : coord(to));

/** Apple Maps' directions link (iOS 18.4 and later, and maps.apple.com on the web). Driving. */
export function appleMapsUrl(t: DirectionsTarget): string {
  const p = [`destination=${encodeURIComponent(place(t.to))}`];
  for (const v of (t.via ?? []).slice(0, MAX_VIA)) p.push(`waypoint=${encodeURIComponent(coord(v))}`);
  p.push('mode=driving');
  return `https://maps.apple.com/directions?${p.join('&')}`;
}

/** Google Maps' directions link, which opens the Google Maps app when it is installed. Driving. */
export function googleMapsUrl(t: DirectionsTarget): string {
  const p = ['api=1', `destination=${encodeURIComponent(place(t.to))}`, 'travelmode=driving'];
  const via = (t.via ?? []).slice(0, MAX_VIA);
  if (via.length) p.push(`waypoints=${encodeURIComponent(via.map(coord).join('|'))}`);
  return `https://www.google.com/maps/dir/?${p.join('&')}`;
}

export const mapsUrl = (app: MapsApp, t: DirectionsTarget) => (app === 'apple' ? appleMapsUrl(t) : googleMapsUrl(t));

/** Apple Maps only exists on Apple devices; the web can open either site. */
export const mapsAppsFor = (os: string): MapsApp[] => (os === 'android' ? ['google'] : ['apple', 'google']);

/** Which app opens right away, or null to ask. A saved app the device can't open means ask. */
export function pickedApp(pref: MapsPreference, os: string): MapsApp | null {
  const apps = mapsAppsFor(os);
  if (apps.length === 1) return apps[0];
  return pref !== 'ask' && apps.includes(pref) ? pref : null;
}

/**
 * The leader's route as stops a maps app can follow: the destination is the route's end, and up to
 * MAX_VIA stops along the way keep the directions on the same roads. A short drawn route uses the
 * leader's own points (the turns they picked); a longer line is sampled evenly by distance. With
 * `fromM` (how far along the rider already is), stops behind them are left out.
 */
export function routeDirections(route: { points: LatLng[] }, title: string, fromM?: number | null): DirectionsTarget | null {
  const line = route.points;
  if (line.length < 2) return null;
  const cum = cumulativeM(line);
  const total = cum[cum.length - 1];
  const start = Math.max(0, Math.min(fromM ?? 0, total));
  // Already at the end: just the end.
  if (total - start < 1) return { title, to: line[line.length - 1], via: [] };

  let idx: number[];
  if (start === 0 && line.length <= MAX_VIA + 1) {
    idx = line.map((_, i) => i);
  } else {
    idx = [];
    let i = 0;
    for (let k = start > 0 ? 1 : 0; k <= MAX_VIA; k++) {
      const want = start + ((total - start) * k) / MAX_VIA;
      while (i < cum.length - 1 && cum[i] < want) i++;
      if (idx[idx.length - 1] !== i) idx.push(i);
    }
  }
  if (idx[idx.length - 1] !== line.length - 1) idx.push(line.length - 1);
  const stops = idx.map((i) => line[i]);
  return { title, to: stops[stops.length - 1], via: stops.slice(0, -1).slice(-MAX_VIA) };
}

export type DirectionsRow = { key: string; title: string; detail: string; target: DirectionsTarget };

/**
 * The places on a ride worth handing to a maps app, in the order a rider needs them: the regroup
 * point (Ride Mode), the meeting point, along the route (from where the rider is, in Ride Mode),
 * and the destination. The meeting point only exists for riders on the ride; the public page never
 * gets its exact spot.
 */
export function rideDirections(opts: {
  meet?: { lat: number; lng: number; label: string | null } | null;
  destination?: string | null;
  route?: { points: LatLng[] } | null;
  /** How far along the route this rider is, so directions pick up from there. */
  alongM?: number | null;
  regroup?: LatLng | null;
}): DirectionsRow[] {
  const rows: DirectionsRow[] = [];
  if (opts.regroup) rows.push({ key: 'regroup', title: 'Regroup Point', detail: 'Where the leader asked everyone to meet up', target: { title: 'the Regroup Point', to: opts.regroup } });
  const m = opts.meet;
  if (m) rows.push({ key: 'meet', title: 'Meeting Point', detail: m.label?.trim() || `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`, target: { title: 'the Meeting Point', to: m } });
  const partway = (opts.alongM ?? 0) > 50;
  const r = opts.route ? routeDirections(opts.route, 'the End of the Route', partway ? opts.alongM : null) : null;
  if (r) {
    rows.push({
      key: 'route',
      title: partway ? 'Continue Along the Route' : 'Along the Route',
      detail: r.via?.length ? `Through ${r.via.length} ${r.via.length === 1 ? 'stop' : 'stops'} on the route, on roads where Maps has them` : 'To the end of the route',
      target: r,
    });
  }
  const d = opts.destination?.trim();
  if (d) rows.push({ key: 'destination', title: 'Destination', detail: d, target: { title: d, to: d } });
  return rows;
}
