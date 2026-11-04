import { tc } from './i18n';

/**
 * Trail width limits: how wide a machine can be and still fit a trail. Pure, no I/O.
 *
 * Where a width comes from, most trusted first:
 * - The Forest Service Motor Vehicle Use Map (MVUM). It doesn't store a width, but its vehicle
 *   classes do: a trail open to ATVs, dirt bikes or side-by-sides "50 inches or less" and to nothing
 *   wider has a 50" limit.
 * - Riders. Anyone signed in can add the width limit they found to a public trail (Forest Service,
 *   BLM or OpenStreetMap). Every rider's entry counts once and the card shows the middle value, so
 *   one wrong entry can't change it. Stored in trail_width_reports (migration 20261103200000).
 * - The mapper of a rider trail, who sets it in the trail's details (shared_trails.max_width_in).
 *
 * OpenStreetMap has a maxwidth tag, but the free map tiles the app draws trails from (OpenFreeMap,
 * OpenMapTiles schema) leave it out, and OpenStreetMap's own query servers don't allow app traffic.
 */

/** Widths riders can enter, in inches (the same range as a rider trail's Width Limit). */
export const WIDTH_MIN_IN = 30;
export const WIDTH_MAX_IN = 120;
/** A Garage vehicle's width can be narrower than any trail limit (a dirt bike's bars). */
export const VEHICLE_WIDTH_MIN_IN = 20;

/** The MVUM's "50 inches or less" classes: open to these and nothing wider means a 50" limit. */
export const MVUM_NARROW_FIELDS = ['atv', 'other_ohv_lt50inches', 'tracked_ohv_lt50inches'] as const;
/** Classes wider than 50", or with no width limit at all. */
export const MVUM_WIDE_FIELDS = [
  'other_ohv_gt50inches', 'fourwd_gt50inches', 'highclearancevehicle', 'passengervehicle', 'tracked_ohv_gt50inches',
] as const;
export const MVUM_LIMIT_IN = 50;

const isOpen = (v: unknown) => v != null && String(v).trim().toLowerCase() === 'open';

/**
 * The width limit an MVUM trail or road's vehicle classes add up to. Null when something wider than
 * 50" may use it, or when it's only open to dirt bikes and e-bikes (a single track, no number given).
 */
export function mvumWidthLimitIn(props: Record<string, unknown>): number | null {
  if (MVUM_WIDE_FIELDS.some((f) => isOpen(props[f]))) return null;
  return MVUM_NARROW_FIELDS.some((f) => isOpen(props[f])) ? MVUM_LIMIT_IN : null;
}

/** Riders' widths are matched to a line by this key. Null when the line has no lasting id (OpenStreetMap). */
export function trailLineKey(source: string, props: Record<string, unknown>): string | null {
  const s = (v: unknown) => (v == null ? '' : String(v).trim());
  if (source === 'mvum' || source === 'fsclosed') {
    const id = s(props.id);
    if (!id || id === 'null') return null;
    // Route numbers repeat across forests.
    const forest = s(props.forestname ?? props.adminforestid ?? props.admin_org);
    return `${id}@${forest}`.slice(0, 80);
  }
  if (source === 'blm') {
    const id = s(props.ROUTE_ID ?? props.GTLF_ID ?? props.OBJECTID);
    return id && id !== 'null' ? `${id}@${s(props.ADMIN_ST)}`.slice(0, 80) : null;
  }
  return null;
}

/** 50 -> 50", 64.4 -> 64". */
export const inches = (n: number) => `${Math.round(n)}"`;

/** Inches and feet, for the trail card: 50" (4 ft 2 in). */
export function widthLabel(n: number): string {
  const r = Math.round(n);
  const ft = Math.floor(r / 12);
  const rest = r % 12;
  return `${r}" (${ft} ft${rest ? ` ${rest} in` : ''})`;
}

export type ParsedWidth = { ok: true; value: number | null } | { ok: false; error: string };

/** What a rider typed in a width box. Empty is "no width". */
export function parseWidth(text: string, min = WIDTH_MIN_IN, max = WIDTH_MAX_IN): ParsedWidth {
  const t = text.trim().replace(/["”]|\s*(in|inch|inches)$/i, '').trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: tc('Enter the width in inches, like 50.') };
  const r = Math.round(n);
  if (r < min || r > max) return { ok: false, error: tc('Width is {min} to {max} inches.', { min, max }) };
  return { ok: true, value: r };
}

/** The middle value, so one wrong entry can't move it (an even count takes the narrower middle). */
export function middleWidth(widths: number[]): number | null {
  const ok = widths.filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  if (!ok.length) return null;
  return ok[Math.floor((ok.length - 1) / 2)];
}

/** trail_width_near()'s answer. */
export type RiderWidths = {
  /** The middle of every rider's width, null when nobody added one. */
  widthIn: number | null;
  count: number;
  /** This rider's own entry. */
  mine: number | null;
};

export const NO_RIDER_WIDTHS: RiderWidths = { widthIn: null, count: 0, mine: null };

export function parseRiderWidths(json: unknown): RiderWidths {
  if (!json || typeof json !== 'object') return NO_RIDER_WIDTHS;
  const o = json as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const count = n(o.count) ?? 0;
  return { widthIn: count > 0 ? n(o.width_in) : null, count, mine: n(o.mine) };
}

export type WidthShown = { widthIn: number; label: string; detail: string };

/**
 * The width a trail card shows. The agency's own limit wins; riders' entries fill in where the
 * agency says nothing. Null when nobody knows.
 */
export function shownWidth(agencyIn: number | null, riders: RiderWidths): WidthShown | null {
  if (agencyIn != null) {
    return {
      widthIn: agencyIn,
      label: tc('{v} Width Limit', { v: inches(agencyIn) }),
      detail:
        riders.widthIn != null && riders.widthIn !== agencyIn
          ? tc('From the Forest Service vehicle rules. Riders report {v}.', { v: inches(riders.widthIn) })
          : tc('From the Forest Service vehicle rules.'),
    };
  }
  if (riders.widthIn != null) {
    return {
      widthIn: riders.widthIn,
      label: tc('{v} Width Limit', { v: inches(riders.widthIn) }),
      detail: riders.count === 1 ? tc('Added by 1 rider.') : tc('Middle of {count} riders\' entries.', { count: riders.count }),
    };
  }
  return null;
}

export type FitVehicle = { id: string; name: string; widthIn: number | null };

export type RigFit = {
  /** Garage machines wider than the limit, narrowest first. */
  tooWide: FitVehicle[];
  /** Garage machines that fit. */
  fits: FitVehicle[];
  /** One plain line for the card, null when there's no limit or no widths in the Garage. */
  line: string | null;
};

/** Which of the rider's Garage machines fit under a width limit. */
export function rigFit(limitIn: number | null, vehicles: FitVehicle[]): RigFit {
  const known = vehicles.filter((v) => v.widthIn != null);
  if (limitIn == null || !known.length) return { tooWide: [], fits: [], line: null };
  const tooWide = known.filter((v) => v.widthIn! > limitIn).sort((a, b) => a.widthIn! - b.widthIn!);
  const fits = known.filter((v) => v.widthIn! <= limitIn);
  let line: string;
  if (!tooWide.length) line = fits.length === 1 ? `Your ${fits[0].name} Fits (${inches(fits[0].widthIn!)})` : 'Your Machines Fit';
  else if (tooWide.length === 1) line = `Your ${tooWide[0].name} Is Too Wide (${inches(tooWide[0].widthIn!)})`;
  else line = fits.length ? `Too Wide: ${tooWide.map((v) => v.name).join(', ')}` : 'Your Machines Are Too Wide';
  return { tooWide, fits, line };
}

/** A Garage vehicle's name for the fit line: nickname, else "make model". */
export function fitName(v: { nickname?: string | null; make?: string | null; model?: string | null }): string {
  return v.nickname?.trim() || [v.make, v.model].filter((s) => s?.trim()).join(' ') || tc('Machine');
}
