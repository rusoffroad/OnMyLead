/**
 * Scout: places to ride near the rider (Find > Places to Ride). Off-road parks, OHV areas, trail
 * systems, trailheads and motocross tracks from public data (Forest Service, BLM, OpenStreetMap)
 * and riders' approved suggestions, in table riding_spots (migration 20261104170000).
 *
 * The search distance starts at 250 miles and the rider slides it from 10 to 1,000; the choice is
 * remembered on the device. Pure functions here; lib/spots.ts talks to the server.
 */
import type { ActivityId } from './activities';
import { boundsAround, stateByCode, type Bounds } from './discovery';
import type { LatLng } from './geo';

export type SpotKind = 'park' | 'ohv_area' | 'trail_system' | 'trailhead' | 'track' | 'snow_area' | 'scenic_drive' | 'campground';
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
export const SPOT_KINDS: {
  kind: SpotKind; label: string; one: string; icon: 'spotPark' | 'spotOhv' | 'spotTrails' | 'spotTrailhead' | 'spotTrack' | 'spotSnow' | 'spotDrive' | 'spotCamp';
}[] = [
  { kind: 'park', label: 'Off-Road Parks', one: 'Off-Road Park', icon: 'spotPark' },
  { kind: 'ohv_area', label: 'OHV Areas', one: 'OHV Area', icon: 'spotOhv' },
  { kind: 'trail_system', label: 'Trail Systems', one: 'Trail System', icon: 'spotTrails' },
  { kind: 'trailhead', label: 'Trailheads', one: 'Trailhead', icon: 'spotTrailhead' },
  { kind: 'track', label: 'Motocross Tracks', one: 'Motocross Track', icon: 'spotTrack' },
  // Activities (4.0): places for the other activities (supabase migration 20261122100000_activity_places.sql).
  { kind: 'snow_area', label: 'Snowmobile Areas', one: 'Snowmobile Area', icon: 'spotSnow' },
  { kind: 'scenic_drive', label: 'Scenic Drives', one: 'Scenic Drive', icon: 'spotDrive' },
  { kind: 'campground', label: 'Campgrounds', one: 'Campground', icon: 'spotCamp' },
];

/**
 * The kinds of place each activity looks for, in the order its filter and Suggest a Place show
 * them. Places to Ride searches only the activity's places (riding_spots_near_for), so this keeps
 * the suggestion form to kinds that make sense for the rider's activity.
 */
export const ACTIVITY_SPOT_KINDS: Record<ActivityId, SpotKind[]> = {
  offroad: ['park', 'ohv_area', 'trail_system', 'trailhead', 'track'],
  motorcycle: ['scenic_drive', 'track', 'campground'],
  road_trip: ['scenic_drive', 'campground'],
  snowmobile: ['snow_area', 'trailhead', 'trail_system'],
};

export function spotKindsFor(activity: ActivityId | undefined): typeof SPOT_KINDS {
  const want = ACTIVITY_SPOT_KINDS[activity ?? 'offroad'] ?? ACTIVITY_SPOT_KINDS.offroad;
  return want.map((k) => SPOT_KINDS.find((x) => x.kind === k)!).filter(Boolean);
}
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
export function toggleKind(kinds: SpotKind[], k: SpotKind, among: readonly SpotKind[] = ACTIVITY_SPOT_KINDS.offroad): SpotKind[] {
  const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
  // Every kind on screen picked is the same as none picked (Activities: the activity's kinds, or those with places).
  return among.every((x) => next.includes(x)) ? [] : SPOT_KINDS.map((x) => x.kind).filter((x) => next.includes(x));
}

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

// ---- Place page (4.0: details, trails, reviews) -----------------------------------------------
// Server side: riding_spot_page in migration 20261119100000_places_to_ride.sql.

export type SpotDetails = {
  address: string | null;
  phone: string | null;
  /** One line per day range, as the park writes them. */
  hours: string[];
  fees: string | null;
  season: string | null;
  /** Where the details came from ("The park's website") and when they were checked (YYYY-MM-DD). */
  detailsSource: string | null;
  detailsChecked: string | null;
};

/** The park's trails we draw (Park Trails), counted by level. Closed ones are counted only as closed. */
export type SpotTrails = { trails: number; miles: number; easy: number; medium: number; hard: number; extreme: number; unrated: number; closed: number };

export type SpotReview = { id: string; stars: number; body: string | null; photos: string[]; name: string; userId: string | null; mine: boolean; at: string };
export type MyReview = { id: string; stars: number; body: string | null; photos: string[]; hidden: boolean; at: string };
export type SpotReviews = { count: number; average: number | null; photos: string[]; list: SpotReview[]; mine: MyReview | null };

export type SpotPage = { spot: SpotDetail & SpotDetails; trails: SpotTrails | null; reviews: SpotReviews; favorite: boolean };

const int = (v: unknown) => Math.max(0, Math.floor(num(v) || 0));
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);

/** Phone digits a dialer understands: "830-798-9820" -> "8307989820", keeping a leading +. Null if it isn't a phone number. */
export function phoneDigits(phone: string | null | undefined): string | null {
  const s = (phone ?? '').trim();
  if (!/^[0-9+(). -]{7,30}$/.test(s)) return null;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (s.startsWith('+') ? '+' : '') + digits;
}

/** "(830) 798-9820" for a 10-digit US number, else as written. */
export function phoneText(phone: string): string {
  const d = phoneDigits(phone);
  if (!d) return phone.trim();
  const us = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (us.length === 10 && !d.startsWith('+')) return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  return phone.trim();
}

/** The park on Google Maps, where riders read its Google reviews and photos (a free link: no Google data is copied). */
export function googleMapsUrl(s: Pick<Spot, 'name' | 'lat' | 'lng'>): string {
  const q = `${s.name} ${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** The link riders share for a place. */
export const spotShareUrl = (webUrl: string, id: string) => `${webUrl.replace(/\/+$/, '')}/spot/${id}`;

function parseReview(o: unknown): SpotReview | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const stars = int(r.stars);
  if (!str(r.id) || stars < 1 || stars > 5) return null;
  return {
    id: String(r.id), stars, body: str(r.body), photos: strings(r.photos).slice(0, 4), name: str(r.name) ?? 'Rider',
    userId: str(r.user_id), mine: r.mine === true, at: str(r.at) ?? '',
  };
}

/** The server's place page (riding_spot_page), or null when the place isn't listed (or the answer is junk). */
export function parseSpotPage(j: unknown): SpotPage | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const base = parseSpotDetail(o.spot);
  if (!base) return null;
  const s = o.spot as Record<string, unknown>;
  const t = o.trails && typeof o.trails === 'object' ? (o.trails as Record<string, unknown>) : null;
  const rv = o.reviews && typeof o.reviews === 'object' ? (o.reviews as Record<string, unknown>) : {};
  const mineRaw = rv.mine && typeof rv.mine === 'object' ? (rv.mine as Record<string, unknown>) : null;
  const mineStars = mineRaw ? int(mineRaw.stars) : 0;
  const avg = num(rv.average);
  const hours = (str(s.hours) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    spot: {
      ...base,
      address: str(s.address),
      phone: phoneDigits(str(s.phone)) ? str(s.phone) : null,
      hours,
      fees: str(s.fees),
      season: str(s.season),
      detailsSource: str(s.details_source),
      detailsChecked: str(s.details_checked),
    },
    trails: t && int(t.trails) > 0
      ? { trails: int(t.trails), miles: Math.max(0, num(t.miles) || 0), easy: int(t.easy), medium: int(t.medium), hard: int(t.hard), extreme: int(t.extreme), unrated: int(t.unrated), closed: int(t.closed) }
      : null,
    reviews: {
      count: int(rv.count),
      average: Number.isFinite(avg) && avg >= 1 && avg <= 5 ? avg : null,
      photos: strings(rv.photos).slice(0, 12),
      list: (Array.isArray(rv.list) ? rv.list : []).map(parseReview).filter((x): x is SpotReview => !!x),
      mine: mineRaw && str(mineRaw.id) && mineStars >= 1 && mineStars <= 5
        ? { id: String(mineRaw.id), stars: mineStars, body: str(mineRaw.body), photos: strings(mineRaw.photos).slice(0, 4), hidden: mineRaw.hidden === true, at: str(mineRaw.at) ?? '' }
        : null,
    },
    favorite: o.favorite === true,
  };
}

// ---- Reviews ---------------------------------------------------------------------------------

export const REVIEW_MAX_CHARS = 1000;
export const REVIEW_MAX_PHOTOS = 4;
export const SPOT_PHOTO_BUCKET = 'spot-photos';

export type ReviewDraft = { stars: number; body: string; photos: string[] };

/** What's wrong with a review before it's sent, or null when it's ready. */
export function reviewProblem(d: ReviewDraft): string | null {
  if (!Number.isInteger(d.stars) || d.stars < 1 || d.stars > 5) return 'Tap the stars to rate it.';
  if (d.body.trim().length > REVIEW_MAX_CHARS) return 'Keep the review under 1,000 characters.';
  if (d.photos.length > REVIEW_MAX_PHOTOS) return 'Up to 4 photos.';
  return null;
}

/** Where a review photo is saved: the rider's own folder (the bucket and the server only allow that). */
export function spotPhotoPath(userId: string, id: string): string {
  return `${userId}/${id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 60)}.jpg`;
}

/** True for a photo path in this rider's own folder (what save_riding_spot_review accepts). */
export function isOwnSpotPhoto(userId: string, path: string): boolean {
  return new RegExp(`^${userId.replace(/[^0-9a-f-]/gi, '')}/[A-Za-z0-9._-]{1,100}$`).test(path) && !path.includes('..');
}

/** "4.6" for a rating. */
export const ratingText = (avg: number) => (Math.round(avg * 10) / 10).toFixed(1);

/** Full, half and empty stars for a rating, five in all. */
export function starShapes(avg: number): ('full' | 'half' | 'empty')[] {
  const r = Math.round(Math.min(5, Math.max(0, avg)) * 2) / 2;
  return [1, 2, 3, 4, 5].map((i) => (r >= i ? 'full' : r >= i - 0.5 ? 'half' : 'empty'));
}

/** The trail-level pills on a place page, easiest first; levels the park has none of are left out. */
export function trailLevels(t: SpotTrails): { key: keyof SpotTrails; label: string; count: number }[] {
  return ([
    { key: 'easy', label: 'Level 1–2' },
    { key: 'medium', label: 'Level 3' },
    { key: 'hard', label: 'Level 4' },
    { key: 'extreme', label: 'Level 5' },
    { key: 'unrated', label: 'Unrated' },
  ] as const).map((l) => ({ ...l, count: t[l.key] })).filter((l) => l.count > 0);
}

// ---- Open in Map Mode and favorites (4.0, Chris 2026-11-18) ------------------------------------

/** Map Mode opened on a place: /nav?at=30.60791,-98.15822. */
export const mapModeHref = (s: Pick<Spot, 'lat' | 'lng'>) => `/nav?at=${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;

/** The place from Map Mode's ?at= (see mapModeHref), or null when there isn't a good one. */
export function parseMapAt(v: string | string[] | undefined): LatLng | null {
  const raw = Array.isArray(v) ? v[0] : v;
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(raw ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * A map frame around a rider's favorite places: all of them with a margin, at least `minMiles`
 * across so one favorite isn't zoomed in to the gate. Null with no favorites.
 */
export function boundsOfSpots(spots: Pick<Spot, 'lat' | 'lng'>[], minMiles = 15): Bounds | null {
  if (!spots.length) return null;
  const lats = spots.map((s) => s.lat);
  const lngs = spots.map((s) => s.lng);
  const b = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
  const mid = { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
  const least = boundsAround(mid, minMiles);
  const padLat = (b.maxLat - b.minLat) * 0.12;
  const padLng = (b.maxLng - b.minLng) * 0.12;
  return {
    minLat: Math.min(b.minLat - padLat, least.minLat),
    maxLat: Math.max(b.maxLat + padLat, least.maxLat),
    minLng: Math.min(b.minLng - padLng, least.minLng),
    maxLng: Math.max(b.maxLng + padLng, least.maxLng),
  };
}
