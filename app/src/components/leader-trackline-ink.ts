/**
 * The Leader Trackline's look (core/leader-trackline), shared by every Ride Mode map: the fresh
 * line in the leader dot's own color (rider-puck puckInk, so Color Blind Mode and any later change
 * follow it) over a dark casing, and the older passes faded, thinner and dashed under it, so where
 * two passes share a trail the bright solid one is always the newest. No map library here, so the
 * website's Mapbox map can use it too (leader-trackline.tsx draws it on the flat native maps).
 */
import { mix } from '@/core/color';
import type { TracklinePieces } from '@/core/leader-trackline';
import type { MapLine } from './mapbox-map-types';
import { puckInk } from './rider-puck';

/** The map is the same in every theme, so the casing is the same deep navy as the leader puck's. */
const CASING = '#061223';
const OLD_DASH = [5, 6];

export function tracklineInk() {
  const fresh = puckInk('leader');
  return {
    fresh,
    old: mix(fresh, '#8D99AB', 0.6),
    casing: CASING,
    freshWidth: 4,
    freshCasing: 7,
    oldWidth: 3,
    oldCasing: 5,
    oldDash: OLD_DASH,
  };
}

/**
 * The trackline as Mapbox lines, old first so the fresh line sits on top. Both are always there
 * (empty when off): native Mapbox puts a line that appears later on top of the others, so an old
 * pass that showed up after the fresh one would be drawn over it.
 */
export function tracklineMapLines(t: TracklinePieces | null | undefined): MapLine[] {
  const ink = tracklineInk();
  return [
    { id: 'leader-trackline-old', points: t?.old ?? [], color: ink.old, width: ink.oldWidth, casing: ink.casing, casingWidth: ink.oldCasing, dash: ink.oldDash },
    { id: 'leader-trackline', points: t?.fresh ?? [], color: ink.fresh, width: ink.freshWidth, casing: ink.casing, casingWidth: ink.freshCasing },
  ];
}
