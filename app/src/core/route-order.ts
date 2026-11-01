import { formatDistance, metersToMiles } from './geo';
import { miles, type PlacedRider } from './route';

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

const ordinal = (n: number) => {
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};

const short = (m: number) => (metersToMiles(m) < 0.1 ? formatDistance(m) : `${miles(m)} mi`);

/** One line about a rider on the order line, e.g. "Mia · 3rd of 6 · 0.4 mi behind the leader". */
export function describeRank(r: RankedRider, ranked: RankedRider[], name: string, meId?: string): string {
  const who = r.id === meId ? 'You' : name;
  const parts = [who, ranked.length === 1 ? 'only one on the line' : r.rank === 1 ? 'out front' : r.rank === ranked.length ? `last of ${ranked.length}` : `${ordinal(r.rank)} of ${ranked.length}`];
  const leader = ranked.find((x) => x.role === 'leader');
  if (leader && leader.id !== r.id) {
    const d = leader.place!.alongM - r.place!.alongM;
    if (Math.abs(d) < 30) parts.push('with the leader');
    else parts.push(d > 0 ? `${short(d)} behind the leader` : `${short(-d)} ahead of the leader`);
  } else if (!leader && r.rank > 1) {
    parts.push(`${short(r.backM)} back from the front`);
  }
  if (!r.place!.onRoute) parts.push('off the route');
  return parts.join(' · ');
}

/** How spread out the group is, front to rear, e.g. "6 riders over 0.8 mi". Null for under two. */
export function groupSpread(ranked: RankedRider[]): string | null {
  if (ranked.length < 2) return null;
  const span = ranked[ranked.length - 1].backM;
  return `${ranked.length} riders over ${span < 30 ? 'a few yards' : short(span)}`;
}
