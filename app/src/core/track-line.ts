/**
 * Track Line (Map Mode): when it's on, the map draws exactly where you've been, one line per day
 * in its own colour so today stands out from yesterday. It is a breadcrumb, not a recording: kept
 * on this phone only, never shared, and only the last few days are kept. Pure, so it is tested
 * without a phone.
 */
import { distanceM, type LatLng } from './geo';

/** Each day's line: [lat, lng] pairs, newest last. Keyed by the phone's local date, YYYY-MM-DD. */
export type TrackDays = Record<string, [number, number][]>;

export const TRACK_LINE_STORAGE_KEY = 'nav.trackLine.v1';
export const TRACK_LINE_SWITCH_KEY = 'nav.trackLineOn.v1';
/** Days kept on the phone (today plus this many before it). */
export const TRACK_DAYS_KEPT = 7;
/** A new point needs to be this far from the last one, so a parked phone doesn't pile up points. */
export const TRACK_MIN_STEP_M = 8;
/** Fixes worse than this are skipped. */
export const TRACK_MAX_ACCURACY_M = 40;
/** Cap per day (a long day of riding at one point per 8 m is still well under this). */
export const TRACK_MAX_POINTS_PER_DAY = 20_000;
/** A jump this long between two fixes is a GPS glitch (or the phone was off): start a new piece. */
export const TRACK_BREAK_M = 2_000;

/** Today in red, yesterday in blue, then gold, mint, violet, orange and white for older days. */
export const TRACK_DAY_COLORS = ['#FF3B44', '#3B86F7', '#E6C27A', '#57E3C3', '#B48CFF', '#FF9F43', '#F1F4F8'];

/** The phone's local date for a time, YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from `key` back to today's key (0 today, 1 yesterday). */
export function daysAgo(key: string, now: number): number {
  const [y, m, d] = key.split('-').map(Number);
  const [ty, tm, td] = dayKey(now).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
}

export const colorForDay = (ago: number) => TRACK_DAY_COLORS[Math.min(Math.max(0, ago), TRACK_DAY_COLORS.length - 1)];

/** "Today", "Yesterday", or the date ("Nov 1"). */
export function dayLabel(key: string, now: number): string {
  const ago = daysAgo(key, now);
  if (ago === 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Read what's stored; anything malformed is dropped. */
export function parseTrackDays(raw: unknown): TrackDays {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TrackDays = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(v)) continue;
    const pts = v.filter(
      (p): p is [number, number] => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180,
    ).map((p) => [p[0], p[1]] as [number, number]);
    if (pts.length) out[k] = pts;
  }
  return out;
}

/** Drop days older than TRACK_DAYS_KEPT. */
export function pruneDays(days: TrackDays, now: number): TrackDays {
  const out: TrackDays = {};
  for (const [k, v] of Object.entries(days)) {
    const ago = daysAgo(k, now);
    if (ago >= 0 && ago < TRACK_DAYS_KEPT) out[k] = v;
  }
  return out;
}

export type TrackFix = { lat: number; lng: number; accuracy: number | null; timestamp: number };

/**
 * Add one GPS fix. Returns the same object when the fix was skipped (too rough, or too close to
 * the last point), so a caller can tell nothing changed.
 */
export function addFix(days: TrackDays, fix: TrackFix): TrackDays {
  if (fix.accuracy != null && fix.accuracy > TRACK_MAX_ACCURACY_M) return days;
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return days;
  const key = dayKey(fix.timestamp);
  const line = days[key] ?? [];
  const last = line[line.length - 1];
  if (last && distanceM({ lat: last[0], lng: last[1] }, fix) < TRACK_MIN_STEP_M) return days;
  if (line.length >= TRACK_MAX_POINTS_PER_DAY) return days;
  const p: [number, number] = [Math.round(fix.lat * 1e6) / 1e6, Math.round(fix.lng * 1e6) / 1e6];
  return { ...days, [key]: [...line, p] };
}

export type DayLine = { key: string; label: string; color: string; pieces: LatLng[][] };

/**
 * The lines to draw, oldest first so today sits on top. A day's line is split where the rider
 * jumped more than TRACK_BREAK_M (phone off, or a drive between riding spots), so the map never
 * draws a straight line across country.
 */
export function dayLines(days: TrackDays, now: number): DayLine[] {
  return Object.keys(pruneDays(days, now))
    .sort()
    .map((key) => {
      const pieces: LatLng[][] = [];
      let cur: LatLng[] = [];
      for (const [lat, lng] of days[key]) {
        const p = { lat, lng };
        const prev = cur[cur.length - 1];
        if (prev && distanceM(prev, p) > TRACK_BREAK_M) {
          if (cur.length > 1) pieces.push(cur);
          cur = [];
        }
        cur.push(p);
      }
      if (cur.length > 1) pieces.push(cur);
      return { key, label: dayLabel(key, now), color: colorForDay(daysAgo(key, now)), pieces };
    })
    .filter((d) => d.pieces.length > 0);
}
