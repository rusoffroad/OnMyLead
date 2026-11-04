import { describe, expect, it } from 'vitest';

import { APP_FLAGS, flagOn, parseAppSettings } from '../app-settings';
import {
  offlineChoices, planArea, planRide, statusLine, terrainBoxes, terrainBytes, type OfflineMap,
} from '../offline-maps';
import {
  cameraPadding, feetLabel, fitCorners, insideBox, linesGeoJSON, mapboxTileTemplate, mapboxZoomFor, metersPerPointAt, metersToFeet,
  packBounds, packName, pointsGeoJSON, regionFromCamera, TERRAIN_IDS, TERRAIN_SOURCES, terrainLayers, terrainShows, tightPoints,
  trailZoomFromMapbox,
} from '../terrain';
import { mapZoom, TRAIL_SOURCES, trailTileTemplate } from '../trails';

const MOAB = { minLat: 38.5, maxLat: 38.8, minLng: -109.8, maxLng: -109.4 };

describe('3D Terrain layers', () => {
  it('reads only sources the app adds, so nothing depends on Mapbox renaming its own', () => {
    const ids = new Set(Object.keys(TERRAIN_SOURCES));
    for (const l of terrainLayers()) expect(ids.has(l.source)).toBe(true);
  });

  it('draws contours, index contours with labels in feet, and peaks', () => {
    const ids = terrainLayers().map((l) => l.id);
    expect(ids).toEqual([TERRAIN_IDS.contourLine, TERRAIN_IDS.contourIndex, TERRAIN_IDS.contourLabel, TERRAIN_IDS.peaks]);
    const label = terrainLayers().find((l) => l.id === TERRAIN_IDS.contourLabel)!;
    expect(JSON.stringify(label.layout)).toContain('3.28084');
    expect(JSON.stringify(label.layout)).toContain(' ft');
  });

  it('raises the ground from Mapbox land height', () => {
    expect(TERRAIN_SOURCES[TERRAIN_IDS.dem].type).toBe('raster-dem');
  });
});

describe('feet', () => {
  it('turns meters into whole feet with a comma', () => {
    expect(metersToFeet(1000)).toBe(3281);
    expect(feetLabel(4401)).toBe('14,439 ft');
  });
});

describe('camera', () => {
  it('counts zoom one level apart from the trail layers', () => {
    expect(trailZoomFromMapbox(12)).toBe(13);
  });

  it('measures a tilted map as if looking straight down, matching the flat maps', () => {
    const r = regionFromCamera({ lat: 38.6, lng: -109.6 }, 12, { width: 390, height: 800 });
    expect(r.latitude).toBe(38.6);
    // The trail loaders read the same zoom from this region as Mapbox's zoom plus one.
    expect(mapZoom(r, 390)).toBeCloseTo(13, 5);
    expect(mapboxZoomFor(r.longitudeDelta, 390)).toBeCloseTo(12, 5);
  });

  it('gets about a fingertip of meters per point', () => {
    // About 19 m per point at Mapbox zoom 12 on the equator, less further north.
    expect(metersPerPointAt(0, 12)).toBeCloseTo(19.1, 1);
    expect(metersPerPointAt(60, 12)).toBeCloseTo(9.55, 1);
  });

  it('keeps padding inside the map so a move is never refused', () => {
    expect(cameraPadding({ top: 100, right: 0, bottom: 300, left: 360 }, { width: 1024, height: 768 }))
      .toEqual({ paddingTop: 100, paddingRight: 0, paddingBottom: 300, paddingLeft: 360 });
    const p = cameraPadding({ top: 600, right: 0, bottom: 600, left: 0 }, { width: 390, height: 800 });
    expect(p.paddingTop + p.paddingBottom).toBeLessThanOrEqual(640);
  });

  it('frames about a mile around riders bunched together', () => {
    const pts = [{ lat: 38.6, lng: -109.6 }, { lat: 38.6001, lng: -109.6001 }];
    expect(tightPoints(pts)).toBe(true);
    const [ne, sw] = fitCorners(pts)!;
    expect(ne[0] - sw[0]).toBeCloseTo(0.014, 3);
    expect(fitCorners([])).toBeNull();
    expect(fitCorners([{ lat: 38, lng: -110 }, { lat: 39, lng: -109 }])).toEqual([[-109, 39], [-110, 38]]);
  });
});

describe('trail squares in 3D', () => {
  it('lets Mapbox fill in each square box', () => {
    const t = mapboxTileTemplate(trailTileTemplate(TRAIL_SOURCES.mvum));
    expect(t).toContain('bbox={bbox-epsg-3857}');
    expect(t).not.toContain('{minX}');
  });
});

describe('when the 3D map shows', () => {
  const base = { picked: true, available: true, offline: false, center: { lat: 38.6, lng: -109.6 }, saved: [] };
  it('shows whenever picked with signal', () => {
    expect(terrainShows(base)).toBe(true);
    expect(terrainShows({ ...base, picked: false })).toBe(false);
    expect(terrainShows({ ...base, available: false })).toBe(false);
  });

  it('with no signal, shows only over a downloaded 3D area', () => {
    expect(terrainShows({ ...base, offline: true })).toBe(false);
    expect(terrainShows({ ...base, offline: true, saved: [MOAB] })).toBe(true);
    expect(terrainShows({ ...base, offline: true, saved: [MOAB], center: { lat: 40, lng: -105 } })).toBe(false);
    expect(terrainShows({ ...base, offline: true, saved: [MOAB], center: null })).toBe(false);
  });

  it('checks a point against a box', () => {
    expect(insideBox({ lat: 38.6, lng: -109.6 }, MOAB)).toBe(true);
    expect(insideBox({ lat: 38.9, lng: -109.6 }, MOAB)).toBe(false);
  });
});

describe('3D Terrain downloads', () => {
  const map = (patch: Partial<OfflineMap>): OfflineMap => ({
    id: 'a1', name: 'Moab', kind: 'area', box: MOAB, choices: ['satellite', 'terrain'], status: 'ready',
    total: 100, saved: 100, failed: 0, bytes: 2_500_000, createdAt: '2026-11-03T00:00:00Z', ...patch,
  });

  it('is offered only where 3D Terrain is', () => {
    expect(offlineChoices(false).map((c) => c.id)).toEqual(['satellite', 'topo', 'trails']);
    expect(offlineChoices(true).map((c) => c.id)).toContain('terrain');
  });

  it('adds Mapbox’s download to the estimate without adding squares', () => {
    const flat = planArea(MOAB, ['satellite']);
    const with3d = planArea(MOAB, ['satellite', 'terrain']);
    expect(with3d.tiles).toBe(flat.tiles);
    expect(with3d.bytes - flat.bytes).toBe(terrainBytes(MOAB));
    // A Moab-sized area (about 22 by 21 miles) is a couple of hundred MB in 3D.
    expect(terrainBytes(MOAB)).toBeGreaterThan(50_000_000);
    expect(terrainBytes(MOAB)).toBeLessThan(400_000_000);
    const route = [{ lat: 38.6, lng: -109.6 }, { lat: 38.7, lng: -109.5 }];
    expect(planRide(route, ['terrain']).bytes).toBeGreaterThan(0);
    expect(planRide(route, ['terrain']).tiles).toBe(0);
  });

  it('says how the 3D part is going', () => {
    expect(statusLine(map({ terrain: 'saving', terrainPct: 42.6 }))).toBe('Saving 3D Terrain, 42%');
    expect(statusLine(map({ terrain: 'saved' }))).toBe('2.5 MB');
    expect(statusLine(map({ terrain: 'failed' }))).toBe('2.5 MB, 3D Terrain Not Saved');
    expect(statusLine(map({ terrain: 'saved', total: 0, saved: 0, bytes: 0, choices: ['terrain'] }))).toBe('3D Terrain Saved');
    // The flat squares still downloading come first.
    expect(statusLine(map({ status: 'downloading', saved: 50, terrain: 'saving' }))).toBe('Downloading, 50%');
  });

  it('lists only finished 3D areas for the no-signal check', () => {
    expect(terrainBoxes([map({ terrain: 'saved' }), map({ id: 'b', terrain: 'saving' }), map({ id: 'c' })])).toEqual([MOAB]);
  });

  it('names and bounds the Mapbox pack', () => {
    expect(packName('abc')).toBe('oml-abc');
    expect(packBounds(MOAB)).toEqual([[-109.4, 38.8], [-109.8, 38.5]]);
  });
});

describe('GeoJSON for the 3D map', () => {
  it('writes lines in [lng, lat] and drops single points', () => {
    const fc = linesGeoJSON([
      { key: 'a', points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], props: { closed: true } },
      { key: 'b', points: [{ lat: 1, lng: 2 }] },
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([[2, 1], [4, 3]]);
    expect(fc.features[0].properties).toEqual({ key: 'a', closed: true });
  });

  it('writes name tags as points', () => {
    const fc = pointsGeoJSON([{ key: 't', at: { lat: 5, lng: 6 }, props: { name: 'Hell’s Revenge' } }]);
    expect(fc.features[0].geometry.coordinates).toEqual([6, 5]);
  });
});

describe('owner switch', () => {
  it('has a 3D Terrain flag that stays on unless switched off', () => {
    expect(APP_FLAGS.terrain_3d.label).toBe('3D Terrain');
    expect(flagOn(parseAppSettings({ flags: {} }), 'terrain_3d')).toBe(true);
    expect(flagOn(parseAppSettings({ flags: { terrain_3d: false } }), 'terrain_3d')).toBe(false);
  });
});
