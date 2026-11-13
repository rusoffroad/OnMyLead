/**
 * Trails, roads and land on the CarPlay map, and the Layers screen that switches them (3.1).
 *
 * The car map (CarMapScreen.swift) draws the same Map Features as the phone's maps: OpenStreetMap
 * roads, tracks and paths from OpenFreeMap's vector squares (osmFeatureLayers), and the agencies'
 * own squares (Forest Service roads and trails, BLM, land boundaries; agencyLayersFor). The phone
 * builds them here as plain Mapbox style JSON, so the car adds them as they are, and the rider's
 * Map Features choices are the same ones every map in the app uses (map.layers.v1).
 *
 * Rider Trails and Park Trails are loaded from the server for the part of the map on screen, which
 * the car can't ask for: those two stay on the phone's maps (docs/feature-parity.md exception).
 */
import { tc } from './i18n';
import {
  FEATURE_BY_ID, featureKey, osmFeatureLayers, QUICK_LAYERS, quickLayerOn, quickLayerToggle, type AgencyLayer, type FeatureChoices, type MapFeatureId,
} from './map-features';
import { OSM_TILEJSON } from './osm-trails';
import { AGENCY_TILE_SIZE, mapboxAgencyTemplate } from './terrain';
import {
  LAND_FADE_IN, LAND_SOURCE_IDS, LAND_SOURCES, sourceFeatures, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate, type TrailSourceId,
} from './trails';

/**
 * The agencies' trail and land squares to draw for the features that are on (every map in the
 * app, and the car). With no signal only the saved squares can show, and downloads save every
 * trail layer, so `offline` asks for the full set.
 */
export function agencyLayersFor(features: FeatureChoices, offline = false): AgencyLayer[] {
  const on = (Object.keys(features) as MapFeatureId[]).filter((id) => features[id]);
  const trailLayers = TRAIL_SOURCE_IDS.flatMap((id: TrailSourceId) => {
    const tags = sourceFeatures(TRAIL_SOURCES[id]);
    const shown = tags.filter((t) => on.includes(t as MapFeatureId));
    if (!shown.length) return [];
    const all = shown.length === tags.length || offline;
    return [{
      id,
      key: all ? id : `${id}-${featureKey(shown as MapFeatureId[])}`,
      template: trailTileTemplate(TRAIL_SOURCES[id], all ? undefined : shown),
      minZ: TRAILS_MIN_Z,
      attribution: TRAIL_SOURCES[id].attribution,
      land: false,
    }];
  });
  const landLayers = LAND_SOURCE_IDS.flatMap((id) => {
    const src = LAND_SOURCES[id];
    const shown = sourceFeatures(src).filter((t) => on.includes(t as MapFeatureId));
    if (!shown.length) return [];
    return [{ id, key: `${id}-${featureKey(shown as MapFeatureId[])}`, template: trailTileTemplate(src, shown), minZ: src.minZ, attribution: src.attribution, land: true }];
  });
  return [...landLayers, ...trailLayers];
}

/** A Mapbox style source, with its id (CarMapViewController adds it with these properties). */
export type CarStyleSource = { id: string } & Record<string, unknown>;
/** A Mapbox style layer, exactly as a style.json holds it. */
export type CarStyleLayer = { id: string; type: string; source: string } & Record<string, unknown>;

/** What the car map draws under the riders and your line. The ids all start with CAR_LAYER_PREFIX. */
export type CarTrails = {
  /** Changes whenever what's drawn changes, so the car only rebuilds the layers then. */
  key: string;
  sources: CarStyleSource[];
  layers: CarStyleLayer[];
};

export const CAR_LAYER_PREFIX = 'oml-car-t-';
const OSM_SOURCE = `${CAR_LAYER_PREFIX}osm`;

/**
 * The Map Features as car map layers, bottom to top: land, the agencies' trails, then the
 * OpenStreetMap roads, tracks and names (the same order as the phone's Mapbox map).
 */
export function carTrails(features: FeatureChoices): CarTrails {
  const agencies = agencyLayersFor(features);
  const osm = osmFeatureLayers().filter((l) => features[l.feature]);
  const sources: CarStyleSource[] = agencies.map((a) => ({
    id: `${CAR_LAYER_PREFIX}${a.key}`,
    type: 'raster',
    tiles: [mapboxAgencyTemplate(a.template)],
    tileSize: AGENCY_TILE_SIZE,
    minzoom: Math.max(0, a.minZ - 1),
    attribution: a.attribution,
  }));
  if (osm.length) sources.push({ id: OSM_SOURCE, type: 'vector', url: OSM_TILEJSON });
  const layers: CarStyleLayer[] = [
    ...agencies.map((a) => ({
      id: `${CAR_LAYER_PREFIX}${a.key}-layer`,
      type: 'raster',
      source: `${CAR_LAYER_PREFIX}${a.key}`,
      minzoom: a.minZ,
      paint: { 'raster-opacity': a.land ? [...LAND_FADE_IN] : 1, 'raster-fade-duration': 0 },
    })),
    ...osm.map((l) => ({
      id: `${CAR_LAYER_PREFIX}${l.id}`,
      type: l.type,
      source: OSM_SOURCE,
      'source-layer': l.sourceLayer,
      filter: l.filter,
      minzoom: l.minzoom,
      layout: l.layout,
      paint: l.paint,
    })),
  ];
  return { key: [...sources.map((s) => s.id), ...layers.map((l) => l.id)].join('|'), sources, layers };
}

// --- The Layers screen on the car --------------------------------------------------------------
// One tap per kind of line, like Map Settings' quick switches on the phone, then the trail
// features riders most often change on their own. Apple's car lists are short, so the full
// Every Map Feature list stays on the phone.

export type CarLayerRow = { id: string; title: string; detail: string; on: boolean };

/** The trail features listed on their own under the quick switches. */
export const CAR_SINGLE_FEATURES: MapFeatureId[] = ['closed', 'narrow', 'streetLegal'];

export function carLayerRows(features: FeatureChoices): CarLayerRow[] {
  return [
    ...QUICK_LAYERS.map((q) => ({ id: `layer:quick:${q.id}`, title: tc(q.name), detail: tc(q.detail), on: quickLayerOn(features, q) })),
    ...CAR_SINGLE_FEATURES.map((id) => ({
      id: `layer:feature:${id}`,
      title: tc(FEATURE_BY_ID[id].name),
      detail: tc(FEATURE_BY_ID[id].detail),
      on: features[id],
    })),
  ];
}

/** The features a tap on the car's Layers screen changes (none for an id it doesn't know). */
export function carLayerToggle(features: FeatureChoices, rowId: string): { id: MapFeatureId; on: boolean }[] {
  if (rowId.startsWith('layer:quick:')) {
    const q = QUICK_LAYERS.find((x) => x.id === rowId.slice('layer:quick:'.length));
    return q ? quickLayerToggle(features, q) : [];
  }
  if (rowId.startsWith('layer:feature:')) {
    const id = rowId.slice('layer:feature:'.length) as MapFeatureId;
    return id in FEATURE_BY_ID ? [{ id, on: !features[id] }] : [];
  }
  return [];
}

/** The choices after a set of changes. */
export function applyFeatureChanges(features: FeatureChoices, changes: { id: MapFeatureId; on: boolean }[]): FeatureChoices {
  const next = { ...features };
  for (const c of changes) next[c.id] = c.on;
  return next;
}
