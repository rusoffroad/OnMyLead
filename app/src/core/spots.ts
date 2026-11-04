/**
 * Scout: places to ride near the rider (Find > Places to Ride). Off-road parks, OHV areas, trail
 * systems, trailheads and motocross tracks from public data (Forest Service, BLM, OpenStreetMap)
 * and riders' approved suggestions, in table riding_spots (migration 20261104170000).
 *
 * The search distance starts at 250 miles and the rider slides it from 10 to 1,000; the choice is
 * remembered on the device. Pure functions here; lib/spots.ts talks to the server.
 */
import { stateByCode } from './discovery';
import type { LatLng } from './geo';

export type SpotKind = 'park' | 'ohv_area' | 'trail_system' | 'trailhead' | 'track';
export type SpotSource = 'usfs' | 'blm' | 'osm' | 'onmylead' | 'rider';

export type Spot = {
  id: string;
  name: string;
  kind: SpotKind;
  lat: number;
  lng: number;
  state: string | null;
  areaName: string | null;
  website: string | null;
  source: SpotSource;
  attribution: string | null;
  distanceMi: number;
  ridesComingUp: number;
};

export type SpotDetail = Omit<Spot, 'distanceMi' | 'ridesComingUp'> & {
  description: string | null;
  vehicleTypes: string[];
  license: string | null;
};

/** Kinds in the order the filter shows them, with a plural for the chips and a singular for a place. */
export const SPOT_KINDS: { kind: SpotKind; label: string; one: string; icon: 'flag' | 'layers' | 'map' | 'pin' | 'trophy' }[] = [
  { kind: 'park', label: 'Off-Road Parks', one: 'Off-Road Park', icon: 'flag' },
  { kind: 'ohv_area', label: 'OHV Areas', one: 'OHV Area', icon: 'layers' },
  { kind: 'trail_system', label: 'Trail Systems', one: 'Trail System', icon: 'map' },
  { kind: 'trailhead', label: 'Trailheads', one: 'Trailhead', icon: 'pin' },
  { kind: 'track', label: 'Motocross Tracks', one: 'Motocross Track', icon: 'trophy' },
];
const KIND_SET = new Set<string>(SPOT_KINDS.map((k) => k.kind));
export const isSpotKind = (v: unknown): v is SpotKind => typeof v === 'string' && KIND_SET.has(v);
export const spotKindInfo = (k: SpotKind) => SPOT_KINDS.find((x) => x.kind === k) ?? SPOT_KINDS[0];

// ---- Search distance -------------------------------------------------------------------------

export const SCOUT_DEFAULT_MILES = 250;
/** The stops on the distance slider: fine near home, coarser for a road trip. */
export const SCOUT_MILE_STEPS = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000] as const;
export const SCOUT_MIN_MILES = SCOUT_MILE_STEPS[0];
export const SCOUT_MAX_MILES = SCOUT_MILE_STEPS[SCOUT_MILE_STEPS.length - 1];

/** The slider stop nearest to a distance. */
export function nearestStepIndex(miles: number): number {
  let best = 0;
  for (let i = 1; i < SCOUT_MILE_STEPS.length; i++) {
    if (Math.abs(SCOUT_MILE_STEPS[i] - miles) < Math.abs(SCOUT_MILE_STEPS[best] - miles)) best = i;
  }
  return best;
}

/** One stop farther (+1) or nearer (-1), held at the ends. */
export function stepMiles(miles: number, by: 1 | -1): number {
  const i = Math.min(SCOUT_MILE_STEPS.length - 1, Math.max(0, nearestStepIndex(miles) + by));
  return SCOUT_MILE_STEPS[i];
}

/** Where a distance sits along the slider, 0 to 1 (stops are evenly spaced). */
export function milesToFraction(miles: number): number {
  return nearestStepIndex(miles) / (SCOUT_MILE_STEPS.length - 1);
}

/** The stop under a point along the slider, 0 to 1. */
export function fractionToMiles(f: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0));
  return SCOUT_MILE_STEPS[Math.round(clamped * (SCOUT_MILE_STEPS.length - 1))];
}

/** A saved distance read back from storage; junk or nothing gives the 250-mile start. */
export function parseSavedMiles(v: string | null | undefined): number {
  const n = Number(v);
  if (!v || !Number.isFinite(n)) return SCOUT_DEFAULT_MILES;
  return SCOUT_MILE_STEPS[nearestStepIndex(n)];
}

/** "1,000" with the rider's digit grouping. */
export const milesText = (miles: number) => miles.toLocaleString('en-US');

// ---- Results -----------------------------------------------------------------------------------

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const SOURCES = new Set(['usfs', 'blm', 'osm', 'onmylead', 'rider']);

/** The server's rows (riding_spots_near) as spots, dropping anything malformed. */
export function parseSpots(rows: unknown): Spot[] {
  if (!Array.isArray(rows)) return [];
  const out: Spot[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const lat = num(r.lat);
    const lng = num(r.lng);
    const name = str(r.name);
    if (!str(r.id) || !name || !isSpotKind(r.kind) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: String(r.id),
      name,
      kind: r.kind,
      lat,
      lng,
      state: str(r.state)?.toUpperCase() ?? null,
      areaName: str(r.area_name),
      website: safeWebsite(r.website),
      source: (SOURCES.has(String(r.source)) ? r.source : 'onmylead') as SpotSource,
      attribution: str(r.attribution),
      distanceMi: Number.isFinite(num(r.distance_mi)) ? num(r.distance_mi) : 0,
      ridesComingUp: Math.max(0, Math.floor(num(r.rides_coming_up) || 0)),
    });
  }
  return out.sort((a, b) => a.distanceMi - b.distanceMi);
}

/** One row of riding_spots as a place page shows it. */
export function parseSpotDetail(r: unknown): SpotDetail | null {
  const [s] = parseSpots(r ? [r] : []);
  if (!s) return null;
  const o = r as Record<string, unknown>;
  const { distanceMi: _d, ridesComingUp: _r, ...rest } = s;
  return {
    ...rest,
    description: str(o.description),
    vehicleTypes: Array.isArray(o.vehicle_types) ? o.vehicle_types.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [],
    license: str(o.license),
  };
}

/** Only http(s) links open from a place page. */
export function safeWebsite(v: unknown): string | null {
  const s = str(v);
  if (!s || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s)) return null;
  return s;
}

/** "fs.usda.gov" for a website button. */
export function websiteHost(url: string): string {
  const m = /^https?:\/\/(?:www\.)?([^/:?#]+)/i.exec(url);
  return m ? m[1] : url;
}

/** How many of each kind are in the results, for the filter chips. */
export function kindCounts(spots: Pick<Spot, 'kind'>[]): Record<SpotKind, number> {
  const c = { park: 0, ohv_area: 0, trail_system: 0, trailhead: 0, track: 0 } as Record<SpotKind, number>;
  for (const s of spots) c[s.kind] += 1;
  return c;
}

/** Spots of the picked kinds; none picked means all. */
export function filterKinds<T extends Pick<Spot, 'kind'>>(spots: T[], kinds: SpotKind[]): T[] {
  if (!kinds.length) return spots;
  const on = new Set(kinds);
  return spots.filter((s) => on.has(s.kind));
}

/** Turn a kind on or off in the filter. Turning on every kind is the same as none. */
export function toggleKind(kinds: SpotKind[], k: SpotKind): SpotKind[] {
  const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
  return next.length === SPOT_KINDS.length ? [] : SPOT_KINDS.map((x) => x.kind).filter((x) => next.includes(x));
}

/** "Under 1 mi", "42 mi". */
export const distanceText = (mi: number) => (mi < 1 ? 'Under 1 mi' : `${Math.round(mi).toLocaleString('en-US')} mi`);

/** Where a place is, for its row: "Ocala National Forest, FL" or "Burnet County, Texas". */
export function placeLine(s: Pick<Spot, 'areaName' | 'state'>): string {
  const state = stateByCode(s.state)?.name ?? s.state;
  if (s.areaName && state) return `${s.areaName}, ${state}`;
  return s.areaName ?? state ?? '';
}

/** Who the data comes from, shown on each place page (the OpenStreetMap credit is required by its licence). */
export function sourceCredit(s: Pick<Spot, 'source' | 'attribution'>): string {
  switch (s.source) {
    case 'usfs':
      return 'Place info from the US Forest Service';
    case 'blm':
      return 'Place info from the Bureau of Land Management';
    case 'osm':
      return 'Place from OpenStreetMap. © OpenStreetMap contributors';
    case 'rider':
      return 'Suggested by OnMyLead riders';
    default:
      return 'Added by OnMyLead';
  }
}

/** A place to start a new ride from: the Create a Ride link that fills the meeting point. */
export function createRideHref(s: Pick<Spot, 'name' | 'lat' | 'lng' | 'state'>): string {
  const q = new URLSearchParams({ type: 'public', spot: s.name, lat: s.lat.toFixed(5), lng: s.lng.toFixed(5) });
  if (s.state) q.set('state', s.state);
  return `/ride/new?${q.toString()}`;
}

/** A meeting point from a Create a Ride link made by createRideHref, or null when it has none. */
export function spotFromParams(p: { spot?: string; lat?: string; lng?: string; state?: string }): (LatLng & { name: string; state: string | null }) | null {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const name = (p.spot ?? '').trim().slice(0, 120);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const st = (p.state ?? '').trim().toUpperCase();
  return { name, lat, lng, state: /^[A-Z]{2}$/.test(st) ? st : null };
}

// ---- Suggest a place --------------------------------------------------------------------------

export type SpotSuggestion = { name: string; kind: SpotKind | null; at: LatLng | null; website: string; note: string };

/** What's still missing before a suggestion can be sent, or null when it's ready. */
export function suggestionProblem(s: SpotSuggestion): string | null {
  if (s.name.trim().length < 2) return 'Give the place a name.';
  if (s.name.trim().length > 120) return 'That name is too long.';
  if (!s.kind) return 'Pick what kind of place it is.';
  if (!s.at) return 'Pick where the place is.';
  const w = s.website.trim();
  if (w && !/^(https?:\/\/)?[^\s/$.?#]+\.[^\s]+$/i.test(w)) return 'That website doesn’t look right.';
  if (s.note.length > 500) return 'Keep the note under 500 characters.';
  return null;
}
