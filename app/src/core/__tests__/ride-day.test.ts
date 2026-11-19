import { describe, expect, it } from 'vitest';

import { clockText, parseTime } from '../time';
import { parsePeriods } from '../weather';
import {
  dayForecastFrom, daylightBar, daylightCheck, forecastInRange, spanText, startsIn, sunTimes, weatherWarnings, weatherWords,
} from '../ride-day';

const MOAB = { lat: 38.57, lng: -109.55 };

describe('sun times', () => {
  it('matches published sunrise and sunset within a few minutes', () => {
    // Greenwich on the March 2026 equinox: sunrise 06:03, sunset 18:13 GMT.
    const g = sunTimes(new Date('2026-03-20T12:00:00Z'), 51.4779, 0)!;
    expect(Math.abs(g.sunrise.getTime() - Date.parse('2026-03-20T06:03:00Z'))).toBeLessThan(3 * 60_000);
    expect(Math.abs(g.sunset.getTime() - Date.parse('2026-03-20T18:13:00Z'))).toBeLessThan(3 * 60_000);
    // Moab, Oct 18 2026: about 7:32 am and 6:38 pm MDT.
    const t = sunTimes(new Date('2026-10-18T16:00:00Z'), MOAB.lat, MOAB.lng)!;
    expect(Math.abs(t.sunrise.getTime() - Date.parse('2026-10-18T13:32:00Z'))).toBeLessThan(3 * 60_000);
    expect(Math.abs(t.sunset.getTime() - Date.parse('2026-10-19T00:38:00Z'))).toBeLessThan(3 * 60_000);
  });

  it('gives the same day for an early meet and a late one', () => {
    const early = sunTimes(new Date('2026-10-18T13:00:00Z'), MOAB.lat, MOAB.lng)!;
    const late = sunTimes(new Date('2026-10-18T22:00:00Z'), MOAB.lat, MOAB.lng)!;
    expect(Math.abs(early.sunset.getTime() - late.sunset.getTime())).toBeLessThan(60_000);
  });

  it('returns null where the sun never sets', () => {
    expect(sunTimes(new Date('2026-06-21T12:00:00Z'), 80, 15)).toBeNull();
  });
});

describe('daylight check', () => {
  const sunset = new Date('2026-10-19T00:39:00Z');
  it('flags a ride back after dark', () => {
    expect(daylightCheck(new Date('2026-10-19T01:30:00Z'), sunset)).toEqual({ kind: 'dark', minutes: 51 });
  });
  it('flags cutting it close', () => {
    expect(daylightCheck(new Date('2026-10-19T00:09:00Z'), sunset)).toEqual({ kind: 'close', minutes: 30 });
  });
  it('is fine with time to spare', () => {
    expect(daylightCheck(new Date('2026-10-18T22:00:00Z'), sunset).kind).toBe('fine');
  });
  it('is unknown without a finish time', () => {
    expect(daylightCheck(null, sunset).kind).toBe('unknown');
  });
  it('writes spans plainly', () => {
    expect(spanText(45)).toBe('45 min');
    expect(spanText(180)).toBe('3 hr');
    expect(spanText(80)).toBe('1 hr 20 min');
  });
  it('places the ride inside the bar', () => {
    const sun = { sunrise: new Date('2026-10-18T13:39:00Z'), sunset };
    const b = daylightBar(sun, new Date('2026-10-18T14:00:00Z'), new Date('2026-10-19T03:00:00Z'));
    expect(b.start).toBeGreaterThan(b.sunrise);
    expect(b.finish).toBe(1); // a ride past the bar's usual end stretches it
    expect(b.sunset).toBeLessThan(1);
  });
});

describe('forecast', () => {
  const meet = new Date('2026-10-18T15:00:00Z');
  // The Weather Service's 7-day forecast: a day and a night each, on the spot's own clock (Moab, UTC-6).
  const nws = {
    properties: {
      periods: [
        { name: 'Today', startTime: '2026-10-18T06:00:00-06:00', endTime: '2026-10-18T18:00:00-06:00', isDaytime: true, temperature: 71, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 70 }, windSpeed: '5 to 12 mph', windDirection: 'SW', shortForecast: 'Showers And Thunderstorms Likely' },
        { name: 'Tonight', startTime: '2026-10-18T18:00:00-06:00', endTime: '2026-10-19T06:00:00-06:00', isDaytime: false, temperature: 45, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 40 }, windSpeed: '28 mph', windDirection: 'W', shortForecast: 'Chance Showers' },
        { name: 'Sunday', startTime: '2026-10-19T06:00:00-06:00', endTime: '2026-10-19T18:00:00-06:00', isDaytime: true, temperature: 60, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 0 }, windSpeed: '5 mph', windDirection: 'N', shortForecast: 'Sunny' },
      ],
    },
  };

  it('picks the meeting spot’s day, not UTC’s, from the Weather Service periods', () => {
    // 03:00 UTC on the 19th is still the evening of the 18th in Moab (UTC-6).
    const late = new Date('2026-10-19T03:00:00Z');
    expect(dayForecastFrom(parsePeriods(nws), late)).toEqual({
      date: '2026-10-18', summary: 'Showers and Thunderstorms Likely', highF: 71, lowF: 45, rainChance: 70, windMph: 28, gustMph: null,
    });
    expect(dayForecastFrom(parsePeriods(nws), new Date('2026-10-19T17:00:00Z'))?.summary).toBe('Sunny');
  });

  it('uses the night alone when the day has passed', () => {
    const evening = { properties: { periods: nws.properties.periods.slice(1) } };
    expect(dayForecastFrom(parsePeriods(evening), new Date('2026-10-19T02:00:00Z'))).toMatchObject({ highF: 45, lowF: 45, summary: 'Chance Showers' });
  });

  it('returns null for a missing day or a broken response', () => {
    expect(dayForecastFrom(parsePeriods(nws), new Date('2026-10-25T15:00:00Z'))).toBeNull();
    expect(dayForecastFrom(parsePeriods(null), meet)).toBeNull();
    expect(dayForecastFrom(parsePeriods({ error: true }), meet)).toBeNull();
  });

  it('only asks within the forecast window', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(forecastInRange(meet, now)).toBe(true);
    expect(forecastInRange(meet, new Date('2026-10-11T12:00:00Z'))).toBe(false);
    expect(forecastInRange(new Date('2026-11-20T12:00:00Z'), now)).toBe(false);
    expect(forecastInRange(new Date('2026-10-01T12:00:00Z'), now)).toBe(false);
  });

  it('names the weather and warns about the bad parts', () => {
    expect(weatherWords(0)).toBe('Clear');
    expect(weatherWords(63)).toBe('Rain');
    expect(weatherWords(96)).toBe('Thunderstorms');
    expect(weatherWarnings({ date: '', summary: 'Clear', highF: 75, lowF: 50, rainChance: 0, windMph: 5, gustMph: 10 })).toEqual([]);
    const w = weatherWarnings({ date: '', summary: 'Thunderstorms', highF: 104, lowF: 30, rainChance: 80, windMph: 20, gustMph: 40 });
    expect(w).toHaveLength(4);
    expect(w[0]).toMatch(/lightning/);
    // The Weather Service's words, and its wind (it gives no gusts).
    expect(weatherWarnings({ date: '', summary: 'Showers and Thunderstorms Likely', highF: 70, lowF: 50, rainChance: 70, windMph: 28, gustMph: null })).toEqual([
      'Thunderstorms in the forecast. Watch for lightning and flash floods in washes.',
      'Wind up to 28 mph. Expect dust and blowing sand.',
    ]);
  });
});

describe('countdown', () => {
  const now = new Date(2026, 9, 12, 9, 0);
  it('counts down in plain words', () => {
    expect(startsIn(new Date(2026, 9, 12, 9, 25), now)).toBe('Starts in 25 min');
    expect(startsIn(new Date(2026, 9, 12, 14, 0), now)).toBe('Starts in 5 hours');
    expect(startsIn(new Date(2026, 9, 12, 10, 0), now)).toBe('Starts in 1 hour');
    expect(startsIn(new Date(2026, 9, 13, 8, 0), now)).toBe('Tomorrow');
    expect(startsIn(new Date(2026, 9, 16, 8, 0), now)).toBe('In 4 Days');
    expect(startsIn(new Date(2026, 9, 12, 8, 0), now)).toBeNull();
  });
  it('says hours, not tomorrow, for an early start the next morning', () => {
    expect(startsIn(new Date(2026, 9, 13, 6, 0), new Date(2026, 9, 12, 22, 0))).toBe('Starts in 8 hours');
  });
});

describe('Ride Again times', () => {
  it('writes a time the ride form reads back', () => {
    for (const [h, m] of [[0, 5], [8, 0], [12, 30], [16, 45], [23, 59]]) {
      const text = clockText(new Date(2026, 9, 18, h, m));
      expect(parseTime(text)).toBe(h * 60 + m);
    }
    expect(clockText(new Date(2026, 9, 18, 8, 0))).toBe('8:00 am');
  });
});
