/**
 * Gliding rider dots: a rider's position arrives every few seconds, and drawing each new fix as a
 * jump made the live map look jerky. A dot now slides from where it is drawn to its new fix over
 * about a second. A fix that is very far away (a rider who just came back into service miles on),
 * or one that barely moved (GPS jitter), is drawn at once instead. Pure, so it is tested without a
 * phone; the screens drive it with a frame timer.
 */
import { distanceM, type LatLng } from './geo';

/** Longest slide between two fixes. */
export const GLIDE_MAX_MS = 1200;
/** Shortest slide worth animating. */
export const GLIDE_MIN_MS = 250;
/** Farther than this and the dot jumps: a slide across miles would draw a rider where they never were. */
export const GLIDE_MAX_M = 1500;
/** Closer than this and the dot jumps too: nothing to see, and no frames spent on it. */
export const GLIDE_MIN_M = 0.5;
/** How often a gliding dot is redrawn (about 30 times a second). */
export const GLIDE_FRAME_MS = 33;

/** Whether the dot should slide from `from` to `to` rather than jump. */
export function shouldGlide(from: LatLng | null, to: LatLng): boolean {
  if (!from) return false;
  const d = distanceM(from, to);
  return d >= GLIDE_MIN_M && d <= GLIDE_MAX_M;
}

/**
 * How long a slide takes: most of the time since the last fix (so the dot is still moving when the
 * next one lands, and never stops and starts), within GLIDE_MIN_MS..GLIDE_MAX_MS.
 */
export function glideDurationMs(sinceLastFixMs: number | null): number {
  if (sinceLastFixMs == null || !Number.isFinite(sinceLastFixMs)) return GLIDE_MAX_MS;
  return Math.round(Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, sinceLastFixMs * 0.8)));
}

/** Ease out: quick at first, settling gently on the fix. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

/** Where the dot is drawn `elapsedMs` into a slide of `durationMs` from `from` to `to`. */
export function glideAt(from: LatLng, to: LatLng, elapsedMs: number, durationMs: number): LatLng {
  if (durationMs <= 0 || elapsedMs >= durationMs) return { lat: to.lat, lng: to.lng };
  const k = easeOut(elapsedMs / durationMs);
  return { lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k };
}

/**
 * How long the follow camera takes to move to the rider's newest spot: about as long as the
 * phone takes to report the next one, so the map moves in one steady motion instead of a short
 * slide, a pause, and another slide.
 */
export function followCamDurationMs(fixEveryMs: number): number {
  return Math.round(Math.min(1500, Math.max(600, fixEveryMs * 0.95)));
}
