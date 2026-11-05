import { TRAIL_INK } from './trails';

/**
 * Map Features: what the rider chooses to see on every map, one switch each, grouped as Roads,
 * Trails and Land. The choices are saved with the Map Style (hooks/use-trail-map) and synced to
 * the rider's other devices; every map (Mapbox on iPhone, iPad, Android and the website, and the
 * flat fallback maps) reads them from here, so a switch means the same thing everywhere.
 *
 * Each feature has its own look, drawn the same way in the panel's key and on the map:
 * paved public roads are blue (highways heavier), dirt roads white, street-legal-only roads
 * lavender, off-road trails amber dashes, width-limited trails orange short dashes, hiking trails
 * thin pink dash-dots, closures red dashes, and land is a light tint with a solid edge.
 *
 * Everything is free public data: OpenStreetMap (roads, tracks, paths), the Forest Service and
 * BLM (routes and trails), USGS PAD-US (who manages public land) and, in Texas, the state's
 * free statewide parcel map (property lines). Nothing about the rider is sent: only map squares.
 */

export type MapFeatureId =
  | 'highways'
  | 'roads'
  | 'dirtRoads'
  | 'streetLegal'
  | 'offroad'
  | 'narrow'
  | 'hiking'
  | 'closed'
  | 'riderTrails'
  | 'parkTrails'
  | 'nationalForest'
  | 'blm'
  | 'nationalPark'
  | 'statePark'
  | 'private';

/**
 * One agency map layer to draw (trails or land), for the Map Features that are on. `key` changes
 * with the choices, so a map makes a fresh layer (and a fresh square cache) instead of showing
 * squares drawn for other choices; with every feature of a trail source on it is the source id,
 * the same squares a download saved for riding with no signal.
 */
export type AgencyLayer = { id: string; key: string; template: string; minZ: number; attribution: string; land: boolean };

export type FeatureGroup = 'roads' | 'trails' | 'land';

/** How a feature's line looks (the panel draws its key from this; the maps use the same numbers). */
export type FeatureInk = {
  color: string;
  /** Line width in points. */
  width: number;
  /** Dash pattern in points (dash, gap, ...); none for a solid line. */
  dash?: number[];
  /** Navy casing under the line, so it reads on satellite photos. */
  casing?: boolean;
  /** Land: the tint inside the edge (0 to 1). */
  fill?: number;
};

export type MapFeature = {
  id: MapFeatureId;
  group: FeatureGroup;
  name: string;
  /** One short line under the name: what it shows and where the data comes from. */
  detail: string;
  ink: FeatureInk;
  /** On for a rider who never touched it. Land starts off: it tints the whole map. */
  on: boolean;
};

export const FEATURE_INK = {
  highway: '#3B8CFF',
  road: '#8FC3FF',
  dirtRoad: TRAIL_INK.road,
  streetLegal: '#B9A3FF',
  trail: TRAIL_INK.trail,
  narrow: '#FF7A1A',
  hiking: '#FF5CCB',
  closed: TRAIL_INK.closed,
  rider: '#57E3C3',
  /** Park trails are colored by the park's level (core/park-trails); this is the level 1-2 green, for the key. */
  park: '#3CC36B',
  nationalForest: '#2FB36B',
  blm: '#E0A93B',
  nationalPark: '#9A6BFF',
  statePark: '#1FBFD6',
  private: '#FF6B6B',
} as const;

export const MAP_FEATURES: MapFeature[] = [
  {
    id: 'highways', group: 'roads', name: 'Highways and Freeways', detail: 'Interstates, freeways and major highways.',
    ink: { color: FEATURE_INK.highway, width: 4.5, casing: true }, on: true,
  },
  {
    id: 'roads', group: 'roads', name: 'Paved Public Roads', detail: 'State, county and town roads.',
    ink: { color: FEATURE_INK.road, width: 3, casing: true }, on: true,
  },
  {
    id: 'dirtRoads', group: 'roads', name: 'Dirt Roads', detail: 'Forest Service, BLM and county dirt roads.',
    ink: { color: FEATURE_INK.dirtRoad, width: 2.6, casing: true }, on: true,
  },
  {
    id: 'streetLegal', group: 'roads', name: 'Street-Legal Only', detail: 'Forest roads open only to plated, highway-legal vehicles.',
    ink: { color: FEATURE_INK.streetLegal, width: 2.6, casing: true }, on: true,
  },
  {
    id: 'offroad', group: 'trails', name: 'Off-Road Trails', detail: 'Motorized trails and dirt tracks, with names.',
    ink: { color: FEATURE_INK.trail, width: 3.2, dash: [9, 5], casing: true }, on: true,
  },
  {
    id: 'narrow', group: 'trails', name: 'Width-Limited Trails', detail: 'Open only to vehicles 50" or narrower, or to dirt bikes.',
    ink: { color: FEATURE_INK.narrow, width: 3.2, dash: [4, 3], casing: true }, on: true,
  },
  {
    id: 'hiking', group: 'trails', name: 'Hiking Trails', detail: 'Foot and horse trails. No motor vehicles.',
    ink: { color: FEATURE_INK.hiking, width: 2.2, dash: [6, 2.5, 1, 2.5] }, on: true,
  },
  {
    id: 'closed', group: 'trails', name: 'Closures', detail: 'Closed for the season, closed to vehicles, or private.',
    ink: { color: FEATURE_INK.closed, width: 3.2, dash: [5, 5], casing: true }, on: true,
  },
  {
    id: 'riderTrails', group: 'trails', name: 'Rider Trails', detail: 'Trails OnMyLead riders mapped and shared.',
    ink: { color: FEATURE_INK.rider, width: 4, dash: [0.1, 6], casing: true }, on: true,
  },
  {
    id: 'parkTrails', group: 'trails', name: 'Park Trails', detail: 'The trails of offroad parks, in the park’s own levels (1 easiest to 5 hardest) where it rates them. From OpenStreetMap; check the park’s posted map.',
    ink: { color: FEATURE_INK.park, width: 4, casing: true }, on: true,
  },
  {
    id: 'nationalForest', group: 'land', name: 'National Forests', detail: 'Forest Service land and grasslands.',
    ink: { color: FEATURE_INK.nationalForest, width: 2, fill: 0.24 }, on: false,
  },
  {
    id: 'blm', group: 'land', name: 'BLM Land', detail: 'Bureau of Land Management public land.',
    ink: { color: FEATURE_INK.blm, width: 2, fill: 0.24 }, on: false,
  },
  {
    id: 'nationalPark', group: 'land', name: 'National Parks', detail: 'National parks, monuments and recreation areas.',
    ink: { color: FEATURE_INK.nationalPark, width: 2, fill: 0.24 }, on: false,
  },
  {
    id: 'statePark', group: 'land', name: 'State Parks', detail: 'State parks and state recreation areas.',
    ink: { color: FEATURE_INK.statePark, width: 2, fill: 0.24 }, on: false,
  },
  {
    id: 'private', group: 'land', name: 'Property Lines', detail: 'Private parcel lines, in Texas for now. Zoom in close to see them.',
    ink: { color: FEATURE_INK.private, width: 1.2 }, on: false,
  },
];

export const FEATURE_GROUPS: { id: FeatureGroup; name: string }[] = [
  { id: 'roads', name: 'Roads' },
  { id: 'trails', name: 'Trails' },
  { id: 'land', name: 'Land' },
];

export const MAP_FEATURE_IDS: MapFeatureId[] = MAP_FEATURES.map((f) => f.id);
export const FEATURE_BY_ID = Object.fromEntries(MAP_FEATURES.map((f) => [f.id, f])) as Record<MapFeatureId, MapFeature>;

export type FeatureChoices = Record<MapFeatureId, boolean>;

/** The choices of a rider who never opened the panel. */
export function defaultFeatures(): FeatureChoices {
  return Object.fromEntries(MAP_FEATURES.map((f) => [f.id, f.on])) as FeatureChoices;
}

/** Features that are trail data (the old single "Public Trails and Roads" switch turned these on and off). */
export const TRAIL_FEATURES: MapFeatureId[] = ['dirtRoads', 'streetLegal', 'offroad', 'narrow', 'hiking', 'closed'];
export const LAND_FEATURES: MapFeatureId[] = ['nationalForest', 'blm', 'nationalPark', 'statePark', 'private'];

/**
 * The saved choices, read from what older and newer app versions wrote. Before Map Features there
 * was one `trailsOn` switch (and Rider Trails had its own key): off there turns the trail
 * features off here. Unknown or broken entries fall back to the defaults.
 */
export function readFeatures(saved: { trailsOn?: unknown; features?: unknown } | null | undefined): FeatureChoices {
  const out = defaultFeatures();
  if (!saved) return out;
  if (saved.trailsOn === false) for (const id of TRAIL_FEATURES) out[id] = false;
  const f = saved.features;
  if (f && typeof f === 'object') {
    for (const id of MAP_FEATURE_IDS) {
      const v = (f as Record<string, unknown>)[id];
      if (typeof v === 'boolean') out[id] = v;
    }
  }
  return out;
}

/** True when any trail feature is on: older app versions read this as their one trails switch. */
export function anyTrails(f: FeatureChoices): boolean {
  return TRAIL_FEATURES.some((id) => f[id]);
}

export function anyLand(f: FeatureChoices): boolean {
  return LAND_FEATURES.some((id) => f[id]);
}

/**
 * Map Settings' four big switches (2.1): one tap for the kinds of lines riders think in. Each
 * covers a few Map Features; the full list stays under "Every Map Feature" for fine-tuning.
 */
export type QuickLayerId = 'streets' | 'offroad' | 'hiking' | 'land';
export type QuickLayer = { id: QuickLayerId; name: string; detail: string; features: MapFeatureId[]; sample: MapFeatureId };

export const QUICK_LAYERS: QuickLayer[] = [
  { id: 'streets', name: 'Streets and Roads', detail: 'Highways, paved roads and dirt roads', features: ['highways', 'roads', 'dirtRoads', 'streetLegal'], sample: 'roads' },
  { id: 'offroad', name: 'Off-Road Trails', detail: 'Motorized trails, tracks and width limits', features: ['offroad', 'narrow'], sample: 'offroad' },
  { id: 'hiking', name: 'Hiking Trails', detail: 'Foot and horse trails', features: ['hiking'], sample: 'hiking' },
  { id: 'land', name: 'Land Boundaries', detail: 'National forests, BLM, parks and property lines', features: LAND_FEATURES, sample: 'nationalForest' },
];

/** A quick switch is on when any of its features shows, so a rider who fine-tuned one still sees it lit. */
export function quickLayerOn(f: FeatureChoices, q: QuickLayer): boolean {
  return q.features.some((id) => f[id]);
}

/** The features to change when a quick switch is tapped: all of them on, or all of them off. */
export function quickLayerToggle(f: FeatureChoices, q: QuickLayer): { id: MapFeatureId; on: boolean }[] {
  const next = !quickLayerOn(f, q);
  // Land turning on starts with the public land only: property lines are heavy and Texas-only.
  const ids = q.id === 'land' && next ? q.features.filter((id) => id !== 'private') : q.features;
  return ids.filter((id) => f[id] !== next).map((id) => ({ id, on: next }));
}

/** Whether anything differs from what a new rider sees (the Layers button shows a small dot). */
export function featuresChanged(f: FeatureChoices, ids: readonly MapFeatureId[] = MAP_FEATURE_IDS): boolean {
  const d = defaultFeatures();
  return ids.some((id) => f[id] !== d[id]);
}

/** A short, steady name for a set of choices, used to tell map squares drawn for different choices apart. */
export function featureKey(ids: MapFeatureId[]): string {
  return ids.map((id) => MAP_FEATURE_IDS.indexOf(id).toString(36)).sort().join('');
}

// ---------------------------------------------------------------------------------------------
// OpenStreetMap roads, tracks and paths, drawn by Mapbox from OpenFreeMap's vector squares
// (OpenMapTiles schema: layer `transportation`, `class` motorway/trunk/primary/secondary/tertiary/
// minor/track/path, `surface` paved/unpaved, `access` "no" for closed or private). The same list
// serves the website (mapbox-gl style layers) and the apps (@rnmapbox/maps, via rnStyle).

type Expr = unknown[];
const cls = (...names: string[]): Expr => ['match', ['get', 'class'], names, true, false];
const unpaved: Expr = ['==', ['get', 'surface'], 'unpaved'];
const notUnpaved: Expr = ['!=', ['get', 'surface'], 'unpaved'];
const closedAccess: Expr = ['==', ['get', 'access'], 'no'];
const openAccess: Expr = ['!=', ['get', 'access'], 'no'];
/** Paths riders mean by "hiking trail": OSM path and bridleway (sidewalks are footways, left out). */
const hikingPath: Expr = ['all', cls('path'), ['match', ['get', 'subclass'], ['path', 'bridleway'], true, false]];

export type OsmLayer = {
  id: string;
  feature: MapFeatureId;
  type: 'line' | 'symbol';
  sourceLayer: 'transportation' | 'transportation_name';
  filter: Expr;
  minzoom: number;
  layout: Record<string, unknown>;
  paint: Record<string, unknown>;
};

const CASING = TRAIL_INK.casing;
const lineLayout = { 'line-join': 'round', 'line-cap': 'round' };
const dashLayout = { 'line-join': 'round', 'line-cap': 'butt' };
/** Mapbox dashes are in line widths, not points. */
const dashFor = (ink: FeatureInk) => ink.dash?.map((d) => Math.max(0.1, d / ink.width));
/** Wider when zoomed in: highways read from a state away and don't swamp a close-up. */
const widthByZoom = (w: number): Expr => ['interpolate', ['linear'], ['zoom'], 6, w * 0.45, 10, w * 0.75, 14, w];

/** The Mapbox zoom from which OpenStreetMap tracks and paths are drawn by Mapbox itself (core/terrain NATIVE_TRACKS_MIN_ZOOM). */
const CLOSE = 13;
const trailNameLayout = { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-max-angle': 30, 'symbol-spacing': 320 };
const trailNamePaint = { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(10,22,38,0.92)', 'text-halo-width': 1.6 };

export function osmFeatureLayers(): OsmLayer[] {
  const hw = FEATURE_BY_ID.highways.ink;
  const rd = FEATURE_BY_ID.roads.ink;
  const dirt = FEATURE_BY_ID.dirtRoads.ink;
  const trail = FEATURE_BY_ID.offroad.ink;
  const hike = FEATURE_BY_ID.hiking.ink;
  const closed = FEATURE_BY_ID.closed.ink;
  const paved = ['all', cls('primary', 'secondary', 'tertiary', 'minor'), notUnpaved];
  const dirtRoad = ['all', cls('secondary', 'tertiary', 'minor'), unpaved];
  return [
    // Bottom to top: paths, dirt roads, paved roads, highways, then tracks, so trails sit on roads.
    { id: 'oml-osm-hiking', feature: 'hiking', type: 'line', sourceLayer: 'transportation', filter: hikingPath, minzoom: CLOSE, layout: dashLayout, paint: { 'line-color': hike.color, 'line-width': hike.width, 'line-dasharray': dashFor(hike) } },
    { id: 'oml-osm-dirt-case', feature: 'dirtRoads', type: 'line', sourceLayer: 'transportation', filter: dirtRoad, minzoom: 10, layout: lineLayout, paint: { 'line-color': CASING, 'line-width': widthByZoom(dirt.width + 3) } },
    { id: 'oml-osm-dirt', feature: 'dirtRoads', type: 'line', sourceLayer: 'transportation', filter: dirtRoad, minzoom: 10, layout: lineLayout, paint: { 'line-color': dirt.color, 'line-width': widthByZoom(dirt.width) } },
    { id: 'oml-osm-road-case', feature: 'roads', type: 'line', sourceLayer: 'transportation', filter: paved, minzoom: 8, layout: lineLayout, paint: { 'line-color': CASING, 'line-width': widthByZoom(rd.width + 3) } },
    { id: 'oml-osm-road', feature: 'roads', type: 'line', sourceLayer: 'transportation', filter: paved, minzoom: 8, layout: lineLayout, paint: { 'line-color': rd.color, 'line-width': widthByZoom(rd.width) } },
    { id: 'oml-osm-highway-case', feature: 'highways', type: 'line', sourceLayer: 'transportation', filter: cls('motorway', 'trunk'), minzoom: 5, layout: lineLayout, paint: { 'line-color': CASING, 'line-width': widthByZoom(hw.width + 3.5) } },
    { id: 'oml-osm-highway', feature: 'highways', type: 'line', sourceLayer: 'transportation', filter: cls('motorway', 'trunk'), minzoom: 5, layout: lineLayout, paint: { 'line-color': hw.color, 'line-width': widthByZoom(hw.width) } },
    { id: 'oml-osm-case', feature: 'offroad', type: 'line', sourceLayer: 'transportation', filter: ['all', cls('track'), openAccess], minzoom: CLOSE, layout: lineLayout, paint: { 'line-color': CASING, 'line-width': trail.width + 3.3 } },
    { id: 'oml-osm-open', feature: 'offroad', type: 'line', sourceLayer: 'transportation', filter: ['all', cls('track'), openAccess], minzoom: CLOSE, layout: dashLayout, paint: { 'line-color': trail.color, 'line-width': trail.width, 'line-dasharray': dashFor(trail) } },
    { id: 'oml-osm-closed-case', feature: 'closed', type: 'line', sourceLayer: 'transportation', filter: ['all', cls('track'), closedAccess], minzoom: CLOSE, layout: lineLayout, paint: { 'line-color': CASING, 'line-width': closed.width + 3.3 } },
    { id: 'oml-osm-closed', feature: 'closed', type: 'line', sourceLayer: 'transportation', filter: ['all', cls('track'), closedAccess], minzoom: CLOSE, layout: dashLayout, paint: { 'line-color': closed.color, 'line-width': closed.width, 'line-dasharray': dashFor(closed) } },
    // Trail names follow their own switch: track names with Off-Road, path names with Hiking.
    {
      id: 'oml-osm-names', feature: 'offroad', type: 'symbol', sourceLayer: 'transportation_name', filter: ['all', cls('track'), ['has', 'name']], minzoom: CLOSE,
      layout: trailNameLayout, paint: trailNamePaint,
    },
    {
      id: 'oml-osm-hiking-names', feature: 'hiking', type: 'symbol', sourceLayer: 'transportation_name', filter: ['all', cls('path'), ['has', 'name']], minzoom: CLOSE,
      layout: trailNameLayout, paint: trailNamePaint,
    },
    {
      id: 'oml-osm-road-names', feature: 'roads', type: 'symbol', sourceLayer: 'transportation_name', filter: cls('motorway', 'trunk', 'primary', 'secondary', 'tertiary'), minzoom: 11,
      layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'ref'], ['get', 'name']], 'text-size': 11, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-max-angle': 30, 'symbol-spacing': 420 },
      paint: { 'text-color': '#DCEBFF', 'text-halo-color': 'rgba(10,22,38,0.92)', 'text-halo-width': 1.4 },
    },
  ];
}

/** Whether a Mapbox layer from osmFeatureLayers shows for these choices. */
export function osmLayerShows(layer: OsmLayer, f: FeatureChoices): boolean {
  return f[layer.feature];
}

/** "line-dasharray" to lineDasharray: @rnmapbox/maps takes Mapbox style properties in camel case. */
export function rnStyle(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}
