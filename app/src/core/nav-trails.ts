/**
 * Navigation Mode: trails a rider records or draws for themselves, the trails other riders shared,
 * and the rules that decide what leaves the phone.
 *
 * A recorded trail lives on the phone (lib/nav-trails). Sharing it with everyone sends a copy to
 * shared_trails (migration 20261101600000_nav_trails.sql) with the first and last stretch cut off
 * (trimForSharing), so a trail recorded from a driveway never shows the driveway. Riders who
 * travelled a shared trail can rate how accurate the line is and how good a ride it is; enough bad
 * accuracy ratings hide it from everyone but its mapper (the database decides; hidesTrail mirrors
 * the rule for the app's wording).
 */
import { parseObstacles, type Obstacle } from './obstacles';
import { distanceM, METERS_PER_MILE, type LatLng } from './geo';
import { cumulativeM, lineLengthM, locateOnRoute, makeRoute, simplifyLine, type RideRoute } from './route';

// --- What a trail is ---------------------------------------------------------

export type Difficulty = 'easy' | 'moderate' | 'hard' | 'extreme';
export type TrailVehicle = 'stock_4x4' | 'built_4x4' | 'sxs_utv' | 'atv' | 'dirt_bike' | 'adventure_bike';
export type Surface = 'dirt' | 'gravel' | 'rock' | 'sand' | 'mud' | 'snow' | 'paved' | 'mixed';
export type Season = 'year_round' | 'spring_fall' | 'summer' | 'winter' | 'dry_weather';

/** Trail ratings riders know from the trailhead sign: green, blue, black, double black. */
export const DIFFICULTIES: { value: Difficulty; label: string; hint: string; color: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Graded road or two-track. Any high-clearance machine.', color: '#3CC36B' },
  { value: 'moderate', label: 'Moderate', hint: 'Ruts, rocks and steeper climbs. Low range helps.', color: '#3B86F7' },
  { value: 'hard', label: 'Hard', hint: 'Ledges and tight lines. Lockers and a spotter.', color: '#F2F4F7' },
  { value: 'extreme', label: 'Extreme', hint: 'Built rigs only. Damage likely.', color: '#E5262E' },
];

export const TRAIL_VEHICLES: { value: TrailVehicle; label: string }[] = [
  { value: 'stock_4x4', label: 'Stock 4x4 / SUV' },
  { value: 'built_4x4', label: 'Built 4x4' },
  { value: 'sxs_utv', label: 'SXS/UTV' },
  { value: 'atv', label: 'ATV' },
  { value: 'dirt_bike', label: 'Dirt Bike' },
  { value: 'adventure_bike', label: 'Adventure Bike' },
];

export const SURFACES: { value: Surface; label: string }[] = [
  { value: 'dirt', label: 'Dirt' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'rock', label: 'Rock' },
  { value: 'sand', label: 'Sand' },
  { value: 'mud', label: 'Mud' },
  { value: 'snow', label: 'Snow' },
  { value: 'paved', label: 'Paved' },
  { value: 'mixed', label: 'Mixed' },
];

export const SEASONS: { value: Season; label: string }[] = [
  { value: 'year_round', label: 'Year Round' },
  { value: 'spring_fall', label: 'Spring to Fall' },
  { value: 'summer', label: 'Summer Only' },
  { value: 'winter', label: 'Winter Only' },
  { value: 'dry_weather', label: 'Dry Weather Only' },
];

const labelOf = <T extends string>(list: { value: T; label: string }[], v: T | null | undefined) => list.find((x) => x.value === v)?.label ?? null;
export const difficultyLabel = (d: Difficulty | null | undefined) => labelOf(DIFFICULTIES, d);
export const difficultyColor = (d: Difficulty | null | undefined) => DIFFICULTIES.find((x) => x.value === d)?.color ?? '#97A7BE';
export const vehicleLabel = (v: TrailVehicle) => labelOf(TRAIL_VEHICLES, v) ?? v;
export const surfaceLabel = (s: Surface | null | undefined) => labelOf(SURFACES, s);
export const seasonLabel = (s: Season | null | undefined) => labelOf(SEASONS, s);

/** The details a rider fills in for a trail. Name, difficulty and vehicles are needed to share. */
export type TrailDetails = {
  name: string;
  description: string;
  difficulty: Difficulty | null;
  vehicles: TrailVehicle[];
  surface: Surface | null;
  season: Season | null;
  /** Narrowest gap on the trail, in inches (a 50" trail keeps full-size rigs off). */
  maxWidthIn: number | null;
  oneWay: boolean;
};

export const EMPTY_DETAILS: TrailDetails = {
  name: '', description: '', difficulty: null, vehicles: [], surface: null, season: null, maxWidthIn: null, oneWay: false,
};

/** [lat, lng, altitude in meters or null, epoch ms]: compact, since a long day is thousands of points. */
export type TrackPoint = [number, number, number | null, number];

export type ShareState = {
  /** The id of the public copy in shared_trails. */
  id: string;
  status: 'public' | 'hidden' | 'removed';
  hiddenReason: 'ratings' | 'admin' | null;
  /** The mapper has seen the "your trail is hidden" notice. */
  hiddenSeen: boolean;
  ratingCount: number;
  average: number | null;
  quality: number | null;
  sharedAt: string;
};

/** A trail saved on this phone. */
export type LocalTrail = {
  id: string;
  details: TrailDetails;
  /** Recorded or drawn line, full detail (only the trimmed, thinned copy is ever shared). */
  points: TrackPoint[];
  source: 'recorded' | 'drawn' | 'saved';
  /** Photos on this phone (file URIs) or already uploaded (https). */
  photos: string[];
  createdAt: string;
  updatedAt: string;
  /** Set once shared with everyone. */
  shared: ShareState | null;
  /** A public trail saved from someone else: its id there (never shared again by this rider). */
  savedFrom?: { id: string; mapper: string } | null;
  /** Named spots along the trail (core/obstacles), shared with it. */
  obstacles?: Obstacle[];
  /** Recorded trails only: leave off the first and last SHARE_TRIM_M when sharing (off by default). */
  hideStart?: boolean;
};

export const MAX_PHOTOS = 6;

export function newTrailId(now = Date.now(), rand = Math.random): string {
  return `t${now.toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

export const toLatLngs = (points: TrackPoint[]): LatLng[] => points.map((p) => ({ lat: p[0], lng: p[1] }));

// --- Recording ---------------------------------------------------------------

/** Fixes worse than this are skipped: a phone in a canyon can be off by a hundred meters. */
export const MAX_FIX_ACCURACY_M = 35;
/** A new point only every few meters, so sitting still at a viewpoint adds nothing. */
export const RECORD_STEP_M = 5;
/** Faster than this between two fixes (about 155 mph) is a GPS jump, not riding. */
const MAX_PLAUSIBLE_MPS = 70;

export type Fix = { lat: number; lng: number; altitude: number | null; accuracy: number | null; timestamp: number };

/** Whether a fix joins the recording after `last`. */
export function acceptFix(last: TrackPoint | undefined, fix: Fix): boolean {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return false;
  if (fix.accuracy != null && fix.accuracy > MAX_FIX_ACCURACY_M) return false;
  if (!last) return true;
  const d = distanceM({ lat: last[0], lng: last[1] }, fix);
  if (d < RECORD_STEP_M) return false;
  const dt = (fix.timestamp - last[3]) / 1000;
  if (dt > 0 && d / dt > MAX_PLAUSIBLE_MPS) return false;
  return true;
}

export const toTrackPoint = (fix: Fix): TrackPoint => [
  Math.round(fix.lat * 1e6) / 1e6,
  Math.round(fix.lng * 1e6) / 1e6,
  fix.altitude != null && Number.isFinite(fix.altitude) ? Math.round(fix.altitude * 10) / 10 : null,
  fix.timestamp,
];

/** Climbs smaller than this are GPS noise, not hills. */
const CLIMB_STEP_M = 4;
/** Moving slower than this (about 1 mph) counts as stopped. */
const STOPPED_MPS = 0.45;

export type TrackStats = {
  lengthM: number;
  gainM: number | null;
  lossM: number | null;
  highM: number | null;
  lowM: number | null;
  durationS: number;
  movingS: number;
};

export function trackStats(points: TrackPoint[]): TrackStats {
  let lengthM = 0;
  let movingS = 0;
  let gain = 0;
  let loss = 0;
  let high: number | null = null;
  let low: number | null = null;
  let ref: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      const d = distanceM({ lat: q[0], lng: q[1] }, { lat: p[0], lng: p[1] });
      lengthM += d;
      const dt = (p[3] - q[3]) / 1000;
      if (dt > 0 && d / dt >= STOPPED_MPS) movingS += dt;
    }
    const alt = p[2];
    if (alt == null) continue;
    high = high == null ? alt : Math.max(high, alt);
    low = low == null ? alt : Math.min(low, alt);
    // Count a climb only once it passes the step from the last counted level (hysteresis).
    if (ref == null) ref = alt;
    else if (alt - ref >= CLIMB_STEP_M) {
      gain += alt - ref;
      ref = alt;
    } else if (ref - alt >= CLIMB_STEP_M) {
      loss += ref - alt;
      ref = alt;
    }
  }
  const hasAlt = high != null;
  return {
    lengthM,
    gainM: hasAlt ? Math.round(gain) : null,
    lossM: hasAlt ? Math.round(loss) : null,
    highM: high != null ? Math.round(high) : null,
    lowM: low != null ? Math.round(low) : null,
    durationS: points.length > 1 ? Math.round((points[points.length - 1][3] - points[0][3]) / 1000) : 0,
    movingS: Math.round(movingS),
  };
}

// --- Sharing -----------------------------------------------------------------

/**
 * Hide My Start: cut this much off each end before sharing, so a trail recorded from home never
 * shows home. Since 2.0 it's the rider's choice on recorded trails (off by default) and never
 * applies to drawn trails, which share end to end.
 */
export const SHARE_TRIM_M = 200;

/** How much each end loses when this trail is shared. */
export const shareTrimFor = (t: Pick<LocalTrail, 'source' | 'hideStart'>) => (t.source === 'recorded' && t.hideStart ? SHARE_TRIM_M : 0);
/** What must be left after the trim for the trail to be worth sharing. */
export const MIN_SHARED_M = 200;
/** Shared lines are thinned to this many points (the database takes up to 3000). */
export const MAX_SHARED_POINTS = 2500;

/** Remove `trimM` from the start and the end of a line, cutting mid-segment where needed. */
export function trimEnds(points: LatLng[], trimM = SHARE_TRIM_M): LatLng[] {
  if (points.length < 2) return [];
  if (trimM <= 0) return points;
  const cum = cumulativeM(points);
  const total = cum[cum.length - 1];
  if (total <= trimM * 2) return [];
  const at = (m: number): LatLng => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < m) i++;
    const seg = cum[i] - cum[i - 1];
    const t = seg > 0 ? (m - cum[i - 1]) / seg : 0;
    const a = points[i - 1];
    const b = points[i];
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  };
  const from = trimM;
  const to = total - trimM;
  const out: LatLng[] = [at(from)];
  for (let i = 0; i < points.length; i++) if (cum[i] > from && cum[i] < to) out.push(points[i]);
  out.push(at(to));
  return out;
}

/** The line that leaves the phone: ends trimmed, thinned, rounded to about 10 cm. */
export function lineForSharing(points: TrackPoint[], trimM = SHARE_TRIM_M): LatLng[] {
  const trimmed = trimEnds(toLatLngs(points), trimM);
  if (lineLengthM(trimmed) < MIN_SHARED_M) return [];
  return simplifyLine(trimmed, 3, MAX_SHARED_POINTS).map((p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }));
}

export type LineString = { type: 'LineString'; coordinates: [number, number][] };

export const toLineString = (points: LatLng[]): LineString => ({ type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) });

export function fromLineString(g: unknown): LatLng[] {
  const c = (g as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(c)) return [];
  return c.flatMap((x) =>
    Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number' && Math.abs(x[1]) <= 90 && Math.abs(x[0]) <= 180
      ? [{ lat: x[1], lng: x[0] }]
      : [],
  );
}

/** What stops a trail from being shared, in the words the form shows. Empty when it can go. */
export function shareProblems(t: Pick<LocalTrail, 'details' | 'points'> & Partial<Pick<LocalTrail, 'source' | 'hideStart'>>): string[] {
  const out: string[] = [];
  const name = t.details.name.trim();
  if (name.length < 2) out.push('Give the trail a name.');
  else if (name.length > 80) out.push('Keep the name under 80 characters.');
  if (!t.details.difficulty) out.push('Pick a difficulty.');
  if (!t.details.vehicles.length) out.push('Pick at least one vehicle type.');
  if (t.details.description.length > 1000) out.push('Keep the notes under 1,000 characters.');
  if (t.details.maxWidthIn != null && (t.details.maxWidthIn < 30 || t.details.maxWidthIn > 120)) out.push('Width limit is 30 to 120 inches.');
  const trim = shareTrimFor({ source: t.source ?? 'recorded', hideStart: t.hideStart });
  if (!lineForSharing(t.points, trim).length) {
    out.push(trim
      ? `The trail is too short to share with Hide My Start on. It leaves off the first and last ${feetOrMiles(SHARE_TRIM_M)}.`
      : `The trail is too short to share. Shared trails need at least ${feetOrMiles(MIN_SHARED_M)}.`);
  }
  return out;
}

// --- Using a trail -----------------------------------------------------------

/** A trail as a group ride route: followed as recorded, like an imported track, but free (source 'trail'). */
export function trailAsRoute(points: LatLng[], name: string | null): RideRoute {
  return makeRoute({ points, source: 'trail', name });
}

export type FollowProgress = {
  /** Straight-line distance to the trail's start. */
  toStartM: number;
  /** Where along the trail the rider is, once near it. */
  alongM: number | null;
  remainingM: number | null;
  offTrailM: number;
  onTrail: boolean;
};

/** Further than this from the line counts as off the trail. */
export const OFF_TRAIL_M = 60;

export function followProgress(trail: LatLng[], cum: number[], me: LatLng, hintAlongM?: number | null): FollowProgress | null {
  if (trail.length < 2) return null;
  const place = locateOnRoute(trail, cum, me, hintAlongM);
  const total = cum[cum.length - 1];
  const off = place?.offRouteM ?? Infinity;
  const on = off <= OFF_TRAIL_M;
  return {
    toStartM: distanceM(me, trail[0]),
    alongM: on && place ? place.alongM : null,
    remainingM: on && place ? Math.max(0, total - place.alongM) : null,
    offTrailM: off,
    onTrail: on,
  };
}

/**
 * How much of a trail a rider's own track covered, in meters: the trail is sampled every 20 m and
 * each sample within `withinM` of a track point counts. Rating a trail asks for real use.
 */
export function coveredM(trail: LatLng[], track: LatLng[], withinM = 40): number {
  if (trail.length < 2 || !track.length) return 0;
  // Bucket the track into a grid about withinM across, so each sample checks only its neighbours.
  const cell = withinM / 111_320;
  const key = (lat: number, lng: number) => `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
  const grid = new Map<string, LatLng[]>();
  for (const p of track) {
    const k = key(p.lat, p.lng);
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  const near = (s: LatLng) => {
    const cy = Math.floor(s.lat / cell);
    const cx = Math.floor(s.lng / cell);
    // Longitude cells shrink toward the poles; look a little wider east and west.
    const spanX = Math.ceil(1 / Math.max(0.2, Math.cos((s.lat * Math.PI) / 180)));
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -spanX; dx <= spanX; dx++)
        for (const p of grid.get(`${cy + dy}:${cx + dx}`) ?? []) if (distanceM(s, p) <= withinM) return true;
    return false;
  };
  const step = 20;
  let covered = 0;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const len = distanceM(a, b);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      if (near({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })) covered += len / n;
    }
  }
  return covered;
}

/** Ridden enough of it to rate: a quarter of the trail, or a full kilometer of a long one. */
export function canRate(trailLengthM: number, covered: number): boolean {
  if (trailLengthM <= 0) return false;
  return covered >= Math.min(1000, trailLengthM * 0.25);
}

/** The Admin Dashboard's rule (trail_rules): how many bad accuracy ratings hide a trail. */
export type TrailRules = { minBad: number; badShare: number };
export const DEFAULT_TRAIL_RULES: TrailRules = { minBad: 3, badShare: 0.5 };

/** Same rule as trail_recount in the database: enough 1-2 star ratings, and enough of the total. */
export function hidesTrail(scores: number[], rules: TrailRules = DEFAULT_TRAIL_RULES): boolean {
  const bad = scores.filter((s) => s <= 2).length;
  return bad >= rules.minBad && bad >= Math.ceil(rules.badShare * scores.length);
}

export const ACCURACY_WORDS = ['', 'Way Off', 'Mostly Off', 'Close', 'Accurate', 'Spot On'];
export const QUALITY_WORDS = ['', 'Not Worth It', 'Meh', 'Good', 'Great', 'Epic'];

/** "4.6 (12)" or "No Ratings Yet". */
export function ratingSummary(average: number | null, count: number): string {
  if (!count || average == null) return 'No Ratings Yet';
  return `${average.toFixed(1)} (${count})`;
}

// --- Measuring and wording ----------------------------------------------------

/** "350 ft", "0.42 mi", "12.3 mi": short enough for a map readout. */
export function feetOrMiles(m: number): string {
  const mi = m / METERS_PER_MILE;
  if (mi < 0.1) return `${Math.round((m * 3.28084) / 10) * 10} ft`;
  if (mi < 10) return `${mi.toFixed(2).replace(/0$/, '')} mi`;
  return `${mi.toFixed(1)} mi`;
}

export const feet = (m: number | null) => (m == null ? null : `${Math.round(m * 3.28084).toLocaleString('en-US')} ft`);

/** "1:05:12" or "12:04". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// --- Public trails from the server --------------------------------------------

export type PublicTrail = {
  id: string;
  clientId: string | null;
  mine: boolean;
  mapper: string;
  name: string;
  description: string | null;
  difficulty: Difficulty;
  vehicles: TrailVehicle[];
  surface: Surface | null;
  season: Season | null;
  maxWidthIn: number | null;
  oneWay: boolean;
  points: LatLng[];
  lengthM: number;
  elevationGainM: number | null;
  highPointM: number | null;
  photos: string[];
  /** Named spots along the trail; [] from servers before 2.0. */
  obstacles: Obstacle[];
  status: 'public' | 'hidden' | 'removed';
  hiddenReason: 'ratings' | 'admin' | null;
  hiddenSeen: boolean;
  ratingCount: number;
  average: number | null;
  qualityCount: number;
  quality: number | null;
  myScore: number | null;
  myQuality: number | null;
  createdAt: string;
};

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const oneOf = <T extends string>(list: { value: T }[], v: unknown): T | null => (list.some((x) => x.value === v) ? (v as T) : null);

/** Reads one trail_json row; null when it's not usable. */
export function parsePublicTrail(v: unknown): PublicTrail | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  const name = str(o.name);
  const difficulty = oneOf(DIFFICULTIES, o.difficulty);
  const points = fromLineString(o.route);
  if (!id || !name || !difficulty) return null;
  const status = o.status === 'hidden' || o.status === 'removed' ? o.status : 'public';
  return {
    id,
    clientId: str(o.client_id),
    mine: o.mine === true,
    mapper: str(o.mapper) ?? 'Rider',
    name,
    description: str(o.description),
    difficulty,
    vehicles: (Array.isArray(o.vehicles) ? o.vehicles : []).filter((x): x is TrailVehicle => TRAIL_VEHICLES.some((t) => t.value === x)),
    surface: oneOf(SURFACES, o.surface),
    season: oneOf(SEASONS, o.season),
    maxWidthIn: num(o.max_width_in),
    oneWay: o.one_way === true,
    points,
    lengthM: num(o.length_m) ?? lineLengthM(points),
    elevationGainM: num(o.elevation_gain_m),
    highPointM: num(o.high_point_m),
    photos: (Array.isArray(o.photos) ? o.photos : []).filter((x): x is string => typeof x === 'string' && x.startsWith('https://')),
    obstacles: parseObstacles(o.obstacles),
    status,
    hiddenReason: o.hidden_reason === 'ratings' || o.hidden_reason === 'admin' ? o.hidden_reason : null,
    hiddenSeen: o.hidden_seen === true,
    ratingCount: num(o.rating_count) ?? 0,
    average: num(o.average),
    qualityCount: num(o.quality_count) ?? 0,
    quality: num(o.quality),
    myScore: num(o.my_score),
    myQuality: num(o.my_quality),
    createdAt: str(o.created_at) ?? '',
  };
}

export const parsePublicTrails = (v: unknown): PublicTrail[] =>
  (Array.isArray(v) ? v : []).map(parsePublicTrail).filter((t): t is PublicTrail => !!t);

/** The share state a local trail keeps, from the server's answer. */
export const shareStateOf = (t: PublicTrail): ShareState => ({
  id: t.id,
  status: t.status,
  hiddenReason: t.hiddenReason,
  hiddenSeen: t.hiddenSeen,
  ratingCount: t.ratingCount,
  average: t.average,
  quality: t.quality,
  sharedAt: t.createdAt,
});

/**
 * Bring each local trail's share state up to date from my_shared_trails(). A trail shared from this
 * phone but gone from the server (deleted on another phone, or the account was reset) goes back to
 * phone-only. Trails shared from another phone are not added here.
 */
export function syncShareStates(local: LocalTrail[], mine: PublicTrail[]): LocalTrail[] {
  const byClient = new Map(mine.filter((t) => t.clientId).map((t) => [t.clientId!, t]));
  return local.map((l) => {
    const server = byClient.get(l.id);
    if (server) {
      const next = shareStateOf(server);
      return JSON.stringify(next) === JSON.stringify(l.shared) ? l : { ...l, shared: next };
    }
    return l.shared ? { ...l, shared: null } : l;
  });
}

/** Trails hidden from the public whose mapper hasn't seen the notice yet. */
export const unseenHidden = (local: LocalTrail[]) => local.filter((l) => l.shared && l.shared.status !== 'public' && !l.shared.hiddenSeen);

/** "Mapped by Mia · Mar 2026". */
export function mappedBy(t: Pick<PublicTrail, 'mapper' | 'createdAt'>): string {
  const d = Date.parse(t.createdAt);
  const when = Number.isNaN(d) ? '' : ` · ${new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
  return `Mapped by ${t.mapper}${when}`;
}

// --- Rider trails on every map ---------------------------------------------------

/** Rider trails are drawn mint and dotted, so they never pass for an agency or OpenStreetMap trail. */
export const RIDER_TRAIL_INK = '#57E3C3';
/** Rider trails load once the map is in this far (about 40 miles across a phone). */
export const RIDER_TRAILS_MIN_Z = 10;

/** Distance from p to the nearest part of a line, in meters (flat projection around p). */
export function distanceToLine(p: LatLng, line: LatLng[]): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return distanceM(p, line[0]);
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: LatLng) => ({ x: (q.lng - p.lng) * kx, y: (q.lat - p.lat) * 111_320 });
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = xy(line[i - 1]);
    const b = xy(line[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

/** The rider trail under a tap, if one is within `radiusM`. Closest wins. */
export function nearestRiderTrail<T extends { points: LatLng[] }>(p: LatLng, trails: T[], radiusM: number): T | null {
  let best: T | null = null;
  let bestD = radiusM;
  for (const t of trails) {
    const d = distanceToLine(p, t.points);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** The box a map region covers, padded by a quarter on each side so a small pan needs no reload. */
export function paddedBox(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) {
  const padLat = r.latitudeDelta * 0.75;
  const padLng = r.longitudeDelta * 0.75;
  return { minLat: r.latitude - padLat, maxLat: r.latitude + padLat, minLng: r.longitude - padLng, maxLng: r.longitude + padLng };
}

/** True when `inner` is entirely inside `outer`. */
export const boxInside = (inner: { minLat: number; minLng: number; maxLat: number; maxLng: number }, outer: typeof inner) =>
  inner.minLat >= outer.minLat && inner.maxLat <= outer.maxLat && inner.minLng >= outer.minLng && inner.maxLng <= outer.maxLng;

// --- Photos on the server ----------------------------------------------------

export const TRAIL_PHOTO_BUCKET = 'trail-photos';

/** The bucket paths of uploaded trail photos (https URLs ending in /trail-photos/<path>). */
export function photoPaths(urls: string[]): string[] {
  const mark = `/${TRAIL_PHOTO_BUCKET}/`;
  return urls.flatMap((u) => {
    const i = u.indexOf(mark);
    return u.startsWith('https://') && i >= 0 ? [decodeURIComponent(u.slice(i + mark.length).split('?')[0])] : [];
  });
}
