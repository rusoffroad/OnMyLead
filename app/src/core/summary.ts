/**
 * Post-ride summary from a rider's own track.
 *
 * Tracks are stored as [[lng, lat, epochSeconds, speedMps, altitudeM?], ...]. Phones add GPS
 * noise, so the math cleans the track first:
 *   1. drop fixes that imply an impossible jump (GPS spikes),
 *   2. smooth positions with a short moving average (jitter),
 *   3. count a segment as moving only above the Ride Bubble moving speed, so standing at a
 *      gas stop doesn't add miles or moving time.
 * The database's group totals (ride_group_summary) use the same spike and moving thresholds.
 */
import { MOVING_SPEED_MPS } from './bubble';
import { distanceM, metersToMiles, type LatLng } from './geo';

export type TrackPoint = LatLng & {
  /** Epoch seconds. */
  t: number;
  speedMps: number | null;
  altitudeM: number | null;
};

/** Anything faster than this between two fixes is a GPS spike (about 134 mph). */
export const MAX_PLAUSIBLE_MPS = 60;
/** A jump this long counts as distance even if it was slow (e.g. after a long stop). */
export const MIN_REAL_MOVE_M = 20;
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
    const [lng, lat, t, speed, alt] = p as unknown[];
    if (!isNum(lng) || !isNum(lat) || !isNum(t)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ lng, lat, t, speedMps: isNum(speed) && speed >= 0 ? speed : null, altitudeM: isNum(alt) ? alt : null });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t);
}

/** Remove fixes that would need an impossible speed to reach from the last good fix. */
export function dropSpikes(points: TrackPoint[], maxMps = MAX_PLAUSIBLE_MPS): TrackPoint[] {
  const kept: TrackPoint[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(p);
      continue;
    }
    const dt = p.t - last.t;
    if (dt <= 0) continue;
    if (haversineM(last, p) / dt > maxMps) continue;
    kept.push(p);
  }
  return kept;
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
  const clean = dropSpikes(points);
  const smooth = smoothTrack(clean, opts.smoothWindow ?? 5);

  let distance = 0;
  let moving = 0;
  let maxSegmentSpeed = 0;
  for (let i = 1; i < smooth.length; i++) {
    const dt = smooth[i].t - smooth[i - 1].t;
    if (dt <= 0) continue;
    const d = haversineM(smooth[i - 1], smooth[i]);
    const v = d / dt;
    if (v >= movingMps) {
      distance += d;
      moving += dt;
      maxSegmentSpeed = Math.max(maxSegmentSpeed, v);
    } else if (d >= MIN_REAL_MOVE_M) {
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
