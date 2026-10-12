/**
 * Ride day: when the sun comes up and goes down at the meeting spot, what the weather is doing,
 * and how long until the ride starts. Pure functions so they run offline and in tests.
 *
 * The forecast comes from Open-Meteo (free, no key, no account). It is asked about the ride's
 * public meeting area, which is already rounded to about a mile, never the exact meeting point.
 */

const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

/** Sunrise and sunset for the day around `at`, at a spot. Null on polar days or nights. */
export function sunTimes(at: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  // The NOAA / suncalc approach: solar noon, then the hour angle where the sun sits 0.833° below the horizon.
  const J1970 = 2440588;
  const J2000 = 2451545;
  const toDays = (d: Date) => d.getTime() / DAY_MS - 0.5 + J1970 - J2000;
  const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
  const lw = -lng * RAD;
  const phi = lat * RAD;
  const J0 = 0.0009;
  const n = Math.round(toDays(at) - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(RAD * 23.4397));
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW);
  const Jset = J2000 + J0 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

export type Daylight =
  | { kind: 'dark'; minutes: number } // back this many minutes after sunset
  | { kind: 'close'; minutes: number } // back this many minutes before sunset
  | { kind: 'fine'; minutes: number } // this much daylight to spare
  | { kind: 'unknown' }; // no finish time set

/** Within this many minutes of sunset counts as cutting it close. */
export const CLOSE_TO_DARK_MIN = 45;

/** Is the group back before dark? Based on the ride's Back By time. */
export function daylightCheck(finish: Date | null, sunset: Date | null): Daylight {
  if (!finish || !sunset) return { kind: 'unknown' };
  const minutes = Math.round((sunset.getTime() - finish.getTime()) / 60_000);
  if (minutes < 0) return { kind: 'dark', minutes: -minutes };
  if (minutes < CLOSE_TO_DARK_MIN) return { kind: 'close', minutes };
  return { kind: 'fine', minutes };
}

/** "1 hr 20 min", "45 min", "3 hr". */
export function spanText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Where the ride window sits on the day, for the daylight bar: 0 is first light of the bar's span,
 * 1 its end. The bar runs from an hour before sunrise to two hours after sunset, stretched to fit
 * the ride if it starts earlier or ends later.
 */
export function daylightBar(sun: { sunrise: Date; sunset: Date }, start: Date, finish: Date | null) {
  const from = Math.min(sun.sunrise.getTime() - 60 * 60_000, start.getTime());
  const to = Math.max(sun.sunset.getTime() + 2 * 60 * 60_000, finish?.getTime() ?? 0);
  const at = (t: number) => (t - from) / (to - from);
  return {
    sunrise: at(sun.sunrise.getTime()),
    sunset: at(sun.sunset.getTime()),
    start: at(start.getTime()),
    finish: finish ? at(finish.getTime()) : null,
  };
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

/** Open-Meteo forecasts this many days ahead. */
export const FORECAST_DAYS = 16;

export type DayForecast = {
  /** The day at the meeting spot, YYYY-MM-DD. */
  date: string;
  summary: string;
  highF: number;
  lowF: number;
  rainChance: number | null;
  windMph: number | null;
  gustMph: number | null;
};

/** Can we get a forecast for a ride that meets at `meetAt`? */
export function forecastInRange(meetAt: Date, now: Date): boolean {
  const ahead = meetAt.getTime() - now.getTime();
  return ahead > -DAY_MS && ahead < (FORECAST_DAYS - 1) * DAY_MS;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The Open-Meteo request for the days around the meet (the meeting spot's day can differ from UTC's). */
export function forecastUrl(lat: number, lng: number, meetAt: Date): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lng.toFixed(2),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    start_date: ymd(new Date(meetAt.getTime() - DAY_MS)),
    end_date: ymd(new Date(meetAt.getTime() + DAY_MS)),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

type OpenMeteo = {
  utc_offset_seconds?: number;
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    wind_gusts_10m_max?: (number | null)[];
  };
};

/** The meet day's forecast out of an Open-Meteo response, or null if it isn't there. */
export function parseForecast(json: unknown, meetAt: Date): DayForecast | null {
  const r = json as OpenMeteo | null;
  const d = r?.daily;
  if (!d?.time?.length) return null;
  const localDay = ymd(new Date(meetAt.getTime() + (r?.utc_offset_seconds ?? 0) * 1000));
  const i = d.time.indexOf(localDay);
  if (i < 0) return null;
  const hi = d.temperature_2m_max?.[i];
  const lo = d.temperature_2m_min?.[i];
  if (hi == null || lo == null) return null;
  const round = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  return {
    date: localDay,
    summary: weatherWords(d.weather_code?.[i] ?? null),
    highF: Math.round(hi),
    lowF: Math.round(lo),
    rainChance: round(d.precipitation_probability_max?.[i]),
    windMph: round(d.wind_speed_10m_max?.[i]),
    gustMph: round(d.wind_gusts_10m_max?.[i]),
  };
}

/** WMO weather codes in plain words. */
export function weatherWords(code: number | null): string {
  if (code == null) return 'Forecast';
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain Showers';
  if (code <= 86) return 'Snow Showers';
  return 'Thunderstorms';
}

/** Things worth a heads-up before loading the trailer. Empty when the day looks fine. */
export function weatherWarnings(f: DayForecast): string[] {
  const out: string[] = [];
  if (f.summary === 'Thunderstorms') out.push('Thunderstorms in the forecast. Watch for lightning and flash floods in washes.');
  else if ((f.rainChance ?? 0) >= 60) out.push(`${f.rainChance}% chance of rain. Trails can turn to mud.`);
  if ((f.gustMph ?? 0) >= 35) out.push(`Gusts up to ${f.gustMph} mph. Expect dust and blowing sand.`);
  if (f.highF >= 100) out.push(`${f.highF}°F high. Bring extra water and watch for overheating.`);
  if (f.lowF <= 32) out.push(`Freezing at ${f.lowF}°F. Dress in layers.`);
  return out;
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

/** "Starts in 25 min", "Starts in 5 hours", "Tomorrow", "In 4 days". Null once it's started. */
export function startsIn(meetAt: Date, now: Date): string | null {
  const min = Math.round((meetAt.getTime() - now.getTime()) / 60_000);
  if (min < 0) return null;
  if (min < 1) return 'Starting Now';
  if (min < 60) return `Starts in ${min} min`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(meetAt) - startOfDay(now)) / DAY_MS);
  if (days === 0 || min < 12 * 60) {
    const h = Math.round(min / 60);
    return `Starts in ${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  if (days === 1) return 'Tomorrow';
  return `In ${days} Days`;
}
