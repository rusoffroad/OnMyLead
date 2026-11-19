import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_LAYERS, activityLayerDefs, activityLayersShown, activityRasters, avalancheGeoJSON, BYWAY_HUE_ROTATE, dangerName, parseAvalanche,
  parseNwsNow, parseNwsPoint, parseNwsSnowfall, parseSnotel, parseSnowDepthAt, readActivityLayerChoices, rnRasterPaint, snotelStatesIn, snowDepthTemplate, sledTrailsTemplate,
  stationsGeoJSON, twistyPieces, twistyStretches, webRasterPaint, zoneAt,
} from '../activity-layers';

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** A road from (lng0, lat0) heading east, `km` long, as [lng, lat] points every `stepM` metres. */
function road(shape: (xM: number) => number, km: number, stepM = 15, lat0 = 39.5, lng0 = -105.5): [number, number][] {
  const pts: [number, number][] = [];
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  for (let x = 0; x <= km * 1000; x += stepM) pts.push([lng0 + x / mPerLng, lat0 + shape(x) / 110_540]);
  return pts;
}

describe('activity layers', () => {
  it('gives Offroad nothing, so its map is unchanged', () => {
    expect(activityLayerDefs('offroad')).toEqual([]);
    expect(activityLayersShown('offroad', {})).toEqual([]);
  });

  it('gives each other activity its own layers, all on until switched off', () => {
    expect(activityLayersShown('snowmobile', {})).toEqual(['snowDepth', 'sledTrails', 'avalanche', 'snowStations', 'fallingSnow']);
    expect(activityLayersShown('motorcycle', {})).toEqual(['twistyRoads']);
    expect(activityLayersShown('road_trip', {})).toEqual(['byways', 'campgrounds']);
    expect(activityLayersShown('snowmobile', { avalanche: false })).not.toContain('avalanche');
  });

  it('leaves Falling Snow off the website and everything off with no signal', () => {
    expect(activityLayersShown('snowmobile', {}, { web: true })).not.toContain('fallingSnow');
    expect(activityLayersShown('snowmobile', {}, { offline: true })).toEqual([]);
  });

  it('reads saved switches and ignores junk', () => {
    expect(readActivityLayerChoices('{"snowDepth":false,"nope":true,"byways":"x"}')).toEqual({ snowDepth: false });
    expect(readActivityLayerChoices('not json')).toEqual({});
    expect(readActivityLayerChoices(null)).toEqual({});
    expect(readActivityLayerChoices('[1]')).toEqual({});
  });

  it('names every layer in Title Case with a line and a credit', () => {
    for (const l of ACTIVITY_LAYERS) {
      expect(l.name.split(' ').every((w) => /^[A-Z]/.test(w) || ['on', 'the'].includes(w))).toBe(true);
      expect(l.line.length).toBeGreaterThan(10);
      expect(l.attribution.length).toBeGreaterThan(3);
    }
  });
});

describe('server squares', () => {
  it('asks NOAA for a fresh snow analysis every six hours', () => {
    const a = snowDepthTemplate(new Date('2026-11-19T01:00:00Z'));
    expect(a).toContain('layers=show:0');
    expect(a).toContain('{bbox-epsg-3857}');
    expect(snowDepthTemplate(new Date('2026-11-19T05:59:00Z'))).toBe(a);
    expect(snowDepthTemplate(new Date('2026-11-19T06:01:00Z'))).not.toBe(a);
  });

  it('draws snow as a stretched white frost under the trails', () => {
    const [snow] = activityRasters(['snowDepth'], new Date());
    expect(snow.under).toBe(true);
    expect(snow.maxZ).toBeLessThanOrEqual(8);
    expect(snow.paint['raster-saturation']).toBe(-1);
    expect(snow.paint['raster-brightness-min']).toBeGreaterThan(0.7);
  });

  it('asks the Forest Service only for trails with a snowmobile season', () => {
    const url = decodeURIComponent(sledTrailsTemplate());
    expect(url).toContain('snowmobile_managed IS NOT NULL');
    expect(url).toContain('[trail_name]');
    expect(url).toContain('{bbox-epsg-3857}');
    expect(url).toContain('size=1024,1024');
  });

  it('turns the DOT green to gold', () => {
    expect(Math.round((hueOf('#00A884') + BYWAY_HUE_ROTATE) % 360)).toBeGreaterThanOrEqual(35);
    expect(Math.round((hueOf('#00A884') + BYWAY_HUE_ROTATE) % 360)).toBeLessThanOrEqual(48);
  });

  it('converts paint names for each map', () => {
    const p = { 'raster-opacity': 0.5, 'raster-hue-rotate': 10, 'raster-resampling-linear': 1 };
    expect(rnRasterPaint(p)).toEqual({ rasterOpacity: 0.5, rasterHueRotate: 10, rasterFadeDuration: 0 });
    expect(webRasterPaint(p)).toEqual({ 'raster-opacity': 0.5, 'raster-hue-rotate': 10, 'raster-fade-duration': 0 });
  });
});

const square = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];

describe('avalanche danger', () => {
  const body = {
    features: [
      { geometry: { type: 'Polygon', coordinates: square(-106, 39, -105, 40) }, properties: { name: 'Front Range', danger_level: 3, color: '#f7941e', link: 'https://x', off_season: false } },
      { geometry: { type: 'MultiPolygon', coordinates: [square(-111, 40, -110, 41)] }, properties: { name: 'Uintas', danger_level: -1, color: '#888888', off_season: true } },
      { geometry: null, properties: { name: 'Broken' } },
    ],
  };

  it('reads the zones and their danger', () => {
    const zones = parseAvalanche(body);
    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ name: 'Front Range', level: 3, color: '#f7941e' });
    expect(zones[1]).toMatchObject({ level: -1, offSeason: true });
    expect(dangerName(3)).toBe('Considerable');
    expect(dangerName(-1)).toBe('No Rating');
    expect(parseAvalanche(null)).toEqual([]);
  });

  it('labels rated zones with their danger and finds the zone a rider is in', () => {
    const zones = parseAvalanche(body);
    const fc = avalancheGeoJSON(zones);
    expect(fc.features[0].properties).toMatchObject({ rated: true, label: 'Front Range\nConsiderable' });
    expect(fc.features[1].properties).toMatchObject({ rated: false, label: 'Uintas' });
    expect(zoneAt(zones, { lat: 39.5, lng: -105.5 })?.name).toBe('Front Range');
    expect(zoneAt(zones, { lat: 35, lng: -100 })).toBeNull();
  });
});

describe('snow depth stations', () => {
  it('asks only for the SNOTEL states on screen', () => {
    expect(snotelStatesIn({ minLat: 39, maxLat: 40, minLng: -106, maxLng: -105 })).toEqual(['CO']);
    expect(snotelStatesIn({ minLat: 30, maxLat: 35, minLng: -90, maxLng: -80 })).toEqual([]);
  });

  it('keeps each station’s latest depth and the change since the reading before', () => {
    const stations = [
      { stationTriplet: '1:CO:SNTL', name: 'Berthoud Summit', latitude: 39.8, longitude: -105.78, elevation: 11300 },
      { stationTriplet: '2:CO:SNTL', name: 'No Data', latitude: 39, longitude: -106 },
    ];
    const data = [{ stationTriplet: '1:CO:SNTL', data: [{ stationElement: { elementCode: 'SNWD' }, values: [{ date: '2026-11-18', value: 18 }, { date: '2026-11-19', value: 24 }, { date: '2026-11-17', value: -3 }] }] }];
    const out = parseSnotel(stations, data);
    expect(out).toEqual([{ id: '1:CO:SNTL', name: 'Berthoud Summit', lat: 39.8, lng: -105.78, elevationFt: 11300, depthIn: 24, changeIn: 6, date: '2026-11-19' }]);
    expect(stationsGeoJSON(out).features[0].properties).toMatchObject({ label: '24″ +6', bare: false });
    expect(parseSnotel('x', [])).toEqual([]);
  });
});

describe('snow where you are', () => {
  const now = new Date('2026-11-19T12:00:00Z');

  it('reads the snow depth NOAA has for a spot, in inches', () => {
    expect(parseSnowDepthAt({ results: [{ attributes: { 'Service Pixel Value': '0.508' } }] })).toBe(20);
    expect(parseSnowDepthAt({ results: [{ attributes: { 'Service Pixel Value': 'NoData' } }] })).toBeNull();
    expect(parseSnowDepthAt({ results: [] })).toBeNull();
  });

  it('finds the forecast addresses and spots snow falling this hour', () => {
    expect(parseNwsPoint({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/BOU/36,66/forecast/hourly', forecastGridData: 'https://api.weather.gov/gridpoints/BOU/36,66' } }))
      .toEqual({ hourly: 'https://api.weather.gov/gridpoints/BOU/36,66/forecast/hourly', grid: 'https://api.weather.gov/gridpoints/BOU/36,66' });
    expect(parseNwsPoint({ properties: { forecastHourly: 'https://evil.example/x', forecastGridData: 'x' } })).toBeNull();
    const periods = [
      { startTime: '2026-11-19T04:00:00-07:00', endTime: '2026-11-19T05:00:00-07:00', shortForecast: 'Light Snow Likely', temperature: 21, temperatureUnit: 'F' },
      { startTime: '2026-11-19T05:00:00-07:00', endTime: '2026-11-19T06:00:00-07:00', shortForecast: 'Sunny', temperature: 25, temperatureUnit: 'F' },
    ];
    expect(parseNwsNow({ properties: { periods } }, now)).toEqual({ snowing: false, tempF: 25 });
    expect(parseNwsNow({ properties: { periods } }, new Date('2026-11-19T11:30:00Z'))).toEqual({ snowing: true, tempF: 21 });
    expect(parseNwsNow(null, now)).toBeNull();
  });

  it('adds up the next 24 hours of forecast snow, counting only the part of a block inside the day', () => {
    const values = [
      { validTime: '2026-11-19T06:00:00+00:00/PT6H', value: 50 },
      { validTime: '2026-11-19T12:00:00+00:00/PT6H', value: 25.4 },
      { validTime: '2026-11-20T06:00:00+00:00/PT12H', value: 50.8 },
      { validTime: '2026-11-21T00:00:00+00:00/P1D', value: 100 },
    ];
    expect(parseNwsSnowfall({ properties: { snowfallAmount: { uom: 'wmoUnit:mm', values } } }, now)).toBe(2);
    expect(parseNwsSnowfall({}, now)).toBeNull();
  });
});

describe('twisty roads', () => {
  it('finds nothing on a straight road or a long gentle bend', () => {
    expect(twistyStretches(road(() => 0, 5))).toEqual([]);
    // A 2 km radius bend: about 29 degrees per km.
    expect(twistyStretches(road((x) => 2000 - Math.sqrt(Math.max(0, 2000 ** 2 - (x - 1500) ** 2)), 3))).toEqual([]);
  });

  it('ignores a few metres of drawing wobble', () => {
    expect(twistyStretches(road((x) => (Math.round(x / 15) % 2 ? 2 : -2), 4))).toEqual([]);
  });

  it('scores tighter curves higher', () => {
    const level = (amp: number, wave: number) => {
      const st = twistyStretches(road((x) => amp * Math.sin((2 * Math.PI * x) / wave), 4, 10));
      return st.length ? Math.max(...st.map((s) => s.level)) : 0;
    };
    const gentle = level(25, 700);
    const tight = level(60, 220);
    expect(tight).toBe(3);
    expect(gentle).toBeGreaterThanOrEqual(0);
    expect(gentle).toBeLessThan(tight);
  });

  it('marks only the twisty part of a road', () => {
    const line = road((x) => (x > 2000 && x < 4000 ? 60 * Math.sin((2 * Math.PI * (x - 2000)) / 250) : 0), 6, 10);
    const [st] = twistyStretches(line);
    expect(st).toBeTruthy();
    const startKm = (st.from * 10) / 1000;
    const endKm = (st.to * 10) / 1000;
    expect(startKm).toBeGreaterThan(1.5);
    expect(endKm).toBeLessThan(4.5);
  });

  it('scores each line once though it arrives from several squares', () => {
    const line = road((x) => 60 * Math.sin((2 * Math.PI * x) / 250), 3, 10);
    const f = { geometry: { type: 'LineString', coordinates: line } };
    const once = twistyPieces([f]);
    const pieces = twistyPieces([f, f, { geometry: { type: 'Point', coordinates: [0, 0] } }, { geometry: null }]);
    expect(once.length).toBeGreaterThan(0);
    expect(pieces).toEqual(once);
    expect(pieces[0].points.length).toBeGreaterThan(10);
  });
});
