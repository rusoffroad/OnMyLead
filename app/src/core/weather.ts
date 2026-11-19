import { tc } from './i18n';

/**
 * Weather: the Weather Radar on the map and the forecast where the rider is. Pure, so it is
 * tested without a phone (core/__tests__/weather.test.ts); lib/weather.ts does the fetching.
 *
 * Everything comes from the U.S. government, free for any app, paid or not, with no key:
 *   * radar: NOAA's radar mosaic (every Doppler radar in the country, as one picture), drawn as map
 *     squares the same way as the Forest Service and BLM maps (bbox-epsg-3857 squares);
 *   * forecast, hourly forecast and alerts: the National Weather Service (api.weather.gov).
 * Both cover the United States only, where the app is sold. Nothing about the rider is sent but a
 * map square or a spot rounded to about 3 miles (WEATHER_SPOT_STEP).
 *
 * Open-Meteo, used before for Ride Day, is free only for apps without subscriptions, and
 * OnMyLead has Pro, so the app no longer asks it anything.
 */

const MIN_MS = 60_000;

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

/**
 * NOAA's radar mosaic (MRMS base reflectivity), one square per {minX},{minY},{maxX},{maxY}. The
 * squares are 512 points (RADAR_TILE_SIZE): the radar is coarse, so bigger squares mean a quarter
 * of the requests with nothing lost.
 */
export const RADAR_EXPORT =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/exportImage' +
  '?bbox={minX},{minY},{maxX},{maxY}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';

export const RADAR_TILE_SIZE = 512;

/** NOAA updates the mosaic every 2 minutes; the map asks for fresh squares every 5. */
export const RADAR_REFRESH_MS = 5 * MIN_MS;

/** How see-through the radar is over the map, so trails and roads still read under the rain. */
export const RADAR_OPACITY = 0.62;

/** The radar is a picture about a kilometre to the pixel: from far out it is the whole storm, close in it blurs. */
export const RADAR_MAX_Z = 13;

export const RADAR_ATTRIBUTION = 'NOAA National Weather Service radar';

/** The light-to-heavy colours NOAA paints the radar in, for the key on the map. */
export const RADAR_KEY_COLORS = ['#5B6FC4', '#3FB4C9', '#33C24A', '#1F8F2A', '#F2E33A', '#F2A12C', '#E5352B', '#C42FA8'];

/** The 5-minute slot `now` falls in. The squares are asked for again when it changes. */
export function radarSlot(now: number): number {
  return Math.floor(now / RADAR_REFRESH_MS);
}

/**
 * The radar squares for one slot. NOAA tells phones to keep a square for 12 hours, so each slot
 * asks for its own (`t`), or the map would show this morning's rain all afternoon.
 */
export function radarTemplate(slot: number): string {
  return `${RADAR_EXPORT}&t=${slot}`.replace('{minX},{minY},{maxX},{maxY}', '{bbox-epsg-3857}');
}

/** The radar layer a map draws (Mapbox fills in {bbox-epsg-3857}): `key` changes with the slot, so the map makes a fresh layer. */
export type RadarLayer = { key: string; template: string; at: number };

/** The radar to draw, or none: switched off, not Pro, switched off on the server, or no service. */
export function radarLayer(o: { on: boolean; pro: boolean; flag: boolean; offline: boolean; now: number }): RadarLayer | null {
  if (!o.on || !o.pro || !o.flag || o.offline) return null;
  const slot = radarSlot(o.now);
  return { key: `radar-${slot}`, template: radarTemplate(slot), at: slot * RADAR_REFRESH_MS };
}

// ---------------------------------------------------------------------------
// Where to ask
// ---------------------------------------------------------------------------

/** Spots are rounded to this many degrees (about 3 miles) before asking: plenty for a forecast, and private. */
export const WEATHER_SPOT_STEP = 0.05;

export type Spot = { lat: number; lng: number };

/** The rider's spot, rounded (WEATHER_SPOT_STEP). */
export function weatherSpot(p: Spot): Spot {
  const r = (v: number) => Math.round(Math.round(v / WEATHER_SPOT_STEP) * WEATHER_SPOT_STEP * 100) / 100;
  return { lat: r(p.lat), lng: r(p.lng) };
}

/** Roughly inside the United States and its territories the Weather Service covers. */
export function nwsCovers(p: Spot): boolean {
  const conus = p.lat >= 24 && p.lat <= 50 && p.lng >= -125.5 && p.lng <= -66;
  const alaska = p.lat >= 51 && p.lat <= 72 && p.lng >= -180 && p.lng <= -129;
  const hawaii = p.lat >= 18.5 && p.lat <= 22.5 && p.lng >= -161 && p.lng <= -154;
  const pr = p.lat >= 17.5 && p.lat <= 18.7 && p.lng >= -67.5 && p.lng <= -64.5;
  return conus || alaska || hawaii || pr;
}

export const NWS_API = 'https://api.weather.gov';

/** The Weather Service asks every app to say who it is (browsers send their own and ignore this). */
export const NWS_HEADERS = { Accept: 'application/geo+json', 'User-Agent': 'OnMyLead (onmylead.com)' };

/** The first question: which Weather Service forecast square covers a spot. */
export function pointsUrl(p: Spot): string {
  const s = weatherSpot(p);
  return `${NWS_API}/points/${s.lat.toFixed(2)},${s.lng.toFixed(2)}`;
}

export function alertsUrl(p: Spot): string {
  const s = weatherSpot(p);
  return `${NWS_API}/alerts/active?point=${s.lat.toFixed(2)},${s.lng.toFixed(2)}`;
}

/** What /points says: where the forecasts are, and the nearest town for the heading. */
export type NwsPoint = { forecast: string; hourly: string; place: string | null };

export function parsePoint(json: unknown): NwsPoint | null {
  const p = (json as { properties?: Record<string, unknown> } | null)?.properties;
  const forecast = typeof p?.forecast === 'string' ? p.forecast : null;
  const hourly = typeof p?.forecastHourly === 'string' ? p.forecastHourly : null;
  if (!forecast || !hourly || !forecast.startsWith(NWS_API) || !hourly.startsWith(NWS_API)) return null;
  const rel = (p?.relativeLocation as { properties?: { city?: unknown; state?: unknown } } | undefined)?.properties;
  const place = typeof rel?.city === 'string' && typeof rel?.state === 'string' ? `${rel.city}, ${rel.state}` : null;
  return { forecast, hourly, place };
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

/** One Weather Service forecast period: a day, a night, or an hour. */
export type WeatherPeriod = {
  name: string;
  /** ISO time with the spot's own offset, e.g. 2026-11-19T09:00:00-07:00. */
  start: string;
  end: string;
  day: boolean;
  tempF: number;
  /** Chance of rain or snow, 0 to 100, or null when the Service gives none. */
  precip: number | null;
  /** The top of the wind range, mph ("5 to 22 mph" is 22). */
  windMph: number | null;
  windDir: string | null;
  /** The Service's own words, e.g. "Chance Rain And Snow", in Title Case. */
  summary: string;
};

/** "5 to 22 mph" → 22, "8 mph" → 8, "" → null. */
export function windTop(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const n = [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
  return n.length ? Math.max(...n) : null;
}

/** "Chance Rain And Snow" → "Chance Rain and Snow" (the app's Title Case keeps small words small). */
export function titleWords(s: string): string {
  const small = new Set(['And', 'Or', 'Of', 'Then', 'The', 'A', 'An', 'In', 'On', 'At', 'To', 'With']);
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w.toLowerCase() : w))
    .join(' ');
}

/** The periods of a /forecast or /forecast/hourly answer, in order. Bad rows are left out. */
export function parsePeriods(json: unknown): WeatherPeriod[] {
  const list = (json as { properties?: { periods?: unknown[] } } | null)?.properties?.periods;
  if (!Array.isArray(list)) return [];
  const out: WeatherPeriod[] = [];
  for (const raw of list) {
    const p = (raw ?? {}) as Record<string, unknown>;
    if (typeof p.startTime !== 'string' || typeof p.endTime !== 'string' || typeof p.temperature !== 'number') continue;
    const unit = p.temperatureUnit === 'C' ? 'C' : 'F';
    const pop = (p.probabilityOfPrecipitation as { value?: unknown } | undefined)?.value;
    out.push({
      name: typeof p.name === 'string' ? p.name : '',
      start: p.startTime,
      end: p.endTime,
      day: p.isDaytime !== false,
      tempF: Math.round(unit === 'C' ? (p.temperature * 9) / 5 + 32 : p.temperature),
      precip: typeof pop === 'number' ? Math.round(pop) : null,
      windMph: windTop(p.windSpeed),
      windDir: typeof p.windDirection === 'string' && p.windDirection ? p.windDirection : null,
      summary: titleWords(typeof p.shortForecast === 'string' ? p.shortForecast : ''),
    });
  }
  return out;
}

/** The hours from the one `now` is in, `count` of them. */
export function nextHours(hours: WeatherPeriod[], now: number, count = 6): WeatherPeriod[] {
  const i = hours.findIndex((h) => Date.parse(h.end) > now);
  return i < 0 ? [] : hours.slice(i, i + count);
}

/** The first hour the rain or snow chance reaches `at` percent, in the next `within` hours. */
export function wetFrom(hours: WeatherPeriod[], now: number, at = 50, within = 12): WeatherPeriod | null {
  return nextHours(hours, now, within).find((h) => (h.precip ?? 0) >= at) ?? null;
}

/** "2 PM" at the spot's own clock (from the period's offset, not the phone's time zone). */
export function hourLabel(iso: string): string {
  const h = Number(iso.slice(11, 13));
  if (!Number.isFinite(h)) return '';
  const h12 = h % 12 || 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The short line beside the temperature: rain or snow coming, or what it's doing now. */
export function nowLine(hours: WeatherPeriod[], now: number): string | null {
  const first = nextHours(hours, now, 1)[0];
  if (!first) return null;
  if ((first.precip ?? 0) >= 50) return first.summary || null;
  const wet = wetFrom(hours, now);
  if (wet) return tc('{what} by {time}', { what: wet.summary, time: hourLabel(wet.start) });
  return first.summary || null;
}

export type WeatherAlert = { event: string; headline: string; severity: string; ends: string | null };

/** Official alerts for the spot (warnings first), from /alerts/active. */
export function parseAlerts(json: unknown): WeatherAlert[] {
  const list = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(list)) return [];
  const rank: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
  const out: WeatherAlert[] = [];
  for (const f of list) {
    const p = (f as { properties?: Record<string, unknown> }).properties;
    if (!p || typeof p.event !== 'string' || p.status === 'Test') continue;
    const ends = typeof p.ends === 'string' ? p.ends : typeof p.expires === 'string' ? p.expires : null;
    out.push({ event: p.event, headline: typeof p.headline === 'string' ? p.headline : p.event, severity: typeof p.severity === 'string' ? p.severity : 'Unknown', ends });
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4))
    .filter((a) => (seen.has(a.event) ? false : (seen.add(a.event), true)));
}

/** Everything the forecast bar and the Weather sheet show for one spot. */
export type SpotWeather = {
  spot: Spot;
  place: string | null;
  days: WeatherPeriod[];
  hours: WeatherPeriod[];
  alerts: WeatherAlert[];
  /** When it was fetched (ms). An old one is still shown with no service, with its age. */
  at: number;
};

/** A forecast older than this is fetched again. */
export const FORECAST_FRESH_MS = 20 * MIN_MS;

/** A spot farther than this from the last forecast's (about 6 miles) gets its own forecast. */
export function sameArea(a: Spot, b: Spot): boolean {
  return Math.abs(a.lat - b.lat) <= 0.1 && Math.abs(a.lng - b.lng) <= 0.1;
}

/** Throw away saved forecasts that make no sense (a different shape from an older build). */
export function parseSaved(raw: string | null): SpotWeather | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(raw) as SpotWeather;
    if (!w || typeof w.at !== 'number' || !Array.isArray(w.days) || !Array.isArray(w.hours) || !w.spot) return null;
    return { ...w, alerts: Array.isArray(w.alerts) ? w.alerts : [] };
  } catch {
    return null;
  }
}
