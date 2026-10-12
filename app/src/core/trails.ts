import type { LatLng } from './geo';
import { distanceM } from './geo';

/**
 * Public trail and road data for the ride maps. Everything here is free U.S. government data
 * with no key: the Forest Service Motor Vehicle Use Map (MVUM), BLM's public route network, and
 * the USGS topo map. Tiles are drawn by the agencies' own map servers in OnMyLead's colors, so
 * nothing about a rider is ever sent: only the map square being looked at.
 */

export type TrailSourceId = 'mvum' | 'blm';
export type BaseMap = 'satellite' | 'topo';

export const FS_MVUM = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer';
export const BLM_ROUTES = 'https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF/MapServer';
export const USGS_TOPO = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';

/** USGS caches its topo to zoom 16; closer than that the phone scales the zoom 16 tile up. */
export const TOPO_MAX_NATIVE_Z = 16;
/** Below zoom 9 a whole state of trails is a grey smear, so the overlay waits until you zoom in. */
export const TRAILS_MIN_Z = 9;

/** Line colors in RGBA. Neutral "map ink" so the group's colors and the ride route stay the loud things. */
const INK = {
  trail: [236, 205, 145, 255], // sand, dashed: dirt trails
  road: [232, 236, 242, 255], // pale grey, solid: forest and BLM roads
  casing: [10, 22, 38, 170], // the app's navy, so lines read on bright desert imagery
  label: [255, 255, 255, 255],
};

type Renderer = { type: 'simple'; symbol: { type: 'esriSLS'; style: string; color: number[]; width: number } };
const line = (color: number[], width: number, style = 'esriSLSSolid'): Renderer => ({
  type: 'simple',
  symbol: { type: 'esriSLS', style, color, width },
});

const label = (field: string) => [
  {
    labelExpression: `[${field}]`,
    labelPlacement: 'esriServerLinePlacementCenterAlong',
    symbol: {
      type: 'esriTS',
      color: INK.label,
      haloColor: [10, 22, 38, 255],
      haloSize: 1.5,
      font: { family: 'Arial', size: 8, weight: 'bold' },
    },
    // Route numbers only once you are close enough to read the trail you are on (about zoom 12+).
    minScale: 150000,
  },
];

type DynamicLayer = {
  id: number;
  source: { type: 'mapLayer'; mapLayerId: number };
  drawingInfo: { renderer: Renderer; showLabels?: boolean; labelingInfo?: ReturnType<typeof label> };
};

/** A cased line: the casing is listed after the line because ArcGIS draws the first layer on top. */
function cased(baseId: number, mapLayerId: number, color: number[], width: number, style?: string, labelField?: string): DynamicLayer[] {
  const top: DynamicLayer = {
    id: baseId,
    source: { type: 'mapLayer', mapLayerId },
    drawingInfo: { renderer: line(color, width, style) },
  };
  if (labelField) {
    top.drawingInfo.showLabels = true;
    top.drawingInfo.labelingInfo = label(labelField);
  }
  return [
    top,
    { id: baseId + 1, source: { type: 'mapLayer', mapLayerId }, drawingInfo: { renderer: line(INK.casing, width + 1.8) } },
  ];
}

export type TrailSource = {
  id: TrailSourceId;
  name: string;
  /** Shown on the map whenever the layer is on. Agencies ask for credit; it also tells riders where the lines came from. */
  attribution: string;
  service: string;
  /** Layers queried when a rider taps the map. */
  identifyLayers: number[];
  dynamicLayers: DynamicLayer[];
};

export const TRAIL_SOURCES: Record<TrailSourceId, TrailSource> = {
  mvum: {
    id: 'mvum',
    name: 'Forest Service roads and trails',
    attribution: 'USDA Forest Service MVUM',
    service: FS_MVUM,
    identifyLayers: [2, 1],
    // Layer 2 is MVUM trails, layer 1 MVUM roads. Trails sit above roads.
    dynamicLayers: [...cased(201, 2, INK.trail, 1.8, 'esriSLSDash', 'id'), ...cased(101, 1, INK.road, 1.6, undefined, 'id')],
  },
  blm: {
    id: 'blm',
    name: 'BLM routes',
    attribution: 'Bureau of Land Management',
    service: BLM_ROUTES,
    identifyLayers: [0],
    dynamicLayers: cased(301, 0, INK.road, 1.6, undefined, 'ROUTE_PRMRY_NM'),
  },
};

export const TRAIL_SOURCE_IDS: TrailSourceId[] = ['mvum', 'blm'];
export const TOPO_ATTRIBUTION = 'USGS The National Map';

/**
 * Tile URL template for react-native-maps' WMSTile ({minX}..{maxY} are Web Mercator meters).
 * Asks for a 512 px image at 192 dpi for each 256 pt tile, so lines stay crisp on Retina screens.
 */
export function trailTileTemplate(source: TrailSource): string {
  const dynamic = encodeURIComponent(JSON.stringify(source.dynamicLayers));
  return (
    `${source.service}/export?bbox={minX},{minY},{maxX},{maxY}&bboxSR=3857&imageSR=3857` +
    `&size=512,512&dpi=192&format=png32&transparent=true&dynamicLayers=${dynamic}&f=image`
  );
}

/** The same URL with a real tile's box filled in, for saving tiles ahead of a ride. */
export function fillTemplate(template: string, t: Tile): string {
  const [minX, minY, maxX, maxY] = tileBoundsMercator(t);
  return template
    .replace('{minX}', minX.toFixed(2))
    .replace('{minY}', minY.toFixed(2))
    .replace('{maxX}', maxX.toFixed(2))
    .replace('{maxY}', maxY.toFixed(2))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y))
    .replace('{z}', String(t.z));
}

// ---------------------------------------------------------------------------------------------
// Tile math (standard Web Mercator z/x/y, the same scheme Apple and Google maps request).

export type Tile = { z: number; x: number; y: number };
const HALF_WORLD = 20037508.342789244;

export function tileFor(p: LatLng, z: number): Tile {
  const n = 2 ** z;
  const lat = Math.max(-85.0511, Math.min(85.0511, p.lat));
  const x = Math.floor(((p.lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** [minX, minY, maxX, maxY] in Web Mercator meters. */
export function tileBoundsMercator({ z, x, y }: Tile): [number, number, number, number] {
  const size = (2 * HALF_WORLD) / 2 ** z;
  return [-HALF_WORLD + x * size, HALF_WORLD - (y + 1) * size, -HALF_WORLD + (x + 1) * size, HALF_WORLD - y * size];
}

export type Box = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function boxAround(points: LatLng[], padMiles: number): Box | null {
  if (!points.length) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const padLat = padMiles / 69;
  const midLat = (minLat + maxLat) / 2;
  const padLng = padMiles / (69 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)));
  return { minLat: minLat - padLat, minLng: minLng - padLng, maxLat: maxLat + padLat, maxLng: maxLng + padLng };
}

export function tilesInBox(box: Box, z: number): Tile[] {
  const a = tileFor({ lat: box.maxLat, lng: box.minLng }, z);
  const b = tileFor({ lat: box.minLat, lng: box.maxLng }, z);
  const out: Tile[] = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ z, x, y });
  return out;
}

/**
 * Tiles to save so a ride's map works with no signal. Wide zooms cover the padded box; the close
 * zooms (where riders actually read trails) only cover tiles the route passes through and their
 * neighbours, which keeps a 60-mile ride to a few hundred tiles instead of tens of thousands.
 */
export function offlineTilePlan(
  route: LatLng[],
  { padMiles = 3, minZ = 10, boxMaxZ = 12, maxZ = 15, limit = 2500 }: { padMiles?: number; minZ?: number; boxMaxZ?: number; maxZ?: number; limit?: number } = {},
): Tile[] {
  const box = boxAround(route, padMiles);
  if (!box) return [];
  const seen = new Set<string>();
  const out: Tile[] = [];
  const add = (t: Tile) => {
    const k = `${t.z}/${t.x}/${t.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };
  for (let z = minZ; z <= Math.min(boxMaxZ, maxZ); z++) tilesInBox(box, z).forEach(add);
  const dense = densify(route, 150);
  for (let z = boxMaxZ + 1; z <= maxZ; z++) {
    for (const p of dense) {
      const c = tileFor(p, z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) add({ z, x: c.x + dx, y: c.y + dy });
    }
  }
  // Wide zooms come first, so a capped plan still gives a usable map everywhere on the ride.
  return out.slice(0, limit);
}

/** Extra points so no gap along the route is longer than stepM (a straight segment can cross many tiles). */
export function densify(route: LatLng[], stepM: number): LatLng[] {
  if (route.length < 2) return route.slice();
  const out: LatLng[] = [route[0]];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const n = Math.ceil(distanceM(a, b) / stepM);
    for (let k = 1; k <= n; k++) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tap a line to see what it is.

/** About how many meters one screen point covers at this map width (from the visible region). */
export function metersPerPoint(region: { latitude: number; longitudeDelta: number }, mapWidthPts: number): number {
  return (region.longitudeDelta * 111_320 * Math.cos((region.latitude * Math.PI) / 180)) / Math.max(1, mapWidthPts);
}

/** ArcGIS query URL for lines within radiusM of a tap, returned as GeoJSON in lat/lng. */
export function identifyUrl(source: TrailSource, layerId: number, p: LatLng, radiusM: number): string {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.1, Math.cos((p.lat * Math.PI) / 180)));
  const env = [p.lng - dLng, p.lat - dLat, p.lng + dLng, p.lat + dLat].map((n) => n.toFixed(6)).join(',');
  return (
    `${source.service}/${layerId}/query?geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=10&f=geojson`
  );
}

export type GeoJsonLine = {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: { type: 'LineString'; coordinates: number[][] } | { type: 'MultiLineString'; coordinates: number[][][] } | null;
};

/** Meters from p to the nearest point of a (Multi)LineString, on a local flat projection. */
export function distanceToLineM(p: LatLng, geometry: GeoJsonLine['geometry']): number {
  if (!geometry) return Infinity;
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110_574;
  let best = Infinity;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      const ax = (part[i][0] - p.lng) * kx;
      const ay = (part[i][1] - p.lat) * ky;
      if (part.length === 1 || i === part.length - 1) {
        best = Math.min(best, Math.hypot(ax, ay));
        continue;
      }
      const bx = (part[i + 1][0] - p.lng) * kx;
      const by = (part[i + 1][1] - p.lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

export type VehicleAccess = { vehicle: string; dates: string | null };

export type TrailInfo = {
  source: TrailSourceId;
  kind: 'trail' | 'road';
  /** "Trail 145" or the route's name. */
  title: string;
  /** Forest and district, or the BLM state. */
  where: string | null;
  /** Vehicles the agency allows, in plain words, with open dates when seasonal. Empty when the data does not say. */
  allowed: VehicleAccess[];
  seasonal: boolean;
  miles: number | null;
  surface: string | null;
  attribution: string;
};

/** MVUM vehicle columns in the order riders think about them, with plain names. */
const MVUM_VEHICLES: { field: string; dates: string; label: string }[] = [
  { field: 'atv', dates: 'atv_datesopen', label: 'ATVs (50" or less)' },
  { field: 'motorcycle', dates: 'motorcycle_datesopen', label: 'Dirt bikes' },
  { field: 'other_ohv_gt50inches', dates: 'other_ohv_gt50_datesopen', label: 'Side-by-sides over 50"' },
  { field: 'other_ohv_lt50inches', dates: 'other_ohv_lt50_datesopen', label: 'Side-by-sides 50" or less' },
  { field: 'fourwd_gt50inches', dates: 'fourwd_gt50_datesopen', label: '4x4s' },
  { field: 'highclearancevehicle', dates: 'highclearancevehicle_datesopen', label: 'High-clearance vehicles' },
  { field: 'passengervehicle', dates: 'passengervehicle_datesopen', label: 'Passenger cars' },
  { field: 'tracked_ohv_gt50inches', dates: 'tracked_ohv_gt50_datesopen', label: 'Tracked vehicles over 50"' },
  { field: 'tracked_ohv_lt50inches', dates: 'tracked_ohv_lt50_datesopen', label: 'Tracked vehicles 50" or less' },
  { field: 'e_bike_class1', dates: 'e_bike_class1_dur', label: 'E-bikes (class 1)' },
];

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== 'null' ? s : null;
};

/** "FS - FOREST SERVICE" style codes drop their prefix; capitals become title case. */
function tidy(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const words = s.includes(' - ') ? s.split(' - ').slice(1).join(' - ') : s;
  return titleCase(words);
}

/** "SPUR 42633A" reads as "Spur 42633A": words with digits (route numbers) stay as they are. */
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .split(' ')
    .map((w) => (/\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

export function parseMvum(props: Record<string, unknown>, kind: 'trail' | 'road'): TrailInfo {
  const allowed: VehicleAccess[] = [];
  for (const v of MVUM_VEHICLES) {
    if (str(props[v.field])?.toLowerCase() === 'open') allowed.push({ vehicle: v.label, dates: str(props[v.dates]) });
  }
  const rawName = str(props.name);
  const name = rawName ? titleCase(rawName) : null;
  const id = str(props.id);
  const word = kind === 'trail' ? 'Trail' : 'Road';
  const title =
    name && id && !name.includes(id) ? `${name} (${word} ${id})` : name ?? (id ? `${word} ${id}` : `Forest Service ${kind}`);
  const where = [str(props.forestname), str(props.districtname)].filter(Boolean).join(', ') || null;
  const miles = Number(props.gis_miles ?? props.seg_length);
  return {
    source: 'mvum',
    kind,
    title,
    where,
    allowed,
    seasonal: str(props.seasonal)?.toLowerCase() === 'seasonal',
    miles: Number.isFinite(miles) && miles > 0 ? Math.round(miles * 10) / 10 : null,
    surface: tidy(props.surfacetype),
    attribution: TRAIL_SOURCES.mvum.attribution,
  };
}

export function parseBlm(props: Record<string, unknown>): TrailInfo {
  const mode = tidy(props.PLAN_MODE_TRNSPRT) ?? tidy(props.OBSRVE_MODE_TRNSPRT);
  const ohv = str(props.PLAN_OHV_ROUTE_DSGNTN);
  const allowed: VehicleAccess[] = mode ? [{ vehicle: mode, dates: null }] : [];
  const miles = Number(props.GIS_MILES ?? props.BLM_MILES);
  return {
    source: 'blm',
    kind: /trail|single track|atv|motorcycle/i.test(mode ?? '') ? 'trail' : 'road',
    title: tidy(props.ROUTE_PRMRY_NM) ?? 'BLM route',
    where: str(props.ADMIN_ST) ? `BLM land, ${str(props.ADMIN_ST)}` : 'BLM land',
    allowed,
    seasonal: !!str(props.PLAN_SEASON_RSTRCT_CODE) && !/^n/i.test(str(props.PLAN_SEASON_RSTRCT_CODE)!),
    miles: Number.isFinite(miles) && miles > 0 ? Math.round(miles * 10) / 10 : null,
    surface: tidy(props.OBSRVE_SRFCE_TYPE),
    attribution: ohv ? `${TRAIL_SOURCES.blm.attribution} (OHV: ${ohv})` : TRAIL_SOURCES.blm.attribution,
  };
}

/** Pick the line nearest the tap from every source's answer, within maxM. */
export function nearestTrail(
  p: LatLng,
  results: { source: TrailSourceId; layerId: number; features: GeoJsonLine[] }[],
  maxM: number,
): TrailInfo | null {
  let best: { d: number; info: TrailInfo } | null = null;
  for (const r of results) {
    for (const f of r.features) {
      const d = distanceToLineM(p, f.geometry);
      if (d > maxM || (best && d >= best.d)) continue;
      const props = f.properties ?? {};
      const info = r.source === 'mvum' ? parseMvum(props, r.layerId === 2 ? 'trail' : 'road') : parseBlm(props);
      best = { d, info };
    }
  }
  return best?.info ?? null;
}
