import { formatDistance, metersToMiles } from './geo';
import { miles, type PlacedRider } from './route';

import { ordinal, tc } from './i18n';
/**
 * The group's running order along the route: every placed rider ranked from the front (1) to the
 * rear, and laid out on the route line so no dot hides another while each stays as close as it
 * can to its real spot. Riders without a spot (not sharing) aren't on the line, by design.
 */

export type RankedRider = PlacedRider & {
  /** 1 is out front. */
  rank: number;
  /** Distance back from the rider at the front, in meters (0 for the front rider). */
  backM: number;
};

/** Riders this close together share a rank order by id, so the line doesn't flicker. */
const TIE_M = 3;

/** Every rider with a spot on the route, front first. */
export function rankRiders(placed: PlacedRider[]): RankedRider[] {
  const on = placed.filter((r) => r.place);
  on.sort((a, b) => {
    const d = b.place!.alongM - a.place!.alongM;
    return Math.abs(d) > TIE_M ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const front = on[0]?.place!.alongM ?? 0;
  return on.map((r, i) => ({ ...r, rank: i + 1, backM: Math.max(0, front - r.place!.alongM) }));
}

export type DotSpot = { id: string; x: number; size: number };

/**
 * Where each dot goes on a track `width` points wide, in running order: as near its real spot as
 * possible, but never overlapping its neighbors (`gap` points apart edge to edge) and never off
 * the ends. When the group doesn't fit at full size, the dots shrink (down to `minScale` of their
 * size), and past that they're spaced evenly across the line, rear on the left, front on the right.
 */
export function layoutDots(
  dots: { id: string; alongM: number; size: number }[],
  lengthM: number,
  width: number,
  opts: { gap?: number; minScale?: number } = {},
): DotSpot[] {
  if (!dots.length || width <= 0) return [];
  const gap = opts.gap ?? 2;
  const minScale = opts.minScale ?? 0.6;
  // Rear first (left), front last (right), same tie rule as rankRiders.
  const order = [...dots].sort((a, b) => {
    const d = a.alongM - b.alongM;
    return Math.abs(d) > TIE_M ? d : a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
  });
  const need = (scale: number) =>
    order.reduce((s, d) => s + d.size * scale, 0) + gap * (order.length - 1);
  const scale = Math.max(minScale, Math.min(1, (width - gap * (order.length - 1)) / order.reduce((s, d) => s + d.size, 0)));
  const sized = order.map((d) => ({ ...d, size: Math.round(d.size * scale * 10) / 10 }));

  // Even when the dots still don't fit: centers spread evenly from end to end.
  if (need(scale) > width + 0.01) {
    const n = sized.length;
    return sized.map((d, i) => ({ id: d.id, size: d.size, x: n === 1 ? width / 2 : (i / (n - 1)) * width }));
  }

  const len = Math.max(1, lengthM);
  const half = (i: number) => sized[i].size / 2;
  const lo = (i: number) => half(i);
  const hi = (i: number) => width - half(i);
  const x = sized.map((d, i) => Math.min(hi(i), Math.max(lo(i), (Math.max(0, Math.min(len, d.alongM)) / len) * width)));
  // Push forward so nothing overlaps the dot behind it...
  for (let i = 1; i < x.length; i++) x[i] = Math.max(x[i], x[i - 1] + half(i - 1) + half(i) + gap);
  // ...then pull back from the finish so nothing runs off the end.
  if (x.length) x[x.length - 1] = Math.min(x[x.length - 1], hi(x.length - 1));
  for (let i = x.length - 2; i >= 0; i--) x[i] = Math.min(x[i], x[i + 1] - half(i + 1) - half(i) - gap);
  return sized.map((d, i) => ({ id: d.id, size: d.size, x: Math.round(x[i] * 10) / 10 }));
}

/** How far past the ends the leader and tail are put, so no tie can slide a rider outside them. */
const PIN_M = TIE_M * 10;

/**
 * The leader line: the leader pinned to the far left edge, the tail gunner pinned to the far
 * right edge, and everyone else in running order between them, each placed by how far behind
 * the leader they are (as a share of the leader-to-tail-gunner gap), without overlapping.
 *
 * When the leader isn't on the line, the rider out front takes the left edge; when there's no
 * tail gunner on it, the rider furthest back takes the right edge. A rider ahead of the leader
 * still sits just right of the leader, and one behind the tail gunner just left of them, so the
 * ends always belong to the leader and the tail gunner. `ranked` is rankRiders' output.
 */
export function convoyLayout(
  ranked: RankedRider[],
  sizeOf: (r: RankedRider) => number,
  width: number,
  opts: { gap?: number; minScale?: number } = {},
): DotSpot[] {
  if (!ranked.length || width <= 0) return [];
  const lead = ranked.find((r) => r.role === 'leader') ?? ranked[0];
  const others = ranked.filter((r) => r.id !== lead.id);
  const tail = [...others].reverse().find((r) => r.role === 'sweep') ?? others[others.length - 1];
  if (!tail) {
    const size = sizeOf(lead);
    return [{ id: lead.id, size, x: Math.min(width / 2, size / 2) }];
  }
  const front = lead.place!.alongM;
  const span = Math.max(1, front - tail.place!.alongM);
  const pos = (r: RankedRider) =>
    r.id === lead.id ? -PIN_M : r.id === tail.id ? span + PIN_M : Math.max(0, Math.min(span, front - r.place!.alongM));
  // layoutDots runs low to high along the line, so feed it distance behind the leader.
  return layoutDots(ranked.map((r) => ({ id: r.id, alongM: pos(r), size: sizeOf(r) })), span, width, opts);
}


const short = (m: number) => (metersToMiles(m) < 0.1 ? formatDistance(m) : `${miles(m)} mi`);

/** One line about a rider on the order line, e.g. "Mia · 3rd of 6 · 0.4 mi behind the leader". */
export function describeRank(r: RankedRider, ranked: RankedRider[], name: string, meId?: string, offWord = 'off the route'): string {
  const who = r.id === meId ? tc('You') : name;
  const n = ranked.length;
  const parts = [who, n === 1 ? tc('only one on the line') : r.rank === 1 ? tc('out front') : r.rank === n ? tc('last of {n}', { n }) : tc('{v} of {n}', { v: ordinal(r.rank), n })];
  const leader = ranked.find((x) => x.role === 'leader');
  if (leader && leader.id !== r.id) {
    const d = leader.place!.alongM - r.place!.alongM;
    if (Math.abs(d) < 30) parts.push(tc('with the leader'));
    else parts.push(tc(d > 0 ? '{d} behind the leader' : '{d} ahead of the leader', { d: short(Math.abs(d)) }));
  } else if (!leader && r.rank > 1) {
    parts.push(tc('{d} back from the front', { d: short(r.backM) }));
  }
  if (!r.place!.onRoute) parts.push(offWord);
  return parts.join(' · ');
}

/** How spread out the group is, front to rear, e.g. "6 riders over 0.8 mi". Null for under two. */
export function groupSpread(ranked: RankedRider[]): string | null {
  if (ranked.length < 2) return null;
  const span = ranked[ranked.length - 1].backM;
  return tc('{length} riders over {v}', { length: ranked.length, v: span < 30 ? tc('a few yards') : short(span) });
}

const FT_PER_M = 3.28084;
/** Ruler steps, in meters: feet first (50 ft to 500 ft), then tenths of a mile up to 50 mi. */
const STEPS_US = [50, 100, 250, 500].map((ft) => ft / FT_PER_M).concat([0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50].map((mi) => mi * 1609.344));
const STEPS_METRIC = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
/** Under this the group reads as together: the ruler shows no ticks, just "a few yards". */
const TOGETHER_M = 30;

/** A short distance for the ruler: "450 ft" / "0.8 mi", or "120 m" / "1.3 km". */
export function rulerDistance(m: number, metric = false): string {
  if (metric) return m < 1000 ? tc('{n} m', { n: Math.round(m / 10) * 10 }) : tc('{n} km', { n: (m / 1000).toFixed(1) });
  return metersToMiles(m) < 0.1 ? tc('{n} ft', { n: Math.round((m * FT_PER_M) / 10) * 10 }) : tc('{n} mi', { n: miles(m) });
}

export type SpreadRuler = {
  /** Leader to the rider furthest back, in meters. */
  meters: number;
  /** e.g. "0.8 mi", or "a few yards" when the group is together. */
  label: string;
  /** Who the span runs between, e.g. "Leader to Tail Gunner". */
  ends: string;
  /** Where the ruler starts and stops on the track: under the leader's dot and the tail's dot. */
  fromX: number;
  toX: number;
  /** Tick marks between the ends, one per step, as x on the track. */
  ticks: number[];
  /** Meters between ticks (0 when there are none). */
  stepM: number;
};

/**
 * The scale under the leader line: a span from the leader's dot to the tail's dot labelled with
 * the distance from the leader to whoever is furthest back, and evenly spaced ticks (a round
 * step, 50 ft up to 50 mi) so riders get a feel for how far apart the dots really are. Works from
 * whatever spots the line has, so Bluetooth and last-seen positions count the same as live ones.
 * `ranked` is rankRiders' output and `spots` convoyLayout's for the same riders. Null for fewer
 * than two riders on the line.
 */
export function spreadRuler(
  ranked: RankedRider[],
  spots: DotSpot[],
  opts: { metric?: boolean; minTickGap?: number } = {},
): SpreadRuler | null {
  if (ranked.length < 2 || spots.length < 2) return null;
  const lead = ranked.find((r) => r.role === 'leader') ?? ranked[0];
  const others = ranked.filter((r) => r.id !== lead.id);
  const tail = [...others].reverse().find((r) => r.role === 'sweep') ?? others[others.length - 1];
  const rear = others[others.length - 1];
  const at = new Map(spots.map((s) => [s.id, s.x]));
  const fromX = at.get(lead.id);
  const toX = at.get(tail.id);
  if (fromX == null || toX == null) return null;
  const front = lead.place!.alongM;
  const meters = Math.max(0, front - Math.min(tail.place!.alongM, rear.place!.alongM));
  const ends = tc(rear.role === 'sweep' ? 'Leader to Tail Gunner' : 'Leader to Last Rider');
  const together = meters < TOGETHER_M;
  const label = together ? tc('a few yards') : rulerDistance(meters, opts.metric);

  // Ticks are laid along the leader-to-tail span the dots are placed on (convoyLayout).
  const spanM = Math.max(1, front - tail.place!.alongM);
  const px = toX - fromX;
  const minGap = opts.minTickGap ?? 24;
  const step = together || px <= 0 ? undefined : (opts.metric ? STEPS_METRIC : STEPS_US).find((s) => (s / spanM) * px >= minGap);
  const ticks: number[] = [];
  if (step) for (let d = step; d < spanM - step * 0.35; d += step) ticks.push(Math.round((fromX + (d / spanM) * px) * 10) / 10);
  return { meters, label, ends, fromX, toX, ticks, stepM: ticks.length ? step! : 0 };
}
