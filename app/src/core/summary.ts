/**
 * Post-ride summary from a rider's own track.
 *
 * Tracks are stored as [[lng, lat, epochSeconds, speedMps, altitudeM?, accuracyM?], ...]. Phones
 * add GPS noise, so the math cleans the track first:
 *   1. drop fixes the phone itself says are rough (accuracy worse than 100 m),
 *   2. drop fixes that imply an impossible jump (GPS spikes), including a stray first fix,
 *   3. drop quick out-and-back jumps (a fix that bounces away and straight back), and jumps the
 *      phone's own speed says didn't happen (it reported standing still, or far slower),
 *   4. smooth positions with a short moving average (jitter),
 *   5. count a segment as moving only above the Ride Bubble moving speed, so standing at a
 *      gas stop doesn't add miles or moving time,
 *   6. never count a gap longer than five minutes (location was off; the straight line is a
 *      guess).
 * The database's group totals and badge miles (ride_group_summary, rider_track_miles) use the
 * same thresholds (migration 20261102200000_ride_miles_cleanup.sql).
 */
import { MOVING_SPEED_MPS } from './bubble';
import { distanceM, metersToMiles, type LatLng } from './geo';

export type TrackPoint = LatLng & {
  /** Epoch seconds. */
  t: number;
  speedMps: number | null;
  altitudeM: number | null;
  /** Horizontal accuracy the phone reported, meters. Null on points stored before 2.0. */
  accuracyM?: number | null;
};

/** Anything faster than this between two fixes is a GPS spike (about 134 mph). */
export const MAX_PLAUSIBLE_MPS = 60;
/** A jump this long counts as distance even if it was slow (e.g. after a long stop). */
export const MIN_REAL_MOVE_M = 20;
/** Fixes the phone says are rougher than this don't count toward distance. */
export const MAX_TRACK_ACCURACY_M = 100;
/**
 * No fixes for longer than this means location was off (app closed, phone off). The slowest
 * check-in is every 45 s (Max Battery Saver), so five minutes is never a normal gap.
 */
export const MAX_GAP_SEC = 300;
/** An excursion this far and this fast that comes straight back is a GPS bounce. */
export const BOUNCE_MIN_M = 50;
export const BOUNCE_MIN_MPS = 20;
/** Climb smaller than this is treated as altitude noise. */
export const ELEVATION_NOISE_M = 3;

/** Haversine (great-circle) distance in meters. */
export const haversineM = distanceM;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Read the stored jsonb points: drops malformed rows, sorts by time, removes duplicate timestamps. */
export function parseTrack(raw: unknown): TrackPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackPoint[] = [];
  for (const p of raw) {
    if (!Array.isArray(p)) continue;
    const [lng, lat, t, speed, alt, acc] = p as unknown[];
    if (!isNum(lng) || !isNum(lat) || !isNum(t)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({
      lng, lat, t,
      speedMps: isNum(speed) && speed >= 0 ? speed : null,
      altitudeM: isNum(alt) ? alt : null,
      accuracyM: isNum(acc) && acc >= 0 ? acc : null,
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t);
}

/** Drop fixes the phone reported as rough. Points without an accuracy (older builds) stay. */
export function dropRough(points: TrackPoint[], maxAccuracyM = MAX_TRACK_ACCURACY_M): TrackPoint[] {
  return points.filter((p) => p.accuracyM == null || p.accuracyM <= maxAccuracyM);
}

/**
 * Remove fixes that would need an impossible speed to reach from the last good fix. When the
 * very first fix is the stray one (a stale fix from somewhere else), the next fixes all agree
 * with each other and not with it: then the first fix goes instead, rather than the whole ride.
 */
export function dropSpikes(points: TrackPoint[], maxMps = MAX_PLAUSIBLE_MPS): TrackPoint[] {
  const plausible = (a: TrackPoint, b: TrackPoint) => b.t > a.t && haversineM(a, b) / (b.t - a.t) <= maxMps;
  const kept: TrackPoint[] = [];
  let rejected: TrackPoint[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(p);
      continue;
    }
    if (p.t <= last.t) continue;
    if (plausible(last, p)) {
      kept.push(p);
      rejected = [];
      continue;
    }
    const prev = rejected[rejected.length - 1];
    rejected = prev && plausible(prev, p) ? [...rejected, p] : [p];
    if (kept.length === 1 && rejected.length >= 2) {
      kept.splice(0, 1, ...rejected);
      rejected = [];
    }
  }
  return kept;
}

/**
 * Remove GPS bounces: up to three fixes that jump at least 50 m away, faster than 20 m/s
 * (45 mph), and land back within a third of that distance from where they left. A phone
 * jittering between two spots every couple of seconds otherwise adds a mile every few minutes.
 */
export function dropBounces(points: TrackPoint[], maxRun = 3): TrackPoint[] {
  const out: TrackPoint[] = [];
  let i = 0;
  while (i < points.length) {
    const a = points[i];
    out.push(a);
    let skipTo = i + 1;
    for (let j = i + 2; j <= Math.min(points.length - 1, i + maxRun + 1); j++) {
      const b = points[j];
      let far = 0;
      let fast = false;
      for (let k = i + 1; k < j; k++) {
        const d = haversineM(a, points[k]);
        far = Math.max(far, d);
        const dt = points[k].t - a.t;
        if (dt > 0 && d / dt >= BOUNCE_MIN_MPS) fast = true;
      }
      if (far >= BOUNCE_MIN_M && fast && haversineM(a, b) <= far / 3) {
        skipTo = j;
        break;
      }
    }
    i = skipTo;
  }
  return out;
}

/** Below this reported speed (about 0.7 mph) the phone says it is standing still. */
export const STILL_MPS = 0.3;

/**
 * Drop fixes the phone's own speed contradicts: both this fix and the last kept one report a
 * speed, and either both say standing still yet the fix moved 20 m or more, or reaching it would
 * need more than three times the faster reported speed plus 10 m/s.
 */
export function dropContradicted(points: TrackPoint[]): TrackPoint[] {
  const kept: TrackPoint[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (last && last.speedMps != null && p.speedMps != null && p.t > last.t) {
      const d = haversineM(last, p);
      const top = Math.max(last.speedMps, p.speedMps);
      if ((top < STILL_MPS && d >= MIN_REAL_MOVE_M) || d / (p.t - last.t) > 3 * top + 10) continue;
    }
    kept.push(p);
  }
  return kept;
}

/** Split a track wherever there were no fixes for longer than MAX_GAP_SEC. */
export function splitAtGaps(points: TrackPoint[], maxGapSec = MAX_GAP_SEC): TrackPoint[][] {
  const pieces: TrackPoint[][] = [];
  for (const p of points) {
    const piece = pieces[pieces.length - 1];
    if (piece && p.t - piece[piece.length - 1].t <= maxGapSec) piece.push(p);
    else pieces.push([p]);
  }
  return pieces;
}

/** Every cleaning step before smoothing: rough fixes, spikes, bounces and contradicted jumps. */
export function cleanTrack(points: TrackPoint[]): TrackPoint[] {
  return dropContradicted(dropBounces(dropSpikes(dropRough(points))));
}

/**
 * Centered moving average of position (and altitude) over `window` fixes. The window shrinks
 * symmetrically near the ends so the start and finish stay put and straight lines keep their
 * length. Times are kept.
 */
export function smoothTrack(points: TrackPoint[], window = 5): TrackPoint[] {
  if (window <= 1 || points.length < 3) return points;
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    const h = Math.min(half, i, points.length - 1 - i);
    const from = i - h;
    const to = i + h;
    let lat = 0;
    let lng = 0;
    let alt = 0;
    let altN = 0;
    for (let j = from; j <= to; j++) {
      lat += points[j].lat;
      lng += points[j].lng;
      if (points[j].altitudeM != null) {
        alt += points[j].altitudeM!;
        altN++;
      }
    }
    const n = to - from + 1;
    return { ...p, lat: lat / n, lng: lng / n, altitudeM: p.altitudeM != null && altN ? alt / altN : p.altitudeM };
  });
}

/** Total climb in meters, ignoring wiggles smaller than the noise threshold. */
export function elevationGainM(altitudes: number[], noiseM = ELEVATION_NOISE_M): number {
  if (altitudes.length < 2) return 0;
  let gain = 0;
  let ref = altitudes[0];
  for (const a of altitudes.slice(1)) {
    if (a > ref + noiseM) {
      gain += a - ref;
      ref = a;
    } else if (a < ref) {
      ref = a;
    }
  }
  return gain;
}

/** Evenly thin a route to at most `max` points, always keeping the ends. */
export function downsample<T>(points: T[], max = 300): T[] {
  if (points.length <= max || max < 2) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export type RideSummary = {
  distanceM: number;
  movingTimeSec: number;
  /** First fix to last fix. */
  elapsedSec: number;
  maxSpeedMps: number;
  /** Distance over moving time. */
  avgMovingSpeedMps: number;
  /** Null when the track has no altitude. */
  elevationGainM: number | null;
  startedAt: number | null;
  endedAt: number | null;
  /** Cleaned, thinned route for the map. Only ever shown to the rider who recorded it. */
  route: LatLng[];
};

export function summarizeTrack(points: TrackPoint[], opts: { movingMps?: number; smoothWindow?: number } = {}): RideSummary {
  const movingMps = opts.movingMps ?? MOVING_SPEED_MPS;
  const clean = cleanTrack(points);
  // Smooth each stretch between location gaps on its own, so the gap's two ends aren't blended.
  const smooth: TrackPoint[] = [];
  for (const piece of splitAtGaps(clean)) smooth.push(...smoothTrack(piece, opts.smoothWindow ?? 5));

  let distance = 0;
  let moving = 0;
  let maxSegmentSpeed = 0;
  for (let i = 1; i < smooth.length; i++) {
    const dt = smooth[i].t - smooth[i - 1].t;
    if (dt <= 0) continue;
    // Location was off: the straight line across the gap is a guess, so it isn't counted.
    if (dt > MAX_GAP_SEC) continue;
    const d = haversineM(smooth[i - 1], smooth[i]);
    const v = d / dt;
    if (v >= movingMps) {
      distance += d;
      moving += dt;
      maxSegmentSpeed = Math.max(maxSegmentSpeed, v);
    } else if (d >= Math.max(MIN_REAL_MOVE_M, (smooth[i - 1].accuracyM ?? 0) + (smooth[i].accuracyM ?? 0))) {
      // A slow move only counts when it is bigger than the two fixes' own uncertainty.
      distance += d;
    }
  }

  // Phone-reported speed is better than position deltas when we have it.
  const reported = clean.map((p) => p.speedMps).filter((s): s is number => s != null && s <= MAX_PLAUSIBLE_MPS);
  const maxSpeed = reported.length ? Math.max(...reported) : maxSegmentSpeed;

  const alts = smooth.map((p) => p.altitudeM).filter((a): a is number => a != null);
  const hasAltitude = smooth.length > 1 && alts.length >= smooth.length / 2;

  return {
    distanceM: distance,
    movingTimeSec: moving,
    elapsedSec: clean.length > 1 ? clean[clean.length - 1].t - clean[0].t : 0,
    maxSpeedMps: maxSpeed,
    avgMovingSpeedMps: moving > 0 ? distance / moving : 0,
    elevationGainM: hasAltitude ? elevationGainM(alts) : null,
    startedAt: clean.length ? clean[0].t : null,
    endedAt: clean.length ? clean[clean.length - 1].t : null,
    route: downsample(smooth.map(({ lat, lng }) => ({ lat, lng }))),
  };
}

// --- Formatting -----------------------------------------------------------------

export const mph = (mps: number) => mps * 2.236936;
export const formatMiles = (m: number) => `${metersToMiles(m) < 10 ? metersToMiles(m).toFixed(1) : Math.round(metersToMiles(m))} mi`;
export const formatMph = (mps: number) => `${Math.round(mph(mps))} mph`;
export const formatFeet = (m: number) => `${Math.round(m * 3.28084).toLocaleString('en-US')} ft`;

/** "2 h 05 min", "45 min", "0 min". */
export function formatDuration(sec: number): string {
  const totalMin = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

// --- Route map ------------------------------------------------------------------

/**
 * Fit a route into a width x height box (with padding) for drawing as an SVG polyline.
 * Longitude is scaled by cos(latitude) so the shape isn't stretched. North is up.
 */
export function projectRoute(route: LatLng[], width: number, height: number, pad = 8): { x: number; y: number }[] {
  if (!route.length) return [];
  const midLat = route.reduce((s, p) => s + p.lat, 0) / route.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = route.map((p) => p.lng * k);
  const ys = route.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = spanX || spanY ? Math.min(spanX ? innerW / spanX : Infinity, spanY ? innerH / spanY : Infinity) : 0;
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;
  return route.map((_, i) => ({ x: offX + (xs[i] - minX) * scale, y: offY + (maxY - ys[i]) * scale }));
}

// --- Shareable ride card ----------------------------------------------------------

/** What goes on the share card. Deliberately no meeting point, route or other riders' data. */
export type RideCardData = {
  rideName: string;
  dateLabel: string;
  /** The sharer's own distance, if they recorded a track. */
  distanceMiles: number | null;
  riderCount: number;
};

export function rideCardLines(card: RideCardData): { title: string; date: string; stats: string[] } {
  const stats: string[] = [];
  if (card.distanceMiles != null && card.distanceMiles > 0) {
    stats.push(`${card.distanceMiles < 10 ? card.distanceMiles.toFixed(1) : Math.round(card.distanceMiles)} miles`);
  }
  stats.push(`${card.riderCount} ${card.riderCount === 1 ? 'rider' : 'riders'}`);
  return { title: card.rideName, date: card.dateLabel, stats };
}

/** Plain-text version for platforms that can't share an image. */
export function rideCardText(card: RideCardData, url?: string): string {
  const { title, date, stats } = rideCardLines(card);
  return [`${title} · ${date}`, stats.join(' · '), 'OnMyLead, presented by RUS Offroad', url].filter(Boolean).join('\n');
}
