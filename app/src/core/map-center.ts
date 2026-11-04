import type { LatLng } from './geo';

export type Inset = { top: number; right: number; bottom: number; left: number };
export type Point = { x: number; y: number };

/** Below this much open map (pt) in either direction, centre on the whole map instead. */
export const MIN_OPEN_MAP = 120;

/**
 * Where on the map view a point should land so it sits in the middle of the part riders can
 * see, between the panels drawn over the map. Falls back to the map's own middle when the
 * panels leave too little room for that to mean anything.
 */
export function openMapCenter(size: { width: number; height: number }, inset: Inset): Point {
  const w = size.width - inset.left - inset.right;
  const h = size.height - inset.top - inset.bottom;
  return {
    x: w >= MIN_OPEN_MAP ? inset.left + w / 2 : size.width / 2,
    y: h >= MIN_OPEN_MAP ? inset.top + h / 2 : size.height / 2,
  };
}

/**
 * The camera centre that puts `target` at the open map's middle.
 *
 * `here` is the coordinate under the map's own middle and `there` the coordinate under the open
 * map's middle, both read from the map now (so a rotated map is handled). Moving the camera by
 * here - there carries whatever is at `there` to the middle; applied at `target`, that lands the
 * rider in the open map. North-south steps grow with latitude on the map's Mercator projection,
 * so that step is scaled from `here`'s latitude to the target's.
 */
export function cameraCenterFor(target: LatLng, here: LatLng, there: LatLng): LatLng {
  const lat = target.lat + (here.lat - there.lat) * (mercatorStretch(here.lat) / mercatorStretch(target.lat));
  const lng = wrapLng(target.lng + wrapLng(here.lng - there.lng));
  return { lat: Math.max(-85, Math.min(85, lat)), lng };
}

/** How much one degree of latitude is stretched on a Mercator map at this latitude. */
function mercatorStretch(lat: number) {
  return 1 / Math.cos((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
}

function wrapLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** How wide (m) the map opens around a rider: about 10 miles, close enough that trails show. */
export const RIDE_VIEW_M = 16_000;

/**
 * Wider than this (map zoom, see core/trails mapZoom) is "zoomed far out": about 30 miles across
 * a phone. Centering on a rider from there also zooms in to RIDE_VIEW_M, since a dot over a whole
 * state or continent tells them nothing.
 */
export const FAR_OUT_ZOOM = 10;

/** Two corners RIDE_VIEW_M apart with `p` in the middle, for fitting the map to. */
export function rideViewCorners(p: LatLng, spanM = RIDE_VIEW_M): [LatLng, LatLng] {
  const dLat = spanM / 2 / 111_320;
  const lat = Math.max(-85, Math.min(85, p.lat));
  const dLng = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  return [
    { lat: Math.max(-85, lat - dLat), lng: wrapLng(p.lng - dLng) },
    { lat: Math.min(85, lat + dLat), lng: wrapLng(p.lng + dLng) },
  ];
}

/**
 * Whether the map is too far out to just slide over to a rider. `region` is the map's last
 * reported region, or null before it has reported one (a fresh map opens over the whole world).
 */
export function isFarOut(region: { longitudeDelta: number } | null, mapWidthPts: number): boolean {
  if (!region) return true;
  const zoom = Math.log2((360 / Math.max(1e-6, region.longitudeDelta)) * (Math.max(1, mapWidthPts) / 256));
  return zoom < FAR_OUT_ZOOM;
}

/**
 * The padding to fit the map with so the fitted spot lands in the open map between the panels.
 * An axis the panels leave too little of is not padded at all (the map's own middle is used, as
 * in openMapCenter); padding past the map's size makes Android's map refuse to move.
 */
export function fitInset(size: { width: number; height: number }, inset: Inset): Inset {
  const clamp = (n: number) => Math.max(0, Math.round(n));
  const w = size.width - inset.left - inset.right;
  const h = size.height - inset.top - inset.bottom;
  return {
    top: h >= MIN_OPEN_MAP ? clamp(inset.top) : 0,
    bottom: h >= MIN_OPEN_MAP ? clamp(inset.bottom) : 0,
    left: w >= MIN_OPEN_MAP ? clamp(inset.left) : 0,
    right: w >= MIN_OPEN_MAP ? clamp(inset.right) : 0,
  };
}

/**
 * What Ride Mode's map does when it opens, once per visit: center on the rider's own spot as soon
 * as one is known and the map is ready, unless the rider has already moved the map themselves.
 */
export function shouldCenterOnOpen(s: { done: boolean; userMoved: boolean; mapReady: boolean; at: LatLng | null }): boolean {
  return !s.done && !s.userMoved && s.mapReady && s.at != null;
}

/**
 * Map Mode's opening camera: the map opens on the rider at riding zoom the first time their
 * location is known, even when that first fix lands after the map is ready (a cold start with no
 * GPS fix yet) or the phone's map drops the first move (Android ignores camera moves sent before it
 * has laid out, and stayed on the whole state). The move is checked against where the map ended up
 * and sent again, a few times at most, until the map is really on the rider. Once the rider moves
 * the map by hand (or searches for a place), the opening camera leaves the map alone.
 */
export type OpeningCamera = { done: boolean; userMoved: boolean; tries: number };
export const OPENING_START: OpeningCamera = { done: false, userMoved: false, tries: 0 };
/** Riding zoom the map opens at (degrees of latitude across). */
export const OPENING_DELTA = 0.04;
export const OPENING_MAX_TRIES = 8;
/** How long to wait after a move before checking it landed. */
export const OPENING_CHECK_MS = 700;

export type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** Whether to (re)send the opening move now. */
export function openingMoveWanted(s: OpeningCamera, center: LatLng | null): boolean {
  return !!center && !s.done && !s.userMoved && s.tries < OPENING_MAX_TRIES;
}

/** Whether the map shows `target` near its middle at about riding zoom (not the whole state). */
export function openingReached(region: MapRegion | null, target: LatLng): boolean {
  if (!region) return false;
  if (!(region.latitudeDelta <= OPENING_DELTA * 2)) return false;
  return (
    Math.abs(region.latitude - target.lat) <= region.latitudeDelta / 4 &&
    Math.abs(wrapLng(region.longitude - target.lng)) <= region.longitudeDelta / 4
  );
}
