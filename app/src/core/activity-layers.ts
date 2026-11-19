/**
 * Activity map layers (4.0, Chris 2026-11-19): each activity's map looks like its sport.
 *
 * Snowmobile: Snow on the Ground (NOAA's daily snow analysis, drawn as a white frost), Sled Trails
 * (Forest Service trails managed for snowmobiles), Avalanche Danger (today's forecast from the US
 * avalanche centers), Snow Depth Stations (NRCS SNOTEL) and Falling Snow (Mapbox's snow effect
 * while it is snowing where the map is; the apps only).
 * Motorcycle: Twisty Roads, scored on the phone from the paved roads on screen.
 * Road Trip: Scenic Byways (US DOT) and Campgrounds (OpenStreetMap).
 *
 * Offroad has none: its map is exactly what riders had before Activities. The layers sit beside the
 * Map Features (core/map-features.ts); they are never part of the car map (CarPlay is unchanged).
 * Every layer is on by default for its activity, free for every rider, and the rider can switch
 * each one off in Map Features.
 *
 * Pure, so it is tested without a phone (core/__tests__/activity-layers.test.ts).
 */

import type { ActivityId } from './activities';
import { cased, exportTemplate, FS_TRAILS } from './trails';

export type ActivityLayerId =
  | 'snowDepth' | 'sledTrails' | 'avalanche' | 'snowStations' | 'fallingSnow'
  | 'twistyRoads'
  | 'byways' | 'campgrounds';

export type ActivityLayerDef = {
  id: ActivityLayerId;
  activity: ActivityId;
  /** Title Case, the switch in Map Features. */
  name: string;
  /** One line under the name. */
  line: string;
  /** The swatch beside the switch: the colour it draws in. */
  swatch: string;
  /** The website draws it too (Falling Snow needs the apps' newer Mapbox). */
  web: boolean;
  /** Credit shown on the map while it is on. */
  attribution: string;
};

/** Ice blue for sled trails, matching the Snowmobile accent. */
export const SLED_INK = '#7CC4FF';
/** Twisty Roads: three oranges from gentle to tight (Motorcycle's burnt orange in the middle). */
export const TWISTY_INK = ['#FFB067', '#E8641C', '#C2185B'] as const;
/** Scenic Byways and Campgrounds: Road Trip's gold. */
export const BYWAY_INK = '#E8B23A';
export const CAMP_INK = '#F2C46B';

export const ACTIVITY_LAYERS: ActivityLayerDef[] = [
  { id: 'snowDepth', activity: 'snowmobile', name: 'Snow on the Ground', line: 'Where there is snow today, as a white frost.', swatch: '#F4F8FF', web: true, attribution: 'NOAA NOHRSC snow analysis' },
  { id: 'sledTrails', activity: 'snowmobile', name: 'Sled Trails', line: 'Forest Service trails groomed or managed for snowmobiles.', swatch: SLED_INK, web: true, attribution: 'USDA Forest Service trails' },
  { id: 'avalanche', activity: 'snowmobile', name: 'Avalanche Danger', line: "Today's danger from the local avalanche center.", swatch: '#F7941E', web: true, attribution: 'avalanche.org' },
  { id: 'snowStations', activity: 'snowmobile', name: 'Snow Depth Stations', line: 'Measured snow depth at mountain weather stations.', swatch: '#FFFFFF', web: true, attribution: 'NRCS SNOTEL' },
  { id: 'fallingSnow', activity: 'snowmobile', name: 'Falling Snow', line: 'Snow falls on the map when it is snowing there.', swatch: '#DDE9F7', web: false, attribution: 'National Weather Service' },
  { id: 'twistyRoads', activity: 'motorcycle', name: 'Twisty Roads', line: 'Paved roads with the most curves, tighter in deeper colour.', swatch: TWISTY_INK[1], web: true, attribution: '© OpenStreetMap contributors' },
  { id: 'byways', activity: 'road_trip', name: 'Scenic Byways', line: 'National and state scenic byways.', swatch: BYWAY_INK, web: true, attribution: 'US DOT Scenic Byways' },
  { id: 'campgrounds', activity: 'road_trip', name: 'Campgrounds', line: 'Campgrounds and RV parks.', swatch: CAMP_INK, web: true, attribution: '© OpenStreetMap contributors' },
];

export const ACTIVITY_LAYER_BY_ID = Object.fromEntries(ACTIVITY_LAYERS.map((l) => [l.id, l])) as Record<ActivityLayerId, ActivityLayerDef>;

/** Where the rider's switches live; it follows the account (core/synced-settings.ts). */
export const ACTIVITY_LAYERS_KEY = 'map.activityLayers.v1';

/** Only what the rider switched off is kept; anything unknown or missing is on. */
export type ActivityLayerChoices = Partial<Record<ActivityLayerId, boolean>>;

export function readActivityLayerChoices(raw: string | null | undefined): ActivityLayerChoices {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: ActivityLayerChoices = {};
    for (const l of ACTIVITY_LAYERS) if (typeof v[l.id] === 'boolean') out[l.id] = v[l.id] as boolean;
    return out;
  } catch {
    return {};
  }
}

/** The switches Map Features shows for an activity (none for Offroad). */
export function activityLayerDefs(activity: ActivityId, web = false): ActivityLayerDef[] {
  return ACTIVITY_LAYERS.filter((l) => l.activity === activity && (!web || l.web));
}

/** The layers to draw now: the activity's, minus any the rider switched off. Nothing with no signal (they all stream). */
export function activityLayersShown(activity: ActivityId, choices: ActivityLayerChoices, { web = false, offline = false } = {}): ActivityLayerId[] {
  if (offline) return [];
  return activityLayerDefs(activity, web).filter((l) => choices[l.id] !== false).map((l) => l.id);
}

// ---------------------------------------------------------------------------------------------
// Squares drawn by a map server (raster layers).

export type ActivityRaster = {
  id: 'snowDepth' | 'sledTrails' | 'byways';
  /** Changes when the picture behind it changes, so the map loads it fresh. */
  key: string;
  /** Mapbox tile URL ({bbox-epsg-3857}). */
  template: string;
  tileSize: number;
  minZ: number;
  /** Squares are asked for up to here and stretched past it (smooths the coarse snow grid). */
  maxZ: number;
  /** Mapbox raster paint, in style-spec names. */
  paint: Record<string, number>;
  /** Under the trail lines (snow), or over them. */
  under: boolean;
};

export const NOHRSC = 'https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer';
export const SCENIC_BYWAYS = 'https://geo.dot.gov/server/rest/services/US_Scenic_Byways/MapServer';
const SIX_HOURS = 6 * 3600_000;

/**
 * NOAA's snow depth grid (layer 0, about 1 km, lower 48, new four times a day). Its own colours are
 * blues; the map takes the colour out and lifts it to white (see ACTIVITY_RASTER paint), so it reads
 * as frost on the ground. The six-hour stamp makes the map fetch the new analysis.
 */
export function snowDepthTemplate(now: Date): string {
  const stamp = Math.floor(now.getTime() / SIX_HOURS);
  return `${NOHRSC}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:0&f=image&t=${stamp}`;
}

/** Forest Service trails with a snowmobile season (snowmobile_managed, about 49,000 miles), ice blue on navy, named. */
export const SLED_TRAIL_WHERE = 'snowmobile_managed IS NOT NULL';
export function sledTrailsTemplate(): string {
  const layers = cased(601, 0, [124, 196, 255, 255], 2.6, { where: SLED_TRAIL_WHERE, labelExpression: '[trail_name]' })
    .map(({ feature: _f, ...rest }) => rest);
  return exportTemplate(FS_TRAILS, layers).replace('{minX},{minY},{maxX},{maxY}', '{bbox-epsg-3857}').replace('size=512,512', 'size=1024,1024');
}

/**
 * Every state's byways (group layer 1). The DOT draws them green; the map turns that hue to Road
 * Trip's gold (raster-hue-rotate), so no server of ours is needed in between.
 */
export function bywaysTemplate(): string {
  return `${SCENIC_BYWAYS}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=1024,1024&dpi=192&format=png32&transparent=true&layers=show:1&f=image`;
}

/** DOT green (hue about 167°) turned to gold (about 41°). */
export const BYWAY_HUE_ROTATE = 234;

export function activityRasters(shown: readonly ActivityLayerId[], now: Date): ActivityRaster[] {
  const out: ActivityRaster[] = [];
  if (shown.includes('snowDepth')) {
    const template = snowDepthTemplate(now);
    out.push({
      id: 'snowDepth', key: `snowDepth-${template.slice(-8)}`, template, tileSize: 256, minZ: 3, maxZ: 8, under: true,
      paint: { 'raster-opacity': 0.62, 'raster-saturation': -1, 'raster-brightness-min': 0.82, 'raster-brightness-max': 1, 'raster-contrast': -0.2, 'raster-resampling-linear': 1 },
    });
  }
  if (shown.includes('byways')) {
    out.push({
      id: 'byways', key: 'byways', template: bywaysTemplate(), tileSize: 512, minZ: 5, maxZ: 22, under: false,
      paint: { 'raster-opacity': 1, 'raster-hue-rotate': BYWAY_HUE_ROTATE, 'raster-saturation': 0.35, 'raster-brightness-min': 0.25 },
    });
  }
  if (shown.includes('sledTrails')) {
    out.push({ id: 'sledTrails', key: 'sledTrails', template: sledTrailsTemplate(), tileSize: 512, minZ: 8, maxZ: 22, under: false, paint: { 'raster-opacity': 1 } });
  }
  return out;
}

/** Style-spec raster paint for React Native Mapbox (camelCase); `raster-resampling-linear` becomes rasterResampling. */
export function rnRasterPaint(paint: Record<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(paint)) {
    if (k === 'raster-resampling-linear') continue;
    out[k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v;
  }
  out.rasterFadeDuration = 0;
  return out;
}

/** The same for mapbox-gl on the website (its 2.x has no raster-resampling). */
export function webRasterPaint(paint: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(paint)) if (k !== 'raster-resampling-linear') out[k] = v;
  out['raster-fade-duration'] = 0;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Avalanche Danger (avalanche.org's public map layer: one shape per forecast zone).

export const AVALANCHE_URL = 'https://api.avalanche.org/v2/public/products/map-layer';

export type DangerLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5;
/** North American Public Avalanche Danger Scale names. */
const DANGER_NAMES: Record<number, string> = { 1: 'Low', 2: 'Moderate', 3: 'Considerable', 4: 'High', 5: 'Extreme' };
/** The scale's own colours, used when a zone sends none. */
export const DANGER_COLORS: Record<number, string> = { 1: '#50B848', 2: '#FFF200', 3: '#F7941E', 4: '#ED1C24', 5: '#231F20' };
const NO_RATING = '#8A94A3';

export function dangerName(level: number): string {
  return DANGER_NAMES[level] ?? 'No Rating';
}

export type AvalancheZone = {
  name: string;
  center: string;
  link: string;
  level: DangerLevel;
  color: string;
  offSeason: boolean;
  travelAdvice: string;
  /** Outer rings, [lng, lat]. */
  polygons: number[][][][];
};

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseAvalanche(body: unknown): AvalancheZone[] {
  const fs = (body as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(fs)) return [];
  const out: AvalancheZone[] = [];
  for (const f of fs as Json[]) {
    const g = f?.geometry as { type?: string; coordinates?: unknown } | undefined;
    const p = (f?.properties ?? {}) as Json;
    let polygons: number[][][][] = [];
    if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) polygons = [g.coordinates as number[][][]];
    else if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)) polygons = g.coordinates as number[][][][];
    if (!polygons.length) continue;
    const raw = Number(p.danger_level);
    const level = (Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : raw === 0 ? 0 : -1) as DangerLevel;
    const offSeason = p.off_season === true;
    const color = level >= 1 ? (/^#[0-9a-f]{6}$/i.test(str(p.color)) ? str(p.color) : DANGER_COLORS[level]) : NO_RATING;
    out.push({
      name: str(p.name), center: str(p.center), link: str(p.link) || str(p.center_link), level, color, offSeason,
      travelAdvice: str(p.travel_advice), polygons,
    });
  }
  return out;
}

/** The zones as map shapes: rated zones tinted by danger, the rest a faint outline. */
export function avalancheGeoJSON(zones: AvalancheZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'MultiPolygon', coordinates: z.polygons },
      properties: {
        name: z.name,
        color: z.color,
        rated: z.level >= 1 && !z.offSeason,
        label: z.level >= 1 && !z.offSeason ? `${z.name}\n${dangerName(z.level)}` : z.name,
      },
    })),
  };
}

function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The forecast zone a spot is in (holes count as outside), or null. */
export function zoneAt(zones: AvalancheZone[], p: { lat: number; lng: number }): AvalancheZone | null {
  for (const z of zones) {
    for (const poly of z.polygons) {
      if (!poly.length || !inRing(p.lng, p.lat, poly[0])) continue;
      if (poly.slice(1).some((hole) => inRing(p.lng, p.lat, hole))) continue;
      return z;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Snow Depth Stations (NRCS SNOTEL, about 900 stations in 13 western states).

export const AWDB = 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1';
/** Stations show from this Mapbox zoom (a state or so across). */
export const STATIONS_MIN_Z = 6;

/** The SNOTEL states and roughly where they are [minLng, minLat, maxLng, maxLat], so a map asks only for those it shows. */
export const SNOTEL_STATES: Record<string, [number, number, number, number]> = {
  AK: [-170, 51, -129, 71.5], AZ: [-115, 31.3, -109, 37], CA: [-124.5, 32.5, -114, 42], CO: [-109.1, 36.9, -102, 41.1],
  ID: [-117.3, 41.9, -111, 49], MT: [-116.1, 44.3, -104, 49], NV: [-120, 35, -114, 42], NM: [-109.1, 31.3, -103, 37.1],
  OR: [-124.6, 41.9, -116.4, 46.3], SD: [-104.1, 42.4, -96.4, 46], UT: [-114.1, 36.9, -109, 42.1], WA: [-124.8, 45.5, -116.9, 49],
  WY: [-111.1, 40.9, -104, 45.1],
};

export type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export function snotelStatesIn(box: Box): string[] {
  return Object.entries(SNOTEL_STATES)
    .filter(([, [w, s, e, n]]) => box.minLng <= e && box.maxLng >= w && box.minLat <= n && box.maxLat >= s)
    .map(([st]) => st);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function snotelStationsUrl(state: string): string {
  return `${AWDB}/stations?stationTriplets=*:${state}:SNTL&activeOnly=true&returnForecastPointMetadata=false&returnReservoirMetadata=false&returnStationElements=false`;
}

/** The last three days of snow depth (SNWD, inches), so a station that hasn't reported today still shows its latest. */
export function snotelDepthUrl(state: string, now: Date): string {
  const from = new Date(now.getTime() - 3 * 86400_000);
  return `${AWDB}/data?stationTriplets=*:${state}:SNTL&elements=SNWD&duration=DAILY&beginDate=${ymd(from)}&endDate=${ymd(now)}`;
}

export type SnowStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevationFt: number | null;
  /** Latest snow depth, inches. */
  depthIn: number;
  /** Change since the reading before it, inches (null with only one reading). */
  changeIn: number | null;
  date: string;
};

export function parseSnotel(stations: unknown, data: unknown): SnowStation[] {
  if (!Array.isArray(stations) || !Array.isArray(data)) return [];
  const depth = new Map<string, { date: string; value: number }[]>();
  for (const row of data as Json[]) {
    const id = str(row?.stationTriplet);
    const series = Array.isArray(row?.data) ? (row.data as Json[]).find((d) => (d?.stationElement as Json | undefined)?.elementCode === 'SNWD') : undefined;
    const values = Array.isArray(series?.values) ? (series.values as Json[]) : [];
    const ok = values
      .filter((v) => typeof v?.value === 'number' && Number.isFinite(v.value) && (v.value as number) >= 0 && typeof v.date === 'string')
      .map((v) => ({ date: v.date as string, value: v.value as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (id && ok.length) depth.set(id, ok);
  }
  const out: SnowStation[] = [];
  for (const s of stations as Json[]) {
    const id = str(s?.stationTriplet);
    const lat = Number(s?.latitude);
    const lng = Number(s?.longitude);
    const readings = depth.get(id);
    if (!id || !readings || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const last = readings[readings.length - 1];
    const prev = readings.length > 1 ? readings[readings.length - 2] : null;
    const elev = Number(s?.elevation);
    out.push({
      id, name: str(s?.name), lat, lng, elevationFt: Number.isFinite(elev) ? Math.round(elev) : null,
      depthIn: Math.round(last.value), changeIn: prev ? Math.round(last.value - prev.value) : null, date: last.date,
    });
  }
  return out;
}

/** Stations as map points: the depth as the label ("24″", "24″ +6"), bare ground faded. */
export function stationsGeoJSON(stations: SnowStation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        depth: s.depthIn,
        bare: s.depthIn === 0,
        label: s.changeIn && s.changeIn > 0 ? `${s.depthIn}″ +${s.changeIn}` : `${s.depthIn}″`,
      },
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Snow where the map or the rider is: NOAA's snow analysis for the depth, the National Weather
// Service for falling snow and the next day's snowfall. Both are US government data, free for any
// use (unlike free weather APIs that exclude apps with subscriptions).

/** NOAA's snow depth at a spot (layer 3 is the depth grid itself; its pixel value is metres). */
export function snowDepthAtUrl(lat: number, lng: number): string {
  const x = lng.toFixed(3);
  const y = lat.toFixed(3);
  return `${NOHRSC}/identify?geometry=${x},${y}&geometryType=esriGeometryPoint&sr=4326&layers=all:3&tolerance=1` +
    `&mapExtent=${(lng - 0.5).toFixed(3)},${(lat - 0.5).toFixed(3)},${(lng + 0.5).toFixed(3)},${(lat + 0.5).toFixed(3)}&imageDisplay=400,400,96&returnGeometry=false&f=json`;
}

/** Inches of snow on the ground, or null outside the grid (the lower 48 only). */
export function parseSnowDepthAt(body: unknown): number | null {
  const r = (body as { results?: { attributes?: Json }[] } | null)?.results?.[0]?.attributes;
  const raw = r?.['Service Pixel Value'];
  const v = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(v) || v < 0 || v > 50) return null;
  return Math.round(v * 39.37);
}

export function nwsPointUrl(lat: number, lng: number): string {
  return `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** The hourly forecast and the forecast grid for a spot (from the points answer). */
export function parseNwsPoint(body: unknown): { hourly: string; grid: string } | null {
  const p = (body as { properties?: Json } | null)?.properties;
  const hourly = str(p?.forecastHourly);
  const grid = str(p?.forecastGridData);
  return hourly.startsWith('https://api.weather.gov/') && grid.startsWith('https://api.weather.gov/') ? { hourly, grid } : null;
}

/** The hour now: snowing when its forecast says snow or flurries; the temperature with it. */
export function parseNwsNow(body: unknown, now: Date): { snowing: boolean; tempF: number | null } | null {
  const periods = (body as { properties?: { periods?: Json[] } } | null)?.properties?.periods;
  if (!Array.isArray(periods)) return null;
  const t = now.getTime();
  const p = periods.find((x) => Date.parse(str(x.startTime)) <= t && t < Date.parse(str(x.endTime))) ?? periods[0];
  if (!p) return null;
  const temp = Number(p.temperature);
  const tempF = Number.isFinite(temp) ? Math.round(str(p.temperatureUnit) === 'C' ? temp * 1.8 + 32 : temp) : null;
  return { snowing: /snow|flurr|blizzard/i.test(str(p.shortForecast)), tempF };
}

/** ISO 8601 durations as the forecast grid writes them (PT6H, P1DT6H). */
function durationMs(d: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(d);
  if (!m) return 0;
  return ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 60_000;
}

/** Snow forecast for the next 24 hours, inches (each forecast block counted for the part inside the day). */
export function parseNwsSnowfall(body: unknown, now: Date): number | null {
  const sf = (body as { properties?: { snowfallAmount?: { uom?: string; values?: Json[] } } } | null)?.properties?.snowfallAmount;
  if (!sf || !Array.isArray(sf.values)) return null;
  const toIn = (v: number) => (/mm$/.test(sf.uom ?? 'mm') ? v / 25.4 : /cm$/.test(sf.uom ?? '') ? v / 2.54 : v);
  const from = now.getTime();
  const to = from + 24 * 3600_000;
  let total = 0;
  for (const row of sf.values) {
    const [start, dur] = str(row.validTime).split('/');
    const a = Date.parse(start);
    const len = durationMs(dur ?? '');
    const v = Number(row.value);
    if (!Number.isFinite(a) || !len || !Number.isFinite(v) || v <= 0) continue;
    const overlap = Math.min(to, a + len) - Math.max(from, a);
    if (overlap > 0) total += toIn(v) * (overlap / len);
  }
  return Math.round(total * 10) / 10;
}

export type SnowReport = {
  /** Snow is falling there now. */
  snowing: boolean;
  /** Snow on the ground, inches (null outside NOAA's grid). */
  depthIn: number | null;
  /** Snow forecast for the next 24 hours, inches (null when the forecast has none for here). */
  next24In: number | null;
  tempF: number | null;
};

/** Mapbox's snow effect (the apps only): thicker the closer in, as the effect is made for. */
export const FALLING_SNOW_STYLE = {
  density: ['interpolate', ['linear'], ['zoom'], 7, 0, 10, 0.45, 14, 0.85],
  intensity: 0.8,
  color: '#FFFFFF',
  opacity: 0.85,
  vignette: 0.15,
} as const;

// ---------------------------------------------------------------------------------------------
// Twisty Roads: the curviest paved roads on screen, scored on the phone.

/** Twisty Roads show from this Mapbox zoom (the map tiles carry secondary roads from 9, tertiary from 11, minor from 12). */
export const TWISTY_MIN_Z = 9;
/** Paved roads a rider would ride for fun; motorways and trunks are left out. */
export const TWISTY_CLASSES = ['primary', 'secondary', 'tertiary', 'minor'];
/** OpenFreeMap filter for those roads (unpaved ones are Offroad's). */
export const TWISTY_FILTER = ['all', ['in', ['get', 'class'], ['literal', TWISTY_CLASSES]], ['!=', ['get', 'surface'], 'unpaved']];
export const OSM_ROADS_LAYER = 'transportation';

/** Degrees of turning per kilometre for each level (gentle, twisty, tight). */
export const TWISTY_LEVELS = [140, 260, 420];
/** A piece shorter than this is a bend, not a twisty road. */
export const TWISTY_MIN_M = 800;
const WINDOW_M = 500;
export type TwistyPiece = { key: string; points: [number, number][]; level: 1 | 2 | 3; meters: number };

/** Wobble in the drawing (a straight road nudged a few metres) is smoothed away first. */
const SIMPLIFY_M = 6;

/** Flat metres around a spot (good for the few kilometres of one road). */
function toXY(pts: [number, number][]): [number, number][] {
  const lat0 = (pts[0][1] * Math.PI) / 180;
  return pts.map(([lng, lat]) => [lng * 111_320 * Math.cos(lat0), lat * 110_540]);
}

/** Douglas-Peucker: the indexes of the points that keep the line within `tol` metres. */
function keepIndexes(xy: [number, number][], tol: number): number[] {
  const keep = new Uint8Array(xy.length);
  keep[0] = 1;
  keep[xy.length - 1] = 1;
  const stack: [number, number][] = [[0, xy.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let farD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/**
 * The road's twisty stretches (indexes into `line`), each with its level, or none. Lines are
 * [lng, lat]. A bend of radius R turns about 57,300 / R degrees per km, so the levels are roughly
 * sweepers under 400 m, curves under 220 m and tight corners under 140 m.
 */
export function twistyStretches(line: [number, number][]): { from: number; to: number; level: 1 | 2 | 3; meters: number }[] {
  if (line.length < 3) return [];
  const all = toXY(line);
  const idx = keepIndexes(all, SIMPLIFY_M);
  const xy = idx.map((i) => all[i]);
  const n = xy.length;
  if (n < 3) return [];
  const along = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const total = along[n - 1];
  if (total < TWISTY_MIN_M) return [];
  const turn = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a = Math.atan2(xy[i][1] - xy[i - 1][1], xy[i][0] - xy[i - 1][0]);
    const b = Math.atan2(xy[i + 1][1] - xy[i][1], xy[i + 1][0] - xy[i][0]);
    let d = Math.abs(((b - a) * 180) / Math.PI);
    if (d > 180) d = 360 - d;
    // A near reversal at one point is a junction or a drawing fault, not a corner.
    turn[i] = d > 150 ? 0 : d;
  }
  // Each segment's score: degrees turned per km in the window around its middle.
  const level = new Array<0 | 1 | 2 | 3>(n - 1).fill(0);
  for (let s = 0; s < n - 1; s++) {
    const mid = (along[s] + along[s + 1]) / 2;
    let lo = Math.max(0, mid - WINDOW_M / 2);
    let hi = Math.min(total, mid + WINDOW_M / 2);
    if (hi - lo < WINDOW_M) {
      if (lo === 0) hi = Math.min(total, WINDOW_M);
      else lo = Math.max(0, total - WINDOW_M);
    }
    let sum = 0;
    for (let i = 1; i < n - 1; i++) if (along[i] >= lo && along[i] <= hi) sum += turn[i];
    const perKm = sum / ((hi - lo) / 1000);
    level[s] = perKm >= TWISTY_LEVELS[2] ? 3 : perKm >= TWISTY_LEVELS[1] ? 2 : perKm >= TWISTY_LEVELS[0] ? 1 : 0;
  }
  const out: { from: number; to: number; level: 1 | 2 | 3; meters: number }[] = [];
  let s = 0;
  while (s < n - 1) {
    if (!level[s]) {
      s++;
      continue;
    }
    let e = s;
    let weighted = 0;
    while (e < n - 1 && level[e]) {
      weighted += level[e] * (along[e + 1] - along[e]);
      e++;
    }
    const meters = along[e] - along[s];
    if (meters >= TWISTY_MIN_M) {
      out.push({ from: idx[s], to: idx[e], level: Math.max(1, Math.min(3, Math.round(weighted / meters))) as 1 | 2 | 3, meters: Math.round(meters) });
    }
    s = e;
  }
  return out;
}

type LineFeature = { geometry?: { type?: string; coordinates?: unknown } | null };

/** Twisty pieces from the road features a map has loaded (lines split at square edges are scored each on their own). */
export function twistyPieces(features: readonly LineFeature[], max = 600): TwistyPiece[] {
  const seen = new Set<string>();
  const out: TwistyPiece[] = [];
  for (const f of features) {
    const g = f?.geometry;
    const lines = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' && Array.isArray(g.coordinates) ? g.coordinates : [];
    for (const raw of lines as unknown[]) {
      if (!Array.isArray(raw) || raw.length < 3) continue;
      const line = (raw as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) as [number, number][];
      // The same line arrives once from each square it crosses.
      const id = `${line[0][0].toFixed(5)},${line[0][1].toFixed(5)}:${line[line.length - 1][0].toFixed(5)},${line[line.length - 1][1].toFixed(5)}:${line.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const st of twistyStretches(line)) {
        out.push({ key: `${id}:${st.from}`, points: line.slice(st.from, st.to + 1), level: st.level, meters: st.meters });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

export function twistyGeoJSON(pieces: TwistyPiece[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pieces.map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p.points }, properties: { key: p.key, level: p.level } })),
  };
}

/** Line colour by level, as a Mapbox expression. */
export const TWISTY_COLOR = ['match', ['get', 'level'], 3, TWISTY_INK[2], 2, TWISTY_INK[1], TWISTY_INK[0]];

// ---------------------------------------------------------------------------------------------
// Campgrounds (OpenStreetMap camp and caravan sites in OpenFreeMap's poi layer).

export const OSM_POI_LAYER = 'poi';
export const CAMP_FILTER = ['==', ['get', 'class'], 'campsite'];
export const CAMPS_MIN_Z = 9;
