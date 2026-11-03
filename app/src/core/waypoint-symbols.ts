/**
 * Waypoint symbols: the picture a rider gives a waypoint (camp, fuel, a gate, a water crossing).
 *
 * The first seven are the original waypoint kinds (ride_waypoints.kind). The others came later
 * (2.1) and live in ride_waypoints.symbol, while kind keeps the nearest original one, so app builds
 * from before 2.1 still draw them (a Gate shows there as a plain Spot, a Water Crossing as a Hazard).
 * The server sets kind from symbol, and clears symbol when an older build changes kind.
 *
 * Every symbol is told apart by its line drawing, never by colour alone, so riders with any kind
 * of colour blindness can read them. Hazards also change the blaze's shape to a warning triangle.
 */

/** The original kinds, the only values ride_waypoints.kind accepts. */
export type WaypointKind = 'spot' | 'camp' | 'fuel' | 'water' | 'view' | 'hazard' | 'parking';

export type WaypointSymbol =
  | WaypointKind
  | 'gate' | 'trailhead' | 'crossing' | 'food' | 'restroom' | 'first_aid' | 'repair' | 'photo';

export type WaypointShape = 'diamond' | 'triangle';

export type WaypointSymbolInfo = {
  symbol: WaypointSymbol;
  label: string;
  /** What older app builds see (ride_waypoints.kind). */
  kind: WaypointKind;
  /** The blaze it's painted on. */
  shape: WaypointShape;
  /** Line drawings on a 24 by 24 grid, stroked, round ends. */
  paths: string[];
  /** Small filled dots on the same grid: [cx, cy, r]. */
  dots?: [number, number, number][];
  /** The drawing on its own (the picker, a stop sign's tag), when the blaze's shape isn't around it. */
  solo?: { paths: string[]; dots?: [number, number, number][] };
};

/** In the order the picker shows them: the everyday ones first, then the rest. */
export const WAYPOINT_SYMBOLS: WaypointSymbolInfo[] = [
  { symbol: 'spot', label: 'Spot', kind: 'spot', shape: 'diamond', paths: [], dots: [[12, 12, 4.5]] },
  { symbol: 'camp', label: 'Camp', kind: 'camp', shape: 'diamond', paths: ['M3.5 19h17', 'M12 5L5 19', 'M12 5l7 14', 'M10 19l2-4.5 2 4.5'] },
  {
    symbol: 'fuel', label: 'Fuel', kind: 'fuel', shape: 'diamond',
    paths: ['M5.5 20V5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V20', 'M4 20h11', 'M8 8.5h4', 'M13.5 10.5h2a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 0 3 0V8L18 5.5'],
  },
  { symbol: 'water', label: 'Water', kind: 'water', shape: 'diamond', paths: ['M12 3.5s-6 6.6-6 10.5a6 6 0 0 0 12 0c0-3.9-6-10.5-6-10.5z'] },
  { symbol: 'food', label: 'Food', kind: 'spot', shape: 'diamond', paths: ['M6.5 3.5v6a2.5 2.5 0 0 0 5 0v-6', 'M9 3.5v17', 'M17 20.5v-17c-2.2 1.2-3.5 4-3.5 7.5H17'] },
  { symbol: 'view', label: 'Viewpoint', kind: 'view', shape: 'diamond', paths: ['M2.5 19l6.5-10 4 6 3-4 5.5 8z'] },
  {
    symbol: 'photo', label: 'Photo Spot', kind: 'view', shape: 'diamond',
    paths: ['M3.5 8.5h3.5l2-3h6l2 3h3.5v11h-17z', 'M12 10.5a3.25 3.25 0 1 0 0 6.5a3.25 3.25 0 1 0 0-6.5z'],
  },
  {
    symbol: 'hazard', label: 'Hazard', kind: 'hazard', shape: 'triangle', paths: ['M12 6.5v6'], dots: [[12, 17, 1.6]],
    solo: { paths: ['M12 4L2.5 20h19z', 'M12 10v4.5', 'M12 17.6v.1'] },
  },
  { symbol: 'crossing', label: 'Water Crossing', kind: 'hazard', shape: 'triangle', paths: ['M5 13c2.3-2 4.7-2 7 0s4.7 2 7 0', 'M5 18c2.3-2 4.7-2 7 0s4.7 2 7 0'] },
  { symbol: 'gate', label: 'Gate', kind: 'spot', shape: 'diamond', paths: ['M4 20V4.5', 'M20 20V4.5', 'M4 8h16', 'M4 15h16', 'M4 15l16-7'] },
  { symbol: 'trailhead', label: 'Trailhead', kind: 'parking', shape: 'diamond', paths: ['M12 21V3.5', 'M12 5.5h6.5l2.5 2.75-2.5 2.75H12', 'M12 13H5.5L3 15.75 5.5 18.5H12'] },
  { symbol: 'parking', label: 'Parking', kind: 'parking', shape: 'diamond', paths: ['M8.5 20V4.5h4.5a4.5 4.5 0 0 1 0 9H8.5'] },
  {
    symbol: 'restroom', label: 'Restroom', kind: 'spot', shape: 'diamond',
    paths: ['M5 8.5h4.5v6.5H5z', 'M6.25 15v5', 'M8.25 15v5', 'M12 3v18', 'M17 8.5l-3 7h6z', 'M16 15.5V20', 'M18 15.5V20'],
    dots: [[7.25, 5, 1.7], [17, 5, 1.7]],
  },
  { symbol: 'first_aid', label: 'First Aid', kind: 'spot', shape: 'diamond', paths: ['M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z'] },
  {
    symbol: 'repair', label: 'Repair', kind: 'spot', shape: 'diamond',
    paths: ['M14.5 4a5 5 0 0 0-4.6 6.9L3.8 17a2.2 2.2 0 0 0 3.2 3.2l6.1-6.1A5 5 0 0 0 20 9.5l-3 3-3-.5-.5-3 3-3A5 5 0 0 0 14.5 4z'],
  },
];

const BY_SYMBOL = new Map(WAYPOINT_SYMBOLS.map((s) => [s.symbol, s]));

export const isWaypointSymbol = (v: unknown): v is WaypointSymbol => typeof v === 'string' && BY_SYMBOL.has(v as WaypointSymbol);

/** Everything about a symbol; anything unknown (a symbol from a newer app build) is a Spot. */
export const symbolInfo = (s: string | null | undefined): WaypointSymbolInfo => BY_SYMBOL.get(s as WaypointSymbol) ?? WAYPOINT_SYMBOLS[0];

/** The symbol a waypoint shows: its symbol when it has one, otherwise its original kind. */
export function waypointSymbol(w: { kind?: string | null; symbol?: string | null }): WaypointSymbol {
  if (isWaypointSymbol(w.symbol)) return w.symbol;
  if (isWaypointSymbol(w.kind)) return w.kind;
  return 'spot';
}

export const symbolLabel = (s: string | null | undefined) => symbolInfo(s).label;

/** The original kind older builds see for a symbol (ride_waypoints.kind). */
export const symbolKind = (s: WaypointSymbol): WaypointKind => symbolInfo(s).kind;

/** The symbol as a standalone SVG string, for web maps drawn with HTML. */
/** The drawing to show: on its blaze, or on its own (solo). */
export function symbolDrawing(s: string | null | undefined, solo = false): { paths: string[]; dots: [number, number, number][] } {
  const info = symbolInfo(s);
  const d = (solo && info.solo) || info;
  return { paths: d.paths, dots: d.dots ?? [] };
}

export function symbolSvgMarkup(s: string | null | undefined, color: string, size: number, solo = false): string {
  const info = symbolDrawing(s, solo);
  const paths = info.paths
    .map((d) => `<path d="${d}" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
    .join('');
  const dots = info.dots.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${paths}${dots}</svg>`;
}

/** The three corners of the hazard triangle filling a square of this size (point up, a little low so it sits centred). */
export function warningTriangle(size: number, inset = 0): string {
  const top = size * 0.06 + inset * 1.6;
  const bottom = size * 0.9 - inset * 0.8;
  const half = (bottom - top) / Math.sqrt(3);
  const c = size / 2;
  return `${c.toFixed(2)},${top.toFixed(2)} ${(c + half).toFixed(2)},${bottom.toFixed(2)} ${(c - half).toFixed(2)},${bottom.toFixed(2)}`;
}
