import {
  AVALANCHE_URL, nwsPointUrl, parseAvalanche, parseNwsNow, parseNwsPoint, parseNwsSnowfall, parseSnotel, parseSnowDepthAt, snotelDepthUrl,
  snotelStationsUrl, snotelStatesIn, snowDepthAtUrl, type AvalancheZone, type Box, type SnowReport, type SnowStation,
} from '@/core/activity-layers';

/**
 * The live data behind the Snowmobile map (core/activity-layers.ts), fetched straight from the
 * public sources (each allows any website) and kept in memory for a while, so every map and the
 * Snow Near You card on Home share one copy. Nothing is sent but the map's spot, to two decimals.
 */

const AVALANCHE_TTL = 30 * 60_000;
const SNOTEL_TTL = 3 * 3600_000;
const WEATHER_TTL = 20 * 60_000;

type Entry<T> = { at: number; value: Promise<T> };
const cache = new Map<string, Entry<unknown>>();

function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  // A failed fetch isn't kept: the next map rest tries again.
  value.catch(() => cache.delete(key));
  return value;
}

async function json(url: string, timeoutMs = 20_000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Today's avalanche forecast zones (avalanche.org). */
export function avalancheZones(): Promise<AvalancheZone[]> {
  return cached('avalanche', AVALANCHE_TTL, async () => parseAvalanche(await json(AVALANCHE_URL)));
}

/** SNOTEL stations with their latest snow depth, for the states in the box. */
export async function snotelStations(box: Box): Promise<SnowStation[]> {
  const states = snotelStatesIn(box);
  const lists = await Promise.all(states.map((st) =>
    cached(`snotel-${st}`, SNOTEL_TTL, async () => {
      const [stations, data] = await Promise.all([json(snotelStationsUrl(st)), json(snotelDepthUrl(st, new Date()), 40_000)]);
      return parseSnotel(stations, data);
    }).catch(() => [] as SnowStation[]),
  ));
  return lists.flat();
}

/** The National Weather Service's forecast addresses for a spot (they never change for a place). */
function nwsPoint(lat: number, lng: number) {
  return cached(`nws-${lat.toFixed(2)},${lng.toFixed(2)}`, 24 * 3600_000, async () => parseNwsPoint(await json(nwsPointUrl(lat, lng))));
}

/** Snow at a spot: on the ground (NOAA), falling now and coming in the next day (NWS). US only; null elsewhere. */
export function snowReportAt(lat: number, lng: number): Promise<SnowReport | null> {
  const key = `snow-${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, WEATHER_TTL, async () => {
    const now = new Date();
    const [depthIn, point] = await Promise.all([
      json(snowDepthAtUrl(lat, lng)).then(parseSnowDepthAt).catch(() => null),
      nwsPoint(lat, lng).catch(() => null),
    ]);
    const [hour, next24In] = point
      ? await Promise.all([
          json(point.hourly).then((b) => parseNwsNow(b, now)).catch(() => null),
          json(point.grid).then((b) => parseNwsSnowfall(b, now)).catch(() => null),
        ])
      : [null, null];
    if (depthIn == null && !hour && next24In == null) return null;
    return { snowing: !!hour?.snowing, depthIn, next24In, tempF: hour?.tempF ?? null };
  });
}
