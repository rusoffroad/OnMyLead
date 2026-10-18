import type { LatLng } from './geo';
import { OSM_MAX_Z, OSM_MIN_Z } from './osm-trails';
import { boxAround, offlineTilePlan, tileFor, tilesInBox, TOPO_MAX_NATIVE_Z, TRAILS_MIN_Z, type Box, type Tile } from './trails';

/**
 * Downloaded maps for riding with no signal. A download is either a box the rider framed on the
 * map, or the area around a ride's route. Everything comes from free public map services (USGS
 * imagery and topo, Forest Service and BLM trails), saved to the phone as plain map squares.
 */

/** imagery is the USGS aerial photo, used as the satellite map when there is no signal. */
/** osm is OpenStreetMap dirt tracks, saved as vector squares (see core/osm-trails). */
/** fsclosed is the Forest Service's closed roads, drawn in the closed style. */
export type OfflineLayer = 'imagery' | 'topo' | 'mvum' | 'blm' | 'fsclosed' | 'osm';

export const USGS_IMAGERY = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
export const IMAGERY_ATTRIBUTION = 'USGS The National Map: Orthoimagery';
/** USGS caches its aerial photos to zoom 16, like the topo. */
export const IMAGERY_MAX_NATIVE_Z = 16;

/** What riders pick from. "Trails" downloads the Forest Service, BLM and OpenStreetMap layers. */
export type OfflineChoice = 'satellite' | 'topo' | 'trails';
export const OFFLINE_CHOICES: { id: OfflineChoice; label: string; layers: OfflineLayer[] }[] = [
  { id: 'satellite', label: 'Satellite', layers: ['imagery'] },
  { id: 'topo', label: 'Topo', layers: ['topo'] },
  { id: 'trails', label: 'Trails', layers: ['mvum', 'blm', 'fsclosed', 'osm'] },
];

export function layersFor(choices: OfflineChoice[]): OfflineLayer[] {
  return OFFLINE_CHOICES.filter((c) => choices.includes(c.id)).flatMap((c) => c.layers);
}

/**
 * Zooms saved for each layer, matching what Ride Mode shows. Photo and topo go to their sharpest
 * (16); trails stop one short because each trail square is drawn at double resolution, so the map
 * can stretch it one level closer and still read crisply. Closer than these, the map stretches the
 * closest saved square.
 *
 * min: the widest zoom saved. boxMax: the closest zoom saved across a whole ride's box (beyond it a
 * ride only saves a band along the route). max: the closest zoom saved at all.
 */
export const LAYER_ZOOMS: Record<OfflineLayer, { min: number; boxMax: number; max: number }> = {
  imagery: { min: 8, boxMax: 12, max: IMAGERY_MAX_NATIVE_Z },
  topo: { min: 8, boxMax: 12, max: TOPO_MAX_NATIVE_Z },
  mvum: { min: TRAILS_MIN_Z, boxMax: 12, max: 15 },
  blm: { min: TRAILS_MIN_Z, boxMax: 12, max: 15 },
  fsclosed: { min: TRAILS_MIN_Z, boxMax: 12, max: 15 },
  // Track squares only exist at 13 and 14, and the map draws the 14 lines at any closer zoom.
  osm: { min: OSM_MIN_Z, boxMax: OSM_MIN_Z, max: OSM_MAX_Z },
};

/**
 * The most map squares one download may ask a single service for. It keeps a download to a few
 * minutes and a polite load on the agencies' free servers, and caps the phone space used.
 */
export const MAX_TILES_PER_LAYER = 4000;

/** Below this the photo and topo get too blurry to ride by, so a bigger area is refused instead. */
const AREA_MIN_DETAIL: Record<OfflineLayer, number> = { imagery: 14, topo: 14, mvum: 13, blm: 13, fsclosed: 13, osm: OSM_MIN_Z };

/** Average size of one saved square, measured on western public land. Used for estimates only. */
export const AVG_TILE_BYTES: Record<OfflineLayer, number> = { imagery: 25_000, topo: 20_000, mvum: 10_000, blm: 3_000, fsclosed: 3_000, osm: 12_000 };

export type LayerPlan = { layer: OfflineLayer; tiles: Tile[]; maxZ: number };

/**
 * Squares for a framed area: every zoom from the layer's widest to as close as fits under the cap.
 * Returns null when even the minimum useful detail would be over the cap (the area is too big).
 */
export function areaLayerPlan(box: Box, layer: OfflineLayer, cap = MAX_TILES_PER_LAYER): LayerPlan | null {
  const z = LAYER_ZOOMS[layer];
  let tiles: Tile[] = [];
  let maxZ = z.min - 1;
  for (let level = z.min; level <= z.max; level++) {
    if (tiles.length + countInBox(box, level) > cap) break;
    tiles = tiles.concat(tilesInBox(box, level));
    maxZ = level;
  }
  return maxZ >= AREA_MIN_DETAIL[layer] ? { layer, tiles, maxZ } : null;
}

/** Squares for a ride: the padded box at wide zooms, then a band along the route at close zooms. */
export function rideLayerPlan(route: LatLng[], layer: OfflineLayer, cap = MAX_TILES_PER_LAYER): LayerPlan | null {
  const z = LAYER_ZOOMS[layer];
  const tiles = offlineTilePlan(route, { padMiles: 3, minZ: z.min, boxMaxZ: z.boxMax, maxZ: z.max, limit: cap });
  if (!tiles.length) return null;
  return { layer, tiles, maxZ: Math.max(...tiles.map((t) => t.z)) };
}

/** How many squares cover a box at one zoom, without listing them. */
export function countInBox(box: Box, z: number): number {
  const a = tileFor({ lat: box.maxLat, lng: box.minLng }, z);
  const b = tileFor({ lat: box.minLat, lng: box.maxLng }, z);
  return (b.x - a.x + 1) * (b.y - a.y + 1);
}

export type DownloadPlan = { layers: LayerPlan[]; tiles: number; bytes: number; tooBig: OfflineLayer[] };

export function planArea(box: Box, choices: OfflineChoice[]): DownloadPlan {
  return summarize(layersFor(choices).map((l) => [l, areaLayerPlan(box, l)] as const));
}

export function planRide(route: LatLng[], choices: OfflineChoice[]): DownloadPlan {
  return summarize(layersFor(choices).map((l) => [l, rideLayerPlan(route, l)] as const));
}

function summarize(entries: (readonly [OfflineLayer, LayerPlan | null])[]): DownloadPlan {
  const layers = entries.map(([, p]) => p).filter((p): p is LayerPlan => !!p);
  const tiles = layers.reduce((n, p) => n + p.tiles.length, 0);
  const bytes = layers.reduce((n, p) => n + p.tiles.length * AVG_TILE_BYTES[p.layer], 0);
  return { layers, tiles, bytes, tooBig: entries.filter(([, p]) => !p).map(([l]) => l) };
}

/** A route's box, padded the same way its download is. */
export function rideBox(route: LatLng[]): Box | null {
  return boxAround(route, 3);
}

// ---------------------------------------------------------------------------------------------
// Words and numbers for the screens.

export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  if (bytes < 1_000_000_000) {
    const mb = bytes / 1_000_000;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/** Width and height of a box in miles, at its middle. */
export function boxMiles(box: Box): { wide: number; tall: number } {
  const midLat = (box.minLat + box.maxLat) / 2;
  return {
    wide: (box.maxLng - box.minLng) * 69.17 * Math.cos((midLat * Math.PI) / 180),
    tall: (box.maxLat - box.minLat) * 69,
  };
}

export function formatBoxMiles(box: Box): string {
  const { wide, tall } = boxMiles(box);
  const r = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n)));
  return `${r(wide)} × ${r(tall)} Miles`;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.minLat <= b.maxLat && b.minLat <= a.maxLat && a.minLng <= b.maxLng && b.minLng <= a.maxLng;
}

export type DownloadStatus = 'downloading' | 'paused' | 'ready' | 'partial';

/** A download as listed on the phone. */
export type OfflineMap = {
  id: string;
  name: string;
  kind: 'area' | 'ride';
  rideId?: string;
  box: Box;
  choices: OfflineChoice[];
  status: DownloadStatus;
  /** Squares planned, saved, and that failed to download. */
  total: number;
  saved: number;
  failed: number;
  /** Space the saved squares take on the phone. */
  bytes: number;
  createdAt: string;
};

export function statusLine(m: OfflineMap): string {
  const pct = m.total ? Math.floor(((m.saved + m.failed) / m.total) * 100) : 0;
  switch (m.status) {
    case 'downloading':
      return `Downloading, ${pct}%`;
    case 'paused':
      return `Paused at ${pct}%`;
    case 'partial':
      return `${formatBytes(m.bytes)}, ${m.failed} Pieces Missing`;
    default:
      return formatBytes(m.bytes);
  }
}

export function choicesLabel(choices: OfflineChoice[]): string {
  return OFFLINE_CHOICES.filter((c) => choices.includes(c.id)).map((c) => c.label).join(', ');
}

/** When a download finishes: a few missing squares (sea, no coverage) still counts as ready. */
export function finishedStatus(total: number, failed: number): DownloadStatus {
  return failed === 0 || failed / Math.max(1, total) < 0.02 ? 'ready' : 'partial';
}

export const tileKey = (layer: OfflineLayer, t: Tile) => `${layer}/${t.z}/${t.x}/${t.y}`;

/** Squares a deleted download can remove: the ones no other download also uses. */
export function tilesToRemove(mine: string[], others: Iterable<string>): string[] {
  const keep = new Set(others);
  return mine.filter((k) => !keep.has(k));
}
