/**
 * Steady distances on the rider line (Ride Mode's leader line and the CarPlay rider line).
 *
 * Why the line used to jump: every rider's spot is a snapshot taken at a different moment. This
 * phone's own spot is fresh, but a friend's shared spot arrives only every 5 to 15 seconds (the
 * battery plan), and this phone's own spot only moves every 20 to 100 m. At 30 mph a 5 second
 * old spot is about 200 ft behind where the rider really is, so a friend riding right beside you
 * read as "a few yards", then 200 ft as their spot aged, then a few yards again when the next one
 * landed, over and over.
 *
 * The fix has two steps, both used by the phone and the car so they always agree:
 * 1. `spotNow` moves each rider's last spot forward to the same moment, along the heading and at
 *    the speed their phone reported with it (at most CATCH_UP_MS, never for a stopped rider or a
 *    spot old enough to be "last seen"), so everyone is compared at the same time.
 * 2. `LineSmoother` eases what's left (GPS wobble between two riders, a new spot landing) so a
 *    rider's distance from the leader glides instead of snapping, and a rider who is with the
 *    leader stays "with the leader" until they're clearly apart (TOGETHER_M in, APART_M out).
 *    A real jump (a rider placed on another part of the route, a new leader) still shows at once.
 */
import type { LatLng } from './geo';
import type { PlacedRider } from './route';

/** A spot is moved forward by at most this much time. */
export const CATCH_UP_MS = 10_000;
/** Spots older than this aren't moved at all: the rider shows where they were last seen. */
export const CATCH_UP_STALE_MS = 20_000;
/** Below this speed a rider counts as stopped (GPS reports a little speed even when parked). */
export const MOVING_MPS = 1.5;
/** A reported speed above this (about 100 mph) is a bad reading, not a rider. */
const MAX_MPS = 45;

const EARTH_M = 6_371_000;

export type SharedFix = LatLng & {
  /** When the fix was taken (ms since 1970). */
  atMs: number;
  speedMps?: number | null;
  /** Direction of travel, degrees clockwise from north. Phones report -1 or null when they don't know. */
  headingDeg?: number | null;
};

/**
 * Where a rider is likely to be at `nowMs`, from their last fix: moved forward along their heading
 * at their speed, for at most CATCH_UP_MS. A stopped rider, a fix with no heading or speed, a fix
 * from the future (clock skew) or a stale fix stays where it is.
 */
export function spotNow(fix: SharedFix, nowMs: number): LatLng {
  const at = { lat: fix.lat, lng: fix.lng };
  const ageMs = nowMs - fix.atMs;
  const speed = fix.speedMps;
  const heading = fix.headingDeg;
  if (!Number.isFinite(ageMs) || ageMs <= 0 || ageMs > CATCH_UP_STALE_MS) return at;
  if (speed == null || !Number.isFinite(speed) || speed < MOVING_MPS || speed > MAX_MPS) return at;
  if (heading == null || !Number.isFinite(heading) || heading < 0 || heading > 360) return at;
  const m = speed * (Math.min(ageMs, CATCH_UP_MS) / 1000);
  const rad = (heading * Math.PI) / 180;
  const dLat = (m * Math.cos(rad)) / EARTH_M;
  const dLng = (m * Math.sin(rad)) / (EARTH_M * Math.cos((fix.lat * Math.PI) / 180));
  return { lat: fix.lat + (dLat * 180) / Math.PI, lng: fix.lng + (dLng * 180) / Math.PI };
}

/** How quickly a rider's shown distance follows the measured one (time to close ~63% of a gap). */
export const EASE_MS = 2_500;
/** A change bigger than this is a real move (another part of the route, a new leader): shown at once. */
export const SNAP_M = 150;
/** Riders this close to the leader read as "with the leader" / "a few yards" (route-order, freeride). */
export const TOGETHER_M = 30;
/** Once together, a rider stays together until they're this far from the leader. */
export const APART_M = 45;
/** A rider not seen in this long starts fresh. */
const FORGET_MS = 60_000;

type Shown = { offsetM: number; atMs: number; anchor: string; together: boolean };

/**
 * Eases each rider's distance from the leader on the line between updates (see the top of the
 * file). Keep one per Ride Mode screen and pass it every new placement; it returns the same
 * riders with steadier `alongM`. Only distances between riders change: the leader (or, with no
 * leader on the line, the rider out front) stays exactly where they were placed.
 */
export class LineSmoother {
  private shown = new Map<string, Shown>();

  smooth(placed: PlacedRider[], nowMs: number): PlacedRider[] {
    const on = placed.filter((r) => r.place);
    if (!on.length) {
      this.shown.clear();
      return placed;
    }
    const anchor = on.find((r) => r.role === 'leader') ?? on.reduce((a, b) => (b.place!.alongM > a.place!.alongM ? b : a));
    const base = anchor.place!.alongM;
    const seen = new Set<string>();
    const out = placed.map((r) => {
      if (!r.place || r.id === anchor.id) return r;
      seen.add(r.id);
      const raw = r.place.alongM - base;
      const prev = this.shown.get(r.id);
      let offsetM = raw;
      if (prev && prev.anchor === anchor.id && nowMs >= prev.atMs && Math.abs(raw - prev.offsetM) <= SNAP_M) {
        const k = 1 - Math.exp(-(nowMs - prev.atMs) / EASE_MS);
        offsetM = prev.offsetM + k * (raw - prev.offsetM);
      }
      // With the leader: in under TOGETHER_M, out only past APART_M, so the words don't flip-flop.
      const wasTogether = !!prev && prev.anchor === anchor.id && prev.together;
      const together = Math.abs(raw) < (wasTogether ? APART_M : TOGETHER_M);
      if (together && Math.abs(offsetM) >= TOGETHER_M) offsetM = Math.sign(offsetM || raw || -1) * (TOGETHER_M - 1);
      if (!together && Math.abs(offsetM) < TOGETHER_M) offsetM = Math.sign(offsetM || raw || -1) * TOGETHER_M;
      this.shown.set(r.id, { offsetM, atMs: nowMs, anchor: anchor.id, together });
      return { ...r, place: { ...r.place, alongM: base + offsetM } };
    });
    for (const [id, s] of this.shown) if (!seen.has(id) && nowMs - s.atMs > FORGET_MS) this.shown.delete(id);
    return out;
  }
}
