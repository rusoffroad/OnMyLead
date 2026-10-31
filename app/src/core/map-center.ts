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
