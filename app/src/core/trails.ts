import type { LatLng } from './geo';
import { distanceM } from './geo';

/**
 * Public trail and road data for the ride maps. Everything here is free U.S. government data
 * with no key: the Forest Service Motor Vehicle Use Map (MVUM), BLM's public route network, and
 * the USGS topo map. Tiles are drawn by the agencies' own map servers in OnMyLead's colors, so
 * nothing about a rider is ever sent: only the map square being looked at.
 */

export type TrailSourceId = 'mvum' | 'blm' | 'fsclosed';
export type BaseMap = 'satellite' | 'topo';

export const FS_MVUM = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer';
export const BLM_ROUTES = 'https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF/MapServer';
/** Forest Service roads; layer 1 is every system road the agency lists as closed to motor vehicles. */
export const FS_ROADS = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer';
export const USGS_TOPO = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';

/** USGS caches its topo to zoom 16; closer than that the phone scales the zoom 16 tile up. */
export const TOPO_MAX_NATIVE_Z = 16;
/** Below zoom 9 a whole state of trails is a grey smear, so the overlay waits until you zoom in. */
export const TRAILS_MIN_Z = 9;

/**
 * Line colors in RGBA, shared with the app's own trail lines (TRAIL_INK) so every source reads as
 * one map. Trails are a bright amber that stands out on forest, desert and snow imagery alike;
 * roads are near white; both sit on a wide navy casing. Closed lines are red dashes on that navy,
 * a barricade look that can't be mistaken for the ride's solid red route.
 */
const INK = {
  trail: [255, 196, 61, 255],
  road: [246, 248, 251, 255],
  closed: [255, 69, 58, 255],
  casing: [10, 22, 38, 215],
  label: [255, 255, 255, 255],
  closedLabel: [255, 138, 128, 255],
};

/** The same colors for lines the app draws itself (OpenStreetMap tracks, seasonal closures, the website). */
export const TRAIL_INK = {
  trail: '#FFC43D',
  road: '#F6F8FB',
  closed: '#FF453A',
  casing: 'rgba(10,22,38,0.84)',
} as const;

type Renderer = { type: 'simple'; symbol: { type: 'esriSLS'; style: string; color: number[]; width: number } };
const line = (color: number[], width: number, style = 'esriSLSSolid'): Renderer => ({
  type: 'simple',
  symbol: { type: 'esriSLS', style, color, width },
});

const label = (expression: string, color = INK.label) => [
  {
    labelExpression: expression,
    labelPlacement: 'esriServerLinePlacementCenterAlong',
    symbol: {
      type: 'esriTS',
      color,
      haloColor: [10, 22, 38, 255],
      haloSize: 2,
      font: { family: 'Arial', size: 10, weight: 'bold' },
    },
    // Names and numbers once you are close enough to read the trail you are on (about zoom 12+).
    minScale: 150000,
  },
];

type UniqueRenderer = {
  type: 'uniqueValue';
  field1: string;
  defaultSymbol: Renderer['symbol'];
  uniqueValueInfos: { value: string; symbol: Renderer['symbol'] }[];
};

type DynamicLayer = {
  id: number;
  source: { type: 'mapLayer'; mapLayerId: number };
  drawingInfo: { renderer: Renderer | UniqueRenderer; showLabels?: boolean; labelingInfo?: ReturnType<typeof label> };
};

/**
 * A cased line: the casing is listed after the line because ArcGIS draws the first layer on top.
 * `top` replaces the plain line renderer (BLM colors its closed routes from the same layer).
 */
function cased(
  baseId: number, mapLayerId: number, color: number[], width: number,
  { style, labelExpression, labelColor, top }: { style?: string; labelExpression?: string; labelColor?: number[]; top?: UniqueRenderer } = {},
): DynamicLayer[] {
  const line1: DynamicLayer = {
    id: baseId,
    source: { type: 'mapLayer', mapLayerId },
    drawingInfo: { renderer: top ?? line(color, width, style) },
  };
  if (labelExpression) {
    line1.drawingInfo.showLabels = true;
    line1.drawingInfo.labelingInfo = label(labelExpression, labelColor);
  }
  return [
    line1,
    { id: baseId + 1, source: { type: 'mapLayer', mapLayerId }, drawingInfo: { renderer: line(INK.casing, width + 2.6) } },
  ];
}

const TRAIL_W = 2.6;
const ROAD_W = 2.2;
const CLOSED_W = 2.2;

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
    // Layer 2 is MVUM trails, layer 1 MVUM roads. Trails sit above roads. Labels read "Name 123".
    dynamicLayers: [
      ...cased(201, 2, INK.trail, TRAIL_W, { style: 'esriSLSDash', labelExpression: '[name] CONCAT " " CONCAT [id]' }),
      ...cased(101, 1, INK.road, ROAD_W, { labelExpression: '[name] CONCAT " " CONCAT [id]' }),
    ],
  },
  blm: {
    id: 'blm',
    name: 'BLM routes',
    attribution: 'Bureau of Land Management',
    service: BLM_ROUTES,
    identifyLayers: [0],
    // Routes BLM's travel plan closes to off-highway vehicles get the closed style.
    dynamicLayers: cased(301, 0, INK.road, ROAD_W, {
      labelExpression: '[ROUTE_PRMRY_NM]',
      top: {
        type: 'uniqueValue',
        field1: 'PLAN_OHV_ROUTE_DSGNTN',
        defaultSymbol: line(INK.road, ROAD_W).symbol,
        uniqueValueInfos: [{ value: 'Closed', symbol: line(INK.closed, CLOSED_W, 'esriSLSDash').symbol }],
      },
    }),
  },
  fsclosed: {
    id: 'fsclosed',
    name: 'Closed Forest Service roads',
    attribution: 'USDA Forest Service roads',
    service: FS_ROADS,
    identifyLayers: [1],
    dynamicLayers: cased(401, 1, INK.closed, CLOSED_W, { style: 'esriSLSDash', labelExpression: '"CLOSED"', labelColor: INK.closedLabel }),
  },
};

/** Closed roads first, so an open trail drawn over the same line wins. */
export const TRAIL_SOURCE_IDS: TrailSourceId[] = ['fsclosed', 'mvum', 'blm'];
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

export type VehicleAccess = {
  vehicle: string;
  dates: string | null;
  /** Its season is over (or not started) on the day looked up. */
  closedNow?: boolean;
};

/** A closure the agency or the map's mappers recorded. Shown in red on the trail card. */
export type Closure = {
  /** "Closed for the Season", "Closed to Motor Vehicles". */
  label: string;
  /** One plain sentence: who says so, and when it opens if the data says. */
  detail: string;
};

export type TrailInfo = {
  /** osm: OpenStreetMap tracks (core/osm-trails), looked up on the phone. */
  source: TrailSourceId | 'osm';
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
  /** Closed today, per the source. Null when the source shows it open or doesn't say. */
  closure: Closure | null;
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


// ---------------------------------------------------------------------------------------------
// Seasonal closures. MVUM lists open dates per vehicle as "MM/DD-MM/DD", sometimes several ranges
// ("01/01-03/31,05/16-12/31"), sometimes wrapping the new year ("12/01-03/14") and sometimes
// typed loosely ("7/01-10/11", spaces for commas). These are the agency's published designations,
// not live gate reports: a trail can still be closed for fire, snow or repairs.

type DayRange = { from: number; to: number };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month and day as one comparable number, 101 to 1231. */
const dayKey = (month: number, day: number) => month * 100 + day;

export function parseDateRanges(text: string | null | undefined): DayRange[] {
  if (!text) return [];
  const out: DayRange[] = [];
  for (const m of text.matchAll(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/g)) {
    const [fm, fd, tm, td] = m.slice(1, 5).map(Number);
    if (fm < 1 || fm > 12 || tm < 1 || tm > 12 || fd < 1 || fd > 31 || td < 1 || td > 31) continue;
    out.push({ from: dayKey(fm, fd), to: dayKey(tm, td) });
  }
  return out;
}

const inRange = (k: number, r: DayRange) => (r.from <= r.to ? k >= r.from && k <= r.to : k >= r.from || k <= r.to);

/** True when `on` falls inside one of the ranges. No readable ranges means open all year. */
export function openOnDay(ranges: DayRange[], on: Date): boolean {
  if (!ranges.length) return true;
  const k = dayKey(on.getMonth() + 1, on.getDate());
  return ranges.some((r) => inRange(k, r));
}

/** The next day one of the ranges starts, as "May 1". */
export function nextOpening(ranges: DayRange[], on: Date): string | null {
  if (!ranges.length) return null;
  const k = dayKey(on.getMonth() + 1, on.getDate());
  const starts = ranges.map((r) => r.from).sort((a, b) => a - b);
  const next = starts.find((s) => s > k) ?? starts[0];
  return `${MONTHS[Math.floor(next / 100) - 1]} ${next % 100}`;
}

/**
 * Whether a seasonal MVUM route is closed on `on`: closed when every vehicle the agency opens it to
 * is outside its dates. Each vehicle's row is marked closedNow too, for the card.
 */
export function mvumSeason(props: Record<string, unknown>, on: Date): { allowed: VehicleAccess[]; closure: Closure | null } {
  const allowed: VehicleAccess[] = [];
  const seasonal = str(props.seasonal)?.toLowerCase() === 'seasonal';
  let openToday = false;
  const all: DayRange[] = [];
  for (const v of MVUM_VEHICLES) {
    if (str(props[v.field])?.toLowerCase() !== 'open') continue;
    const dates = str(props[v.dates]);
    const ranges = seasonal ? parseDateRanges(dates) : [];
    const open = openOnDay(ranges, on);
    openToday ||= open;
    all.push(...ranges);
    allowed.push({ vehicle: v.label, dates, closedNow: seasonal && !open });
  }
  if (!seasonal || !allowed.length || openToday) return { allowed, closure: null };
  const opens = nextOpening(all, on);
  return {
    allowed,
    closure: {
      label: 'Closed for the Season',
      detail: `The Forest Service travel map closes it to every vehicle on this date${opens ? `. It opens again ${opens}` : ''}.`,
    },
  };
}

export function parseMvum(props: Record<string, unknown>, kind: 'trail' | 'road', on = new Date()): TrailInfo {
  const { allowed, closure } = mvumSeason(props, on);
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
    closure,
  };
}

/** A Forest Service system road the agency lists as closed to motor vehicles (maintenance level 1 and similar). */
export function parseFsClosed(props: Record<string, unknown>): TrailInfo {
  const rawName = str(props.name);
  const name = rawName ? titleCase(rawName) : null;
  const id = str(props.id);
  const miles = Number(props.gis_miles ?? props.seg_length);
  return {
    source: 'fsclosed',
    kind: 'road',
    title: name && id && !name.includes(id) ? `${name} (Road ${id})` : name ?? (id ? `Road ${id}` : 'Forest Service road'),
    where: null,
    allowed: [],
    seasonal: false,
    miles: Number.isFinite(miles) && miles > 0 ? Math.round(miles * 10) / 10 : null,
    surface: tidy(props.surface_type),
    attribution: TRAIL_SOURCES.fsclosed.attribution,
    closure: { label: 'Closed to Motor Vehicles', detail: 'The Forest Service lists this road as closed to motorized use.' },
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
    closure: ohv?.toLowerCase() === 'closed' ? { label: 'Closed to Off-Highway Vehicles', detail: "BLM's travel plan closes this route to off-highway vehicles." } : null,
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
      const info =
        r.source === 'mvum' ? parseMvum(props, r.layerId === 2 ? 'trail' : 'road') : r.source === 'fsclosed' ? parseFsClosed(props) : parseBlm(props);
      best = { d, info };
    }
  }
  return best?.info ?? null;
}

// ---------------------------------------------------------------------------------------------
// Seasonal closures drawn on the map. The agency's tiles can't know today's date, so seasonal
// routes in view are fetched as lines (simplified to about 5 m) and the ones closed today are
// drawn over the trail layer in the closed style. Needs a signal; the trail card still says
// "Closed for the Season" from the same dates whenever a lookup works.

/** Closures show from about a county's width in; wider than this the lines are too small to tell apart. */
export const SEASONAL_MIN_Z = 11;
/** Fetched one zoom-11 square at a time (about 12 miles across), so panning reuses what's loaded. */
export const SEASONAL_TILE_Z = 11;
export const SEASONAL_MAX_TILES = 6;

const SEASON_FIELDS = ['objectid', 'id', 'name', 'seasonal', ...MVUM_VEHICLES.flatMap((v) => [v.field, v.dates])];

export function tileBoundsLatLng(t: Tile): Box {
  const n = 2 ** t.z;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { minLat: lat(t.y + 1), maxLat: lat(t.y), minLng: (t.x / n) * 360 - 180, maxLng: ((t.x + 1) / n) * 360 - 180 };
}

/** Seasonal MVUM roads (layer 1) or trails (layer 2) inside one square, as simplified GeoJSON. */
export function seasonalQueryUrl(layerId: number, t: Tile): string {
  const b = tileBoundsLatLng(t);
  const env = [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(6)).join(',');
  return (
    `${FS_MVUM}/${layerId}/query?where=${encodeURIComponent("seasonal='seasonal'")}&geometry=${env}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${SEASON_FIELDS.join(',')}` +
    `&returnGeometry=true&outSR=4326&maxAllowableOffset=0.00005&geometryPrecision=5&resultRecordCount=500&f=geojson`
  );
}

export type ClosedLine = {
  key: string;
  title: string;
  /** "May 1", when the dates say. */
  opens: string | null;
  parts: LatLng[][];
};

/** The seasonal routes in an answer that are closed on `on`. */
export function closedSeasonalLines(features: GeoJsonLine[], layerId: number, on: Date): ClosedLine[] {
  const out: ClosedLine[] = [];
  for (const f of features) {
    const props = f.properties ?? {};
    if (!f.geometry || !mvumSeason(props, on).closure) continue;
    const info = parseMvum(props, layerId === 2 ? 'trail' : 'road', on);
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const parts = lines.map((l) => l.map(([lng, lat]) => ({ lat, lng }))).filter((p) => p.length > 1);
    if (!parts.length) continue;
    const ranges = MVUM_VEHICLES.flatMap((v) => (str(props[v.field])?.toLowerCase() === 'open' ? parseDateRanges(str(props[v.dates])) : []));
    out.push({ key: `mvum${layerId}-${str(props.objectid) ?? str(props.id) ?? out.length}`, title: info.title, opens: nextOpening(ranges, on), parts });
  }
  return out;
}
