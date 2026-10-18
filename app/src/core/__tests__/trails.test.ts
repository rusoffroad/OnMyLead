import { describe, expect, it } from 'vitest';
import {
  boxAround, closedSeasonalLines, densify, distanceToLineM, fillTemplate, identifyUrl, metersPerPoint, mvumSeason, nextOpening,
  nearestTrail, offlineTilePlan, openOnDay, parseBlm, parseDateRanges, parseFsClosed, parseMvum, seasonalQueryUrl, tileBoundsLatLng,
  tileBoundsMercator, tileFor, tilesInBox, TRAIL_SOURCE_IDS, TRAIL_SOURCES, trailTileTemplate,
} from '../trails';

const fishlake = { lat: 38.45, lng: -111.55 };

describe('tile math', () => {
  it('matches the standard Web Mercator scheme', () => {
    expect(tileFor({ lat: 0, lng: 0 }, 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(tileFor(fishlake, 12)).toEqual({ z: 12, x: 778, y: 1573 });
    const [minX, minY, maxX, maxY] = tileBoundsMercator({ z: 0, x: 0, y: 0 });
    expect(minX).toBeCloseTo(-20037508.34, 1);
    expect(maxY).toBeCloseTo(20037508.34, 1);
    expect(maxX).toBeCloseTo(-minX, 6);
    expect(minY).toBeCloseTo(-maxY, 6);
  });

  it('clamps the poles and the date line', () => {
    expect(tileFor({ lat: 89.9, lng: 180 }, 3)).toEqual({ z: 3, x: 7, y: 0 });
  });

  it('pads a box by miles and lists its tiles', () => {
    const box = boxAround([fishlake], 1)!;
    expect(box.maxLat - box.minLat).toBeCloseTo(2 / 69, 6);
    expect(boxAround([], 1)).toBeNull();
    const tiles = tilesInBox(box, 12);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.z === 12)).toBe(true);
  });
});

describe('offline tile plan', () => {
  const route = [fishlake, { lat: 38.6, lng: -111.3 }];

  it('covers the route at every zoom without duplicates', () => {
    const plan = offlineTilePlan(route);
    const keys = plan.map((t) => `${t.z}/${t.x}/${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (let z = 10; z <= 15; z++) {
      for (const p of densify(route, 150)) {
        const t = tileFor(p, z);
        expect(keys).toContain(`${z}/${t.x}/${t.y}`);
      }
    }
    // A ~17 mile ride stays small enough to save over a phone connection.
    expect(plan.length).toBeLessThan(1500);
  });

  it('puts wide zooms first so a capped plan still covers the whole ride', () => {
    const plan = offlineTilePlan(route, { limit: 20 });
    expect(plan).toHaveLength(20);
    expect(plan[0].z).toBe(10);
  });

  it('returns nothing without a route', () => {
    expect(offlineTilePlan([])).toEqual([]);
  });
});

describe('tile URLs', () => {
  it('asks the agency server for a crisp transparent image in our colors', () => {
    const t = trailTileTemplate(TRAIL_SOURCES.mvum);
    expect(t).toContain('apps.fs.usda.gov');
    expect(t).toContain('{minX}');
    expect(t).toContain('transparent=true');
    const dynamic = JSON.parse(decodeURIComponent(t.split('dynamicLayers=')[1].split('&')[0]));
    expect(dynamic.map((l: { source: { mapLayerId: number } }) => l.source.mapLayerId)).toEqual([2, 2, 1, 1]);
    const filled = fillTemplate(t, { z: 12, x: 778, y: 1573 });
    expect(filled).not.toMatch(/\{(minX|minY|maxX|maxY)\}/);
  });

  it('builds a tap query around the point', () => {
    const url = identifyUrl(TRAIL_SOURCES.blm, 0, fishlake, 100);
    expect(url).toContain('/0/query?');
    expect(url).toContain('f=geojson');
    expect(url).toContain('-111.551');
  });

  it('estimates meters per screen point', () => {
    expect(metersPerPoint({ latitude: 0, longitudeDelta: 1 }, 400)).toBeCloseTo(278.3, 0);
  });
});

describe('tapping a line', () => {
  const line = { type: 'LineString' as const, coordinates: [[-111.551, 38.45], [-111.549, 38.45]] };

  it('measures distance to the nearest segment', () => {
    expect(distanceToLineM(fishlake, line)).toBeLessThan(1);
    expect(distanceToLineM({ lat: 38.451, lng: -111.55 }, line)).toBeCloseTo(110.6, 0);
    expect(distanceToLineM(fishlake, null)).toBe(Infinity);
  });

  it('reads Forest Service vehicle rules in plain words', () => {
    const info = parseMvum(
      {
        id: '145', name: null, forestname: 'Fishlake National Forest', districtname: 'Fremont River Ranger District',
        seasonal: 'seasonal', atv: 'open', atv_datesopen: '04/16-12/31', motorcycle: 'open', motorcycle_datesopen: '04/16-12/31',
        other_ohv_gt50inches: null, fourwd_gt50inches: 'open', fourwd_gt50_datesopen: '04/16-12/31', gis_miles: 1.341,
      },
      'trail',
      new Date(2026, 9, 18),
    );
    expect(info.title).toBe('Trail 145');
    expect(info.closure).toBeNull();
    expect(info.where).toBe('Fishlake National Forest, Fremont River Ranger District');
    expect(info.allowed.map((a) => a.vehicle)).toEqual(['ATVs (50" or less)', 'Dirt bikes', '4x4s']);
    expect(info.allowed[0].dates).toBe('04/16-12/31');
    expect(info.seasonal).toBe(true);
    expect(info.miles).toBe(1.3);
  });

  it('keeps route numbers in road names', () => {
    const info = parseMvum({ id: '42633A', name: 'SPUR 42633A', surfacetype: 'NAT - NATIVE MATERIAL', seasonal: 'yearlong' }, 'road');
    expect(info.title).toBe('Spur 42633A');
    expect(info.surface).toBe('Native Material');
    expect(info.allowed).toEqual([]);
  });

  it('reads BLM routes', () => {
    const info = parseBlm({ ROUTE_PRMRY_NM: 'HELLS REVENGE', ADMIN_ST: 'UT', PLAN_MODE_TRNSPRT: 'MOTORIZED', OBSRVE_SRFCE_TYPE: 'NATURAL', GIS_MILES: 6.52 });
    expect(info.title).toBe('Hells Revenge');
    expect(info.where).toBe('BLM land, UT');
    expect(info.miles).toBe(6.5);
  });

  it('picks the nearest line across sources and ignores far ones', () => {
    const near = { type: 'Feature' as const, properties: { id: '1' }, geometry: line };
    const far = { type: 'Feature' as const, properties: { ROUTE_PRMRY_NM: 'FAR' }, geometry: { type: 'LineString' as const, coordinates: [[-111.6, 38.5], [-111.59, 38.5]] } };
    const info = nearestTrail(fishlake, [
      { source: 'blm', layerId: 0, features: [far] },
      { source: 'mvum', layerId: 2, features: [near] },
    ], 60);
    expect(info?.title).toBe('Trail 1');
    expect(nearestTrail(fishlake, [{ source: 'blm', layerId: 0, features: [far] }], 60)).toBeNull();
  });
});

describe('closures', () => {
  const oct18 = new Date(2026, 9, 18);
  const jan5 = new Date(2027, 0, 5);

  it('reads MVUM date ranges, loose typing included', () => {
    expect(parseDateRanges('05/01-11/30')).toEqual([{ from: 501, to: 1130 }]);
    expect(parseDateRanges('01/01-03/31,05/16-09/30,11/01-12/31')).toHaveLength(3);
    expect(parseDateRanges('07/01-10/11   10/22-11/30')).toEqual([{ from: 701, to: 1011 }, { from: 1022, to: 1130 }]);
    expect(parseDateRanges('7/01-10/11')).toEqual([{ from: 701, to: 1011 }]);
    expect(parseDateRanges(' ')).toEqual([]);
    expect(parseDateRanges(null)).toEqual([]);
    expect(parseDateRanges('13/01-14/01')).toEqual([]);
  });

  it('knows which days are open, across the new year too', () => {
    expect(openOnDay(parseDateRanges('05/01-10/15'), oct18)).toBe(false);
    expect(openOnDay(parseDateRanges('05/01-10/18'), oct18)).toBe(true);
    expect(openOnDay(parseDateRanges('12/01-03/14'), jan5)).toBe(true);
    expect(openOnDay(parseDateRanges('12/01-03/14'), oct18)).toBe(false);
    expect(openOnDay([], oct18)).toBe(true);
    expect(nextOpening(parseDateRanges('05/01-10/15'), oct18)).toBe('May 1');
    expect(nextOpening(parseDateRanges('12/01-03/14,05/25-06/30'), oct18)).toBe('Dec 1');
  });

  it('closes a seasonal route only when every vehicle is out of season', () => {
    const props = {
      seasonal: 'seasonal', atv: 'open', atv_datesopen: '05/01-10/15', motorcycle: 'open', motorcycle_datesopen: '05/01-10/15',
    };
    const closed = mvumSeason(props, oct18);
    expect(closed.closure?.label).toBe('Closed for the Season');
    expect(closed.closure?.detail).toContain('May 1');
    expect(closed.allowed.every((a) => a.closedNow)).toBe(true);
    const mixed = mvumSeason({ ...props, motorcycle_datesopen: '05/01-11/30' }, oct18);
    expect(mixed.closure).toBeNull();
    expect(mixed.allowed.map((a) => a.closedNow)).toEqual([true, false]);
    // Yearlong routes are never "closed for the season", whatever their date columns say.
    expect(mvumSeason({ ...props, seasonal: 'yearlong' }, oct18).closure).toBeNull();
  });

  it('reads closed Forest Service roads and closed BLM routes', () => {
    const fs = parseFsClosed({ id: '414.1', name: 'JENNY LIND', gis_miles: 2.04 });
    expect(fs.title).toBe('Jenny Lind (Road 414.1)');
    expect(fs.closure?.label).toBe('Closed to Motor Vehicles');
    expect(parseBlm({ ROUTE_PRMRY_NM: 'X', PLAN_OHV_ROUTE_DSGNTN: 'Closed' }).closure?.label).toBe('Closed to Off-Highway Vehicles');
    expect(parseBlm({ ROUTE_PRMRY_NM: 'X', PLAN_OHV_ROUTE_DSGNTN: 'Open' }).closure).toBeNull();
    const line = { type: 'Feature' as const, properties: { id: '414.1' }, geometry: { type: 'LineString' as const, coordinates: [[-111.551, 38.45], [-111.549, 38.45]] } };
    expect(nearestTrail(fishlake, [{ source: 'fsclosed', layerId: 1, features: [line] }], 60)?.closure).not.toBeNull();
  });

  it('draws closed roads below the open layers, and labels them', () => {
    expect(TRAIL_SOURCE_IDS[0]).toBe('fsclosed');
    const t = trailTileTemplate(TRAIL_SOURCES.fsclosed);
    expect(t).toContain('EDW_RoadBasic_01');
    expect(decodeURIComponent(t)).toContain('\\"CLOSED\\"');
    const blm = JSON.parse(decodeURIComponent(trailTileTemplate(TRAIL_SOURCES.blm).split('dynamicLayers=')[1].split('&')[0]));
    expect(blm[0].drawingInfo.renderer.uniqueValueInfos[0].value).toBe('Closed');
  });

  it('asks for seasonal routes in a square and keeps the ones closed today', () => {
    const sq = tileFor(fishlake, 11);
    const b = tileBoundsLatLng(sq);
    expect(fishlake.lat).toBeGreaterThan(b.minLat);
    expect(fishlake.lat).toBeLessThan(b.maxLat);
    expect(fishlake.lng).toBeGreaterThan(b.minLng);
    expect(fishlake.lng).toBeLessThan(b.maxLng);
    const url = seasonalQueryUrl(2, sq);
    expect(url).toContain('/2/query?');
    expect(url).toContain(encodeURIComponent("seasonal='seasonal'"));
    expect(url).toContain('atv_datesopen');
    const feature = (objectid: number, dates: string) => ({
      type: 'Feature' as const,
      properties: { objectid, id: String(objectid), seasonal: 'seasonal', atv: 'open', atv_datesopen: dates },
      geometry: { type: 'LineString' as const, coordinates: [[-111.551, 38.45], [-111.549, 38.45]] },
    });
    const lines = closedSeasonalLines([feature(1, '05/01-10/15'), feature(2, '05/01-11/30')], 2, oct18);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: 'mvum2-1', title: 'Trail 1', opens: 'May 1' });
    expect(lines[0].parts[0][0]).toEqual({ lat: 38.45, lng: -111.551 });
  });
});
