import { describe, expect, it } from 'vitest';

import {
  alertsUrl, hourLabel, nextHours, nowLine, nwsCovers, parseAlerts, parsePeriods, parsePoint, parseSaved, pointsUrl, radarLayer, radarSlot,
  RADAR_REFRESH_MS, radarTemplate, sameArea, titleWords, weatherSpot, wetFrom, windTop,
} from '../weather';

const LITTLE_SAHARA = { lat: 39.7163, lng: -112.3519 };

describe('radar', () => {
  it('asks NOAA for transparent squares Mapbox fills in, fresh every 5 minutes', () => {
    const t = radarTemplate(radarSlot(Date.UTC(2026, 10, 19, 16, 7)));
    expect(t).toMatch(/^https:\/\/mapservices\.weather\.noaa\.gov\/.+\/exportImage\?/);
    expect(t).toContain('bbox={bbox-epsg-3857}');
    expect(t).toContain('format=png32&transparent=true');
    expect(t).toContain('size=512,512');
    // NOAA says keep a square 12 hours, so each 5-minute slot asks for its own.
    expect(radarSlot(Date.UTC(2026, 10, 19, 16, 7))).toBe(radarSlot(Date.UTC(2026, 10, 19, 16, 9, 59)));
    expect(radarSlot(Date.UTC(2026, 10, 19, 16, 10))).not.toBe(radarSlot(Date.UTC(2026, 10, 19, 16, 9, 59)));
    expect(radarTemplate(1)).not.toBe(radarTemplate(2));
  });

  it('draws only when on, Pro, switched on by the owner and with service', () => {
    const now = 1795104000000;
    const all = { on: true, pro: true, flag: true, offline: false, now };
    const layer = radarLayer(all);
    expect(layer?.key).toBe(`radar-${radarSlot(now)}`);
    expect(layer?.at).toBe(radarSlot(now) * RADAR_REFRESH_MS);
    expect(radarLayer({ ...all, on: false })).toBeNull();
    expect(radarLayer({ ...all, pro: false })).toBeNull();
    expect(radarLayer({ ...all, flag: false })).toBeNull();
    expect(radarLayer({ ...all, offline: true })).toBeNull();
  });
});

describe('where to ask', () => {
  it('rounds the spot to about 3 miles before it leaves the phone', () => {
    expect(weatherSpot(LITTLE_SAHARA)).toEqual({ lat: 39.7, lng: -112.35 });
    expect(pointsUrl(LITTLE_SAHARA)).toBe('https://api.weather.gov/points/39.70,-112.35');
    expect(alertsUrl(LITTLE_SAHARA)).toBe('https://api.weather.gov/alerts/active?point=39.70,-112.35');
  });

  it('only asks the Weather Service inside the United States', () => {
    expect(nwsCovers(weatherSpot(LITTLE_SAHARA))).toBe(true);
    expect(nwsCovers({ lat: 61.2, lng: -149.9 })).toBe(true); // Anchorage
    expect(nwsCovers({ lat: 21.3, lng: -157.8 })).toBe(true); // Honolulu
    expect(nwsCovers({ lat: 48.85, lng: 2.35 })).toBe(false); // Paris
    expect(nwsCovers({ lat: 51.05, lng: -114.07 })).toBe(false); // Calgary
  });

  it('a new forecast once the rider is about 6 miles from the last one', () => {
    expect(sameArea({ lat: 39.7, lng: -112.35 }, { lat: 39.75, lng: -112.3 })).toBe(true);
    expect(sameArea({ lat: 39.7, lng: -112.35 }, { lat: 39.85, lng: -112.35 })).toBe(false);
  });

  it('reads where the forecasts are, and only from the Weather Service', () => {
    const ok = {
      properties: {
        forecast: 'https://api.weather.gov/gridpoints/SLC/78,130/forecast',
        forecastHourly: 'https://api.weather.gov/gridpoints/SLC/78,130/forecast/hourly',
        relativeLocation: { properties: { city: 'Leamington', state: 'UT' } },
      },
    };
    expect(parsePoint(ok)).toEqual({ forecast: ok.properties.forecast, hourly: ok.properties.forecastHourly, place: 'Leamington, UT' });
    expect(parsePoint({ properties: { ...ok.properties, forecast: 'https://evil.example/forecast' } })).toBeNull();
    expect(parsePoint({ status: 404 })).toBeNull();
    expect(parsePoint(null)).toBeNull();
  });
});

// The hourly forecast for Little Sahara on the morning of 2026-11-19 (MST), trimmed.
const hour = (h: number, temp: number, pop: number, words: string) => ({
  number: h, name: '', startTime: `2026-11-19T${String(h).padStart(2, '0')}:00:00-07:00`, endTime: `2026-11-19T${String(h + 1).padStart(2, '0')}:00:00-07:00`,
  isDaytime: true, temperature: temp, temperatureUnit: 'F', probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: pop },
  windSpeed: '6 mph', windDirection: 'ESE', shortForecast: words,
});
const HOURLY = {
  properties: {
    periods: [
      hour(9, 39, 18, 'Slight Chance Rain And Snow'), hour(10, 40, 18, 'Slight Chance Rain And Snow'), hour(11, 42, 51, 'Chance Rain And Snow'),
      hour(12, 43, 51, 'Chance Rain And Snow'), hour(13, 43, 51, 'Chance Rain And Snow'), hour(14, 44, 71, 'Rain And Snow Likely'),
    ],
  },
};
const NINE_THIRTY = Date.parse('2026-11-19T09:30:00-07:00');

describe('forecast', () => {
  it('reads the Weather Service periods in the app’s words', () => {
    const p = parsePeriods(HOURLY);
    expect(p).toHaveLength(6);
    expect(p[0]).toEqual({
      name: '', start: '2026-11-19T09:00:00-07:00', end: '2026-11-19T10:00:00-07:00', day: true, tempF: 39, precip: 18, windMph: 6, windDir: 'ESE',
      summary: 'Slight Chance Rain and Snow',
    });
    expect(parsePeriods({ properties: { periods: [{ startTime: 'x' }, null] } })).toEqual([]);
    expect(parsePeriods({ properties: { periods: [{ ...hour(9, 5, 0, 'Sunny'), temperatureUnit: 'C' }] } })[0].tempF).toBe(41);
  });

  it('takes the top of a wind range', () => {
    expect(windTop('5 to 22 mph')).toBe(22);
    expect(windTop('8 mph')).toBe(8);
    expect(windTop('')).toBeNull();
    expect(windTop(undefined)).toBeNull();
  });

  it('keeps small words small in the Service’s Title Case', () => {
    expect(titleWords('Rain And Snow Likely')).toBe('Rain and Snow Likely');
    expect(titleWords('Showers And Thunderstorms Then Mostly Sunny')).toBe('Showers and Thunderstorms then Mostly Sunny');
    expect(titleWords('And More')).toBe('And More');
  });

  it('starts from the hour it is now and says when the rain or snow comes', () => {
    const p = parsePeriods(HOURLY);
    expect(nextHours(p, NINE_THIRTY, 3).map((h) => h.tempF)).toEqual([39, 40, 42]);
    expect(nextHours(p, Date.parse('2026-11-19T20:00:00-07:00'))).toEqual([]);
    expect(wetFrom(p, NINE_THIRTY)?.start).toBe('2026-11-19T11:00:00-07:00');
    expect(hourLabel('2026-11-19T11:00:00-07:00')).toBe('11 AM');
    expect(hourLabel('2026-11-19T14:00:00-07:00')).toBe('2 PM');
    expect(hourLabel('2026-11-19T00:00:00-07:00')).toBe('12 AM');
    expect(nowLine(p, NINE_THIRTY)).toBe('Chance Rain and Snow by 11 AM');
    expect(nowLine(p, Date.parse('2026-11-19T14:10:00-07:00'))).toBe('Rain and Snow Likely');
  });

  it('lists official alerts, worst first, once each', () => {
    const alert = (event: string, severity: string, status = 'Actual') => ({ properties: { event, severity, status, headline: `${event} until 5 PM`, ends: '2026-11-20T17:00:00-07:00' } });
    const a = parseAlerts({ features: [alert('Winter Weather Advisory', 'Moderate'), alert('Flash Flood Warning', 'Severe'), alert('Winter Weather Advisory', 'Moderate'), alert('Test Message', 'Minor', 'Test')] });
    expect(a.map((x) => x.event)).toEqual(['Flash Flood Warning', 'Winter Weather Advisory']);
    expect(a[0]).toEqual({ event: 'Flash Flood Warning', headline: 'Flash Flood Warning until 5 PM', severity: 'Severe', ends: '2026-11-20T17:00:00-07:00' });
    expect(parseAlerts({})).toEqual([]);
  });

  it('throws away a saved forecast it can’t read', () => {
    const w = { spot: { lat: 39.7, lng: -112.35 }, place: null, days: [], hours: [], alerts: [], at: 1 };
    expect(parseSaved(JSON.stringify(w))).toEqual(w);
    expect(parseSaved(JSON.stringify({ ...w, alerts: undefined }))?.alerts).toEqual([]);
    expect(parseSaved('{oops')).toBeNull();
    expect(parseSaved(JSON.stringify({ at: 'x' }))).toBeNull();
    expect(parseSaved(null)).toBeNull();
  });
});
