import { describe, expect, it } from 'vitest';

import {
  anyLand, anyTrails, defaultFeatures, FEATURE_GROUPS, featureKey, MAP_FEATURE_IDS, MAP_FEATURES, osmFeatureLayers, osmLayerShows, readFeatures, rnStyle, TRAIL_FEATURES,
} from '../map-features';
import {
  inTexas, LAND_SOURCES, landQueryUrl, MVUM_NARROW_SYMBOLS, PADUS, PADUS_FIELDS, parcelIdentifyUrl, parseFsTrail, parsePadus, parseParcel, pickLayers,
  sourceFeatures, TRAIL_SOURCES, trailTileTemplate,
} from '../trails';

const layersOf = (url: string) => JSON.parse(decodeURIComponent(url.split('dynamicLayers=')[1].split('&')[0])) as {
  id: number;
  definitionExpression?: string;
  source: { mapLayerId: number };
  drawingInfo: { renderer: { symbol: { color: number[] } } };
}[];

describe('the feature list', () => {
  it('has every feature in a group, each with its own look', () => {
    const groups = FEATURE_GROUPS.map((g) => g.id);
    for (const f of MAP_FEATURES) expect(groups).toContain(f.group);
    const colors = MAP_FEATURES.map((f) => f.ink.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(new Set(MAP_FEATURE_IDS).size).toBe(MAP_FEATURE_IDS.length);
  });

  it('marks highways, roads and hiking trails differently from off-road trails', () => {
    const ink = (id: string) => MAP_FEATURES.find((f) => f.id === id)!.ink;
    expect(ink('highways').color).not.toBe(ink('offroad').color);
    expect(ink('roads').color).not.toBe(ink('dirtRoads').color);
    // Hiking trails also look different: thinner, a dash-dot, no heavy casing.
    expect(ink('hiking').width).toBeLessThan(ink('offroad').width);
    expect(ink('hiking').dash).toHaveLength(4);
    expect(ink('hiking').casing).toBeFalsy();
  });

  it('starts with roads and trails on and land off', () => {
    const f = defaultFeatures();
    expect(TRAIL_FEATURES.every((id) => f[id])).toBe(true);
    expect(f.highways && f.roads && f.riderTrails).toBe(true);
    expect(anyLand(f)).toBe(false);
  });
});

describe('saved choices', () => {
  it('reads what older app versions saved', () => {
    expect(readFeatures(null)).toEqual(defaultFeatures());
    const old = readFeatures({ trailsOn: false });
    expect(anyTrails(old)).toBe(false);
    // Roads were never part of the old trails switch.
    expect(old.highways).toBe(true);
  });

  it('keeps each saved switch and ignores junk', () => {
    const f = readFeatures({ trailsOn: true, features: { hiking: false, blm: true, nonsense: true, roads: 'yes' } });
    expect(f.hiking).toBe(false);
    expect(f.blm).toBe(true);
    expect(f.roads).toBe(true);
    expect(Object.keys(f).sort()).toEqual([...MAP_FEATURE_IDS].sort());
  });

  it('names a set of choices the same way whatever the order', () => {
    expect(featureKey(['offroad', 'hiking'])).toBe(featureKey(['hiking', 'offroad']));
    expect(featureKey(['offroad'])).not.toBe(featureKey(['hiking']));
  });
});

describe('agency layers per feature', () => {
  it('splits the Forest Service map into width-limited trails, trails, street-legal roads and roads', () => {
    expect(sourceFeatures(TRAIL_SOURCES.mvum).sort()).toEqual(['dirtRoads', 'narrow', 'offroad', 'streetLegal']);
    const narrow = layersOf(trailTileTemplate(TRAIL_SOURCES.mvum, ['narrow']));
    expect(narrow).toHaveLength(2);
    expect(narrow[0].definitionExpression).toContain(`'${MVUM_NARROW_SYMBOLS[0]}'`);
    expect(narrow[0].drawingInfo.renderer.symbol.color).toEqual([255, 122, 26, 255]);
    // The rest of the trails includes rows with no symbol at all.
    const rest = layersOf(trailTileTemplate(TRAIL_SOURCES.mvum, ['offroad']));
    expect(rest[0].definitionExpression).toMatch(/IS NULL OR symbol NOT IN/);
    const legal = layersOf(trailTileTemplate(TRAIL_SOURCES.mvum, ['streetLegal']));
    expect(legal[0].definitionExpression).toBe("symbol IN ('3','4')");
  });

  it('draws Forest Service and BLM foot trails as hiking trails', () => {
    expect(sourceFeatures(TRAIL_SOURCES.fstrails)).toEqual(['hiking']);
    expect(layersOf(trailTileTemplate(TRAIL_SOURCES.fstrails))[0].definitionExpression).toBe("terra_motorized = 'N'");
    expect(layersOf(trailTileTemplate(TRAIL_SOURCES.blm, ['hiking'])).map((l) => l.source.mapLayerId)).toEqual([4, 4, 5, 5]);
  });

  it('draws nothing for a source whose features are all off, and everything without a filter', () => {
    expect(pickLayers(TRAIL_SOURCES.blm.dynamicLayers, [])).toEqual([]);
    expect(pickLayers(TRAIL_SOURCES.blm.dynamicLayers)).toHaveLength(TRAIL_SOURCES.blm.dynamicLayers.length);
  });

  it('tints public land by who manages it, and draws Texas property lines without owner names', () => {
    const land = layersOf(trailTileTemplate(LAND_SOURCES.padus, ['nationalForest', 'statePark']));
    expect(land.map((l) => l.definitionExpression)).toEqual(["Mang_Name = 'USFS'", "Des_Tp IN ('SP','SREC')"]);
    expect(trailTileTemplate(LAND_SOURCES.padus)).toContain('PAD_US');
    const parcels = trailTileTemplate(LAND_SOURCES.txparcels);
    expect(parcels).toContain('feature.geographic.texas.gov');
    expect(decodeURIComponent(parcels)).not.toMatch(/owner/i);
    expect(LAND_SOURCES.txparcels.minZ).toBeGreaterThan(LAND_SOURCES.padus.minZ);
  });
});

describe('OpenStreetMap lines on Mapbox', () => {
  const layers = osmFeatureLayers();
  it('covers highways, paved roads, dirt roads, tracks, closures and hiking paths', () => {
    expect(new Set(layers.map((l) => l.feature))).toEqual(new Set(['highways', 'roads', 'dirtRoads', 'offroad', 'closed', 'hiking']));
    expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length);
  });

  it('keeps highways visible from far out and tracks for close in', () => {
    const hw = layers.find((l) => l.id === 'oml-osm-highway')!;
    const track = layers.find((l) => l.id === 'oml-osm-open')!;
    expect(hw.minzoom).toBeLessThan(track.minzoom);
    expect(JSON.stringify(hw.filter)).toContain('motorway');
    expect(JSON.stringify(layers.find((l) => l.id === 'oml-osm-hiking')!.filter)).toContain('bridleway');
    // Sidewalks (footway) are not hiking trails.
    expect(JSON.stringify(layers.find((l) => l.id === 'oml-osm-hiking')!.filter)).not.toContain('footway');
  });

  it('names follow the switch of the line they sit on', () => {
    const trackNames = layers.find((l) => l.id === 'oml-osm-names')!;
    const pathNames = layers.find((l) => l.id === 'oml-osm-hiking-names')!;
    expect(trackNames.feature).toBe('offroad');
    expect(JSON.stringify(trackNames.filter)).not.toContain('path');
    expect(pathNames.feature).toBe('hiking');
    expect(JSON.stringify(pathNames.filter)).toContain('path');
    // Hiking on, Off-Road off: path lines and their names show, track names don't.
    const choices = { ...defaultFeatures(), offroad: false, hiking: true };
    expect(osmLayerShows(pathNames, choices)).toBe(true);
    expect(osmLayerShows(trackNames, choices)).toBe(false);
  });

  it('hands the apps the same style in camel case', () => {
    expect(rnStyle({ 'line-color': '#fff', 'line-dasharray': [1, 2], 'text-halo-width': 1, gone: undefined })).toEqual({ lineColor: '#fff', lineDasharray: [1, 2], textHaloWidth: 1 });
  });
});

describe('tapping land', () => {
  it('asks PAD-US about the point only', () => {
    const url = landQueryUrl(PADUS, { lat: 38.5, lng: -109.5 }, PADUS_FIELDS);
    expect(url).toContain('geometry=-109.500000,38.500000');
    expect(url).toContain('returnGeometry=false');
  });

  it('names the park before the wider land around it, and only kinds that are on', () => {
    const rows = [
      { Unit_Nm: 'Moab Field Office', Mang_Name: 'BLM', Des_Tp: 'MPA', Pub_Access: 'OA', GIS_Acres: 120000 },
      { Unit_Nm: 'Dead Horse Point State Park', Mang_Name: 'SPR', Des_Tp: 'SP', Pub_Access: 'RA', GIS_Acres: 5362.4 },
    ];
    const both = parsePadus(rows, { blm: true, statePark: true });
    expect(both?.title).toBe('Dead Horse Point State Park');
    expect(both?.kind).toBe('statePark');
    expect(both?.access).toBe('Restricted access');
    const blmOnly = parsePadus(rows, { blm: true });
    expect(blmOnly?.kind).toBe('blm');
    expect(blmOnly?.manager).toBe('Bureau of Land Management');
    expect(parsePadus(rows, {})).toBeNull();
  });

  it('shows a Texas parcel by size and county, never its owner', () => {
    expect(inTexas({ lat: 30.57, lng: -98.27 })).toBe(true);
    expect(inTexas({ lat: 38.5, lng: -109.5 })).toBe(false);
    expect(parcelIdentifyUrl({ lat: 30.57, lng: -98.27 })).toContain('/identify?');
    const p = parseParcel([{ OWNER_NAME: 'SOMEONE', GIS_AREA: '0.209377', COUNTY: 'BURNET' }]);
    expect(p?.acres).toBe(0.2);
    expect(p?.manager).toBe('Burnet County, Texas');
    expect(JSON.stringify(p)).not.toContain('SOMEONE');
    expect(parseParcel([])).toBeNull();
  });
});

describe('Forest Service hiking trails', () => {
  it('reads the trail and who may use it', () => {
    const t = parseFsTrail({ trail_name: 'BULL CREEK', trail_no: '1234', hiker_pedestrian_managed: '01/01-12/31', pack_saddle_managed: null, gis_miles: 3.27 });
    expect(t.title).toBe('Bull Creek (Trail 1234)');
    expect(t.hiking).toBe(true);
    expect(t.allowed.map((a) => a.vehicle)).toEqual(['Hikers']);
    expect(t.miles).toBe(3.3);
  });
});
