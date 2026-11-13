import { describe, expect, it } from 'vitest';

import {
  agencyLayersFor, applyFeatureChanges, CAR_LAYER_PREFIX, carLayerRows, carLayerToggle, carTrails,
} from '../car-layers';
import { defaultFeatures, MAP_FEATURE_IDS, osmFeatureLayers, type FeatureChoices } from '../map-features';

const none = Object.fromEntries(MAP_FEATURE_IDS.map((k) => [k, false])) as FeatureChoices;

describe('car map trails', () => {
  it('draws every default road and trail layer, all with the car prefix and a known source', () => {
    const t = carTrails(defaultFeatures());
    expect(t.layers.length).toBeGreaterThan(5);
    const sources = new Set(t.sources.map((s) => s.id));
    for (const l of t.layers) {
      expect(l.id.startsWith(CAR_LAYER_PREFIX)).toBe(true);
      expect(sources.has(l.source)).toBe(true);
    }
    for (const s of t.sources) expect(s.id.startsWith(CAR_LAYER_PREFIX)).toBe(true);
    // The OpenStreetMap tracks the phone draws are all there.
    const ids = t.layers.map((l) => l.id);
    for (const l of osmFeatureLayers()) expect(ids).toContain(`${CAR_LAYER_PREFIX}${l.id}`);
  });

  it('draws nothing with every feature off', () => {
    const t = carTrails(none);
    expect(t.layers).toEqual([]);
    expect(t.sources).toEqual([]);
    expect(t.key).toBe('');
  });

  it('drops a feature turned off, and the key changes with it', () => {
    const all = carTrails(defaultFeatures());
    const noHiking = carTrails({ ...defaultFeatures(), hiking: false });
    expect(noHiking.layers.some((l) => l.id.includes('oml-osm-hiking'))).toBe(false);
    expect(noHiking.key).not.toBe(all.key);
  });

  it('uses Mapbox style JSON names (source-layer, raster tiles with the Mapbox bbox)', () => {
    const t = carTrails(defaultFeatures());
    const vector = t.layers.find((l) => l.type === 'line');
    expect(vector?.['source-layer']).toBe('transportation');
    const raster = t.sources.find((s) => s.type === 'raster');
    expect(raster).toBeTruthy();
    expect(String((raster!.tiles as string[])[0])).toContain('{bbox-epsg-3857}');
  });

  it('agency land layers only when a land feature is on', () => {
    expect(agencyLayersFor(defaultFeatures()).some((a) => a.land)).toBe(false);
    expect(agencyLayersFor({ ...defaultFeatures(), blm: true }).some((a) => a.land)).toBe(true);
  });
});

describe('the Layers screen on the car', () => {
  it('lists the four quick switches, then single trail features, lit as on the phone', () => {
    const rows = carLayerRows(defaultFeatures());
    expect(rows.map((r) => r.id).slice(0, 4)).toEqual(['layer:quick:streets', 'layer:quick:offroad', 'layer:quick:hiking', 'layer:quick:land']);
    expect(rows.find((r) => r.id === 'layer:quick:land')?.on).toBe(false);
    expect(rows.find((r) => r.id === 'layer:quick:offroad')?.on).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(8);
  });

  it('a quick switch turns its whole group off, then on (land without property lines)', () => {
    const f = defaultFeatures();
    const off = applyFeatureChanges(f, carLayerToggle(f, 'layer:quick:offroad'));
    expect(off.offroad).toBe(false);
    expect(off.narrow).toBe(false);
    const land = applyFeatureChanges(f, carLayerToggle(f, 'layer:quick:land'));
    expect(land.blm).toBe(true);
    expect(land.private).toBe(false);
  });

  it('a single feature flips, and unknown rows change nothing', () => {
    const f = defaultFeatures();
    expect(carLayerToggle(f, 'layer:feature:closed')).toEqual([{ id: 'closed', on: false }]);
    expect(carLayerToggle(f, 'layer:feature:nope')).toEqual([]);
    expect(carLayerToggle(f, 'layer:quick:nope')).toEqual([]);
    expect(carLayerToggle(f, 'something')).toEqual([]);
  });
});
