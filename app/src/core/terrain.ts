import type { LatLng } from './geo';
import { TOPO_MAX_NATIVE_Z, USGS_TOPO, type BaseMap, type Box } from './trails';

/**
 * The Mapbox map every screen draws (Ride Mode, Map Mode, the route builder, waypoints, Find a
 * Ride, the area picker and the website's meeting-point picker), on every device (iPhone and iPad
 * with @rnmapbox/maps, Android the same, the website with mapbox-gl), so a map looks the same
 * everywhere. It has four looks (MapLook): the standard outdoors map for Free riders, Satellite,
 * Topo (the USGS topo map drawn over Mapbox) and 3D Terrain: the satellite map draped over the
 * real shape of the land, with contour lines and peak heights, tilted. Everything here is plain
 * data shared by the native and web maps, so it is written and tested once.
 *
 * Mapbox is free up to 25,000 monthly riders on the apps and 50,000 website map loads a month.
 * The owner can switch Mapbox off for everyone with the `mapbox_maps` flag (Admin > Settings) and
 * 3D Terrain alone with `terrain_3d`; with no Mapbox token in the build nothing here is used and
 * the Apple, Google and Leaflet maps draw instead (the flat maps), as before 2.1.
 */

/** How the map looks: what Free riders get, then the three Map Style choices. */
export type MapLook = 'standard' | 'satellite' | 'topo' | 'terrain';

/** Mapbox's outdoors style: roads, trails, contours and hillshade on a light map. */
export const OUTDOORS_STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';

/** Satellite photos with roads and place names, Mapbox's own style. */
export const TERRAIN_STYLE_URL = 'mapbox://styles/mapbox/satellite-streets-v12';
/** Land height, read by the map to raise the ground. */
export const DEM_TILESET = 'mapbox://mapbox.mapbox-terrain-dem-v1';
/** Contour lines (layer `contour`, height in meters every 10 m, index lines every 50 m or so). */
export const CONTOUR_TILESET = 'mapbox://mapbox.mapbox-terrain-v2';
/** Peaks and their heights (layer `natural_label`, maki "mountain" or "volcano"). */
export const STREETS_TILESET = 'mapbox://mapbox.mapbox-streets-v8';

/** The Mapbox style each look starts from (Topo draws the USGS map over it, 3D Terrain raises it). */
export const MAPBOX_STYLES: Record<MapLook, string> = {
  standard: OUTDOORS_STYLE_URL,
  satellite: TERRAIN_STYLE_URL,
  topo: OUTDOORS_STYLE_URL,
  terrain: TERRAIN_STYLE_URL,
};

export function mapboxStyleFor(look: MapLook): string {
  return MAPBOX_STYLES[look];
}

/** The look a rider's Map Style choice gives: Free riders get the standard map (map layers are Pro). */
export function lookFor(base: BaseMap, layersPro: boolean): MapLook {
  return layersPro ? base : 'standard';
}

/** The look for a map that stays flat (the route builder, waypoints): 3D Terrain shows as plain satellite there. */
export function flatLook(look: MapLook): MapLook {
  return look === 'terrain' ? 'satellite' : look;
}

/** How far the map tilts for a look: only 3D Terrain is tilted. */
export function lookPitch(look: MapLook): number {
  return look === 'terrain' ? TERRAIN_PITCH : 0;
}

/** The USGS topo map as a Mapbox raster source, drawn over the outdoors style for the Topo look. */
export const TOPO_SOURCE_ID = 'oml-usgs-topo';
export const TOPO_LAYER_ID = 'oml-usgs-topo-layer';
export const TOPO_RASTER_SOURCE = { type: 'raster', tiles: [USGS_TOPO], tileSize: 256, maxzoom: TOPO_MAX_NATIVE_Z } as const;

/**
 * Whether Mapbox draws the map now. With signal, whenever this build and the owner allow it. With
 * no signal only over an area whose 3D Terrain was downloaded (Mapbox's own pack holds the
 * satellite photos and land height for Satellite and 3D Terrain): anywhere else, or in the Topo
 * and standard looks, the flat map shows, since it has the squares downloaded on the phone.
 * Before the map knows where it is (`center` null) with no signal, it stays flat.
 */
export function mapboxDraws(opts: { available: boolean; look: MapLook; offline: boolean; center: LatLng | null; saved: Box[] }): boolean {
  if (!opts.available) return false;
  if (!opts.offline) return true;
  if (opts.look !== 'satellite' && opts.look !== 'terrain') return false;
  const c = opts.center;
  return !!c && opts.saved.some((b) => insideBox(c, b));
}

/** A circle on the ground as a GeoJSON polygon (`n` corners), for a Mapbox fill layer. */
export function circlePolygon(center: LatLng, meters: number, n = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const latR = meters / 111_320;
  const lngR = meters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    ring.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** Raised half again above real life, which reads as true on a phone-sized screen. */
export const TERRAIN_EXAGGERATION = 1.5;
/** How far the map tilts when 3D Terrain opens, in degrees from straight down. */
export const TERRAIN_PITCH = 60;
/** Mapbox lets the map tilt to 85; past about 75 a phone shows mostly sky. */
export const TERRAIN_MAX_PITCH = 75;
/** The most the terrain is raised, at the steepest tilt. */
export const TERRAIN_MAX_EXAGGERATION = 3;

/**
 * How much to raise the terrain for a tilt (degrees from straight down): true to life looking
 * down, the usual 1.5x where 3D Terrain opens, and up to 3x as a two-finger drag tilts the map
 * further, so the steepness grows with the view.
 */
export function terrainExaggeration(pitch: number): number {
  const p = Math.max(0, Math.min(TERRAIN_MAX_PITCH, pitch));
  const ex = p <= TERRAIN_PITCH
    ? 1 + (TERRAIN_EXAGGERATION - 1) * (p / TERRAIN_PITCH)
    : TERRAIN_EXAGGERATION + (TERRAIN_MAX_EXAGGERATION - TERRAIN_EXAGGERATION) * ((p - TERRAIN_PITCH) / (TERRAIN_MAX_PITCH - TERRAIN_PITCH));
  // In steps, so a map isn't re-rendered for every fraction of a degree.
  return Math.round(ex * 20) / 20;
}

/** Source and layer ids the app adds on top of Mapbox's style. */
export const TERRAIN_IDS = {
  dem: 'oml-dem',
  contours: 'oml-contours',
  streets: 'oml-streets',
  contourLine: 'oml-contour-line',
  contourIndex: 'oml-contour-index',
  contourLabel: 'oml-contour-label',
  peaks: 'oml-peaks',
} as const;

const FEET_PER_METER = 3.28084;

export function metersToFeet(m: number): number {
  return Math.round(m * FEET_PER_METER);
}

/** "10,482 ft", the way peak heights read in the app. */
export function feetLabel(m: number): string {
  return `${metersToFeet(m).toLocaleString('en-US')} ft`;
}

// A Mapbox style expression for a contour's height in feet, with a thousands comma.
const FEET_EXPR = ['number-format', ['round', ['*', ['get', 'ele'], FEET_PER_METER]], { locale: 'en-US', 'max-fraction-digits': 0 }];

type Layer = Record<string, unknown> & { id: string; type: string; source: string };

/**
 * Contour lines and peaks, in Mapbox style-spec form (the website adds them as is; the apps hand
 * them to @rnmapbox/maps' Style). Contours are thin white lines that stay quiet on satellite
 * photos, with every index line (Mapbox marks about one in five) heavier and labeled in feet.
 * Peaks show their name and height. Lines are hidden zoomed far out, where they would be a smear.
 */
export function terrainLayers(): Layer[] {
  return [
    {
      id: TERRAIN_IDS.contourLine,
      type: 'line',
      source: TERRAIN_IDS.contours,
      'source-layer': 'contour',
      minzoom: 11,
      filter: ['!=', ['get', 'index'], 5],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.18, 14, 0.32], 'line-width': 0.7 },
    },
    {
      id: TERRAIN_IDS.contourIndex,
      type: 'line',
      source: TERRAIN_IDS.contours,
      'source-layer': 'contour',
      minzoom: 10,
      filter: ['==', ['get', 'index'], 5],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 14, 0.55], 'line-width': 1.3 },
    },
    {
      id: TERRAIN_IDS.contourLabel,
      type: 'symbol',
      source: TERRAIN_IDS.contours,
      'source-layer': 'contour',
      minzoom: 13,
      filter: ['==', ['get', 'index'], 5],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['concat', FEET_EXPR, ' ft'],
        'text-size': 11,
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-max-angle': 25,
        'text-padding': 30,
      },
      paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(10,22,38,0.85)', 'text-halo-width': 1.2 },
    },
    {
      id: TERRAIN_IDS.peaks,
      type: 'symbol',
      source: TERRAIN_IDS.streets,
      'source-layer': 'natural_label',
      minzoom: 9,
      filter: ['match', ['get', 'maki'], ['mountain', 'volcano'], true, false],
      layout: {
        'text-field': [
          'format',
          ['coalesce', ['get', 'name_en'], ['get', 'name']], { 'font-scale': 1 },
          '\n', {},
          ['case', ['has', 'elevation_m'], ['concat', ['number-format', ['round', ['*', ['get', 'elevation_m'], FEET_PER_METER]], { locale: 'en-US', 'max-fraction-digits': 0 }], ' ft'], ''],
          { 'font-scale': 0.85 },
        ],
        'text-size': 13,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-anchor': 'bottom',
        'text-offset': [0, -0.4],
        'text-max-width': 9,
      },
      paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(10,22,38,0.92)', 'text-halo-width': 1.6 },
    },
  ];
}

/** The sources terrainLayers() reads, plus the land height for the 3D ground. */
export const TERRAIN_SOURCES = {
  [TERRAIN_IDS.dem]: { type: 'raster-dem', url: DEM_TILESET, tileSize: 512, maxzoom: 14 },
  [TERRAIN_IDS.contours]: { type: 'vector', url: CONTOUR_TILESET },
  [TERRAIN_IDS.streets]: { type: 'vector', url: STREETS_TILESET },
} as const;

/**
 * Mapbox's zoom counts 512-point squares; the trail layers (core/trails mapZoom, Leaflet) count
 * 256-point squares, one level more for the same view.
 */
export function trailZoomFromMapbox(z: number): number {
  return z + 1;
}

export type FlatRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/**
 * The area a tilted map covers, as if it were looking straight down from the same zoom. The trail
 * loaders size their work by it; a tilted map's real corners reach the horizon, which would ask
 * for a whole state of trails.
 */
export function regionFromCamera(center: LatLng, mapboxZoom: number, size: { width: number; height: number }): FlatRegion {
  const degPerPt = 360 / (512 * 2 ** mapboxZoom);
  const longitudeDelta = degPerPt * Math.max(1, size.width);
  const latitudeDelta = degPerPt * Math.max(1, size.height) * Math.cos((center.lat * Math.PI) / 180);
  return { latitude: center.lat, longitude: center.lng, latitudeDelta, longitudeDelta };
}

/** Meters one screen point covers at a latitude and Mapbox zoom (looking straight down). */
export function metersPerPointAt(lat: number, mapboxZoom: number): number {
  return (78_271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** mapboxZoom;
}

/** Mapbox zoom that shows `region` across `widthPts` (for opening on a framed spot). */
export function mapboxZoomFor(longitudeDelta: number, widthPts: number): number {
  return Math.log2((360 / Math.max(1e-9, longitudeDelta)) * (Math.max(1, widthPts) / 512));
}

/**
 * The agencies' trail squares (core/trails trailTileTemplate) asked for by Mapbox, which fills in
 * the square's box itself.
 */
export function mapboxTileTemplate(template: string): string {
  return template.replace('{minX},{minY},{maxX},{maxY}', '{bbox-epsg-3857}');
}

export function insideBox(p: LatLng, b: Box): boolean {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}

/**
 * Whether the 3D map is drawn now. With signal, whenever the rider picked it. With no signal only
 * over an area whose 3D Terrain was downloaded: anywhere else the flat map shows instead, since it
 * has the downloaded satellite photos, topo and trails (the 3D map would be blank there).
 * Before the map knows where it is (`center` null) with no signal, it stays flat.
 */
export function terrainShows(opts: {
  picked: boolean;
  available: boolean;
  offline: boolean;
  center: LatLng | null;
  saved: Box[];
}): boolean {
  return opts.picked && mapboxDraws({ available: opts.available, look: 'terrain', offline: opts.offline, center: opts.center, saved: opts.saved });
}

/** Zooms a 3D Terrain download keeps: from a whole region down to riding close. */
export const TERRAIN_PACK_ZOOMS = { min: 8, max: 15 } as const;

/** A download's box as Mapbox's [northeast, southwest] corners in [lng, lat]. */
export function packBounds(b: Box): [[number, number], [number, number]] {
  return [[b.maxLng, b.maxLat], [b.minLng, b.minLat]];
}

/** Mapbox's own name for one OnMyLead download's 3D pack. */
export function packName(downloadId: string): string {
  return `oml-${downloadId}`;
}

/** Lines in GeoJSON for a Mapbox shape source (one feature per piece, `[lng, lat]` order). */
export function linesGeoJSON(
  pieces: { key: string; points: LatLng[]; props?: Record<string, string | number | boolean | null> }[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: pieces
      .filter((p) => p.points.length > 1)
      .map((p) => ({
        type: 'Feature',
        id: p.key,
        properties: { key: p.key, ...(p.props ?? {}) },
        geometry: { type: 'LineString', coordinates: p.points.map((q) => [q.lng, q.lat]) },
      })),
  };
}

/** Points in GeoJSON (trail name tags). */
export function pointsGeoJSON(
  points: { key: string; at: LatLng; props?: Record<string, string | number | boolean | null> }[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      id: p.key,
      properties: { key: p.key, ...(p.props ?? {}) },
      geometry: { type: 'Point', coordinates: [p.at.lng, p.at.lat] },
    })),
  };
}

export const EMPTY_LINES: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: 'FeatureCollection', features: [] };

/**
 * Camera padding so a centered spot sits in the middle of the map the panels leave open. Mapbox
 * takes it directly (no reading points back from the map, as Apple and Google Maps need).
 */
export function cameraPadding(inset: { top: number; right: number; bottom: number; left: number }, size: { width: number; height: number }) {
  // Never more than the map itself minus a sliver, or Mapbox ignores the move.
  const w = Math.max(1, size.width);
  const h = Math.max(1, size.height);
  const left = Math.max(0, Math.min(inset.left, w * 0.8));
  const right = Math.max(0, Math.min(inset.right, w * 0.8 - left));
  const top = Math.max(0, Math.min(inset.top, h * 0.8));
  const bottom = Math.max(0, Math.min(inset.bottom, h * 0.8 - top));
  return { paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left };
}

/** True when a bounds box holds every point within about 300 m (fit would zoom in past the photos). */
export function tightPoints(pts: LatLng[]): boolean {
  if (!pts.length) return true;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  return Math.max(...lats) - Math.min(...lats) < 0.003 && Math.max(...lngs) - Math.min(...lngs) < 0.003;
}

/** [northeast, southwest] corners around points (`[lng, lat]`), padded to about 800 m when tight. */
export function fitCorners(pts: LatLng[]): [[number, number], [number, number]] | null {
  if (!pts.length) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (tightPoints(pts)) {
    const lat = (minLat + maxLat) / 2;
    const lng = (minLng + maxLng) / 2;
    return [[lng + 0.007, lat + 0.007], [lng - 0.007, lat - 0.007]];
  }
  return [[maxLng, maxLat], [minLng, minLat]];
}
