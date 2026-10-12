import { describe, expect, it } from 'vitest';

import { clockText, parseTime } from '../time';
import {
  daylightBar, daylightCheck, forecastInRange, forecastUrl, parseForecast, spanText, startsIn, sunTimes, weatherWarnings, weatherWords,
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
  it('asks for the rounded area around the meet day', () => {
    const url = forecastUrl(38.5733, -109.5498, meet);
    expect(url).toContain('latitude=38.57&longitude=-109.55');
    expect(url).toContain('start_date=2026-10-17&end_date=2026-10-19');
    expect(url).toContain('temperature_unit=fahrenheit');
  });

  it('picks the meeting spot’s day, not UTC’s', () => {
    // 03:00 UTC on the 19th is still the evening of the 18th in Moab (UTC-6).
    const late = new Date('2026-10-19T03:00:00Z');
    const json = {
      utc_offset_seconds: -21600,
      daily: {
        time: ['2026-10-18', '2026-10-19'],
        weather_code: [95, 0],
        temperature_2m_max: [71.4, 60],
        temperature_2m_min: [44.6, 40],
        precipitation_probability_max: [70, 0],
        wind_speed_10m_max: [12.2, 5],
        wind_gusts_10m_max: [38, 9],
      },
    };
    expect(parseForecast(json, late)).toEqual({
      date: '2026-10-18', summary: 'Thunderstorms', highF: 71, lowF: 45, rainChance: 70, windMph: 12, gustMph: 38,
    });
  });

  it('returns null for a missing day or a broken response', () => {
    expect(parseForecast({ daily: { time: ['2026-10-01'] } }, meet)).toBeNull();
    expect(parseForecast(null, meet)).toBeNull();
    expect(parseForecast({ error: true }, meet)).toBeNull();
  });

  it('only asks within the forecast window', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(forecastInRange(meet, now)).toBe(true);
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
