import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  alertsUrl, FORECAST_FRESH_MS, NWS_HEADERS, nwsCovers, parseAlerts, parsePeriods, parsePoint, parseSaved, pointsUrl, sameArea,
  weatherSpot, type NwsPoint, type Spot, type SpotWeather, type WeatherPeriod,
} from '@/core/weather';
import { positionIfAllowed } from '@/lib/location';

/**
 * Fetching the National Weather Service forecast (core/weather has the rules). Every screen and
 * thread asks through here, so one spot costs one /points call a month and one forecast every 20
 * minutes, however many maps are open. The last forecast is kept on the phone and still shows with
 * no service, with its age.
 */

const POINT_KEY = (s: Spot) => `weather.point.v1.${s.lat.toFixed(2)},${s.lng.toFixed(2)}`;
const LAST_KEY = 'weather.last.v1';
const POINT_KEEP_MS = 30 * 86_400_000;

const points = new Map<string, NwsPoint | null>();

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: NWS_HEADERS });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Which Weather Service forecast covers a spot (rounded first). Kept a month on the phone: the
 * Service's forecast squares don't move. Null outside the United States or with no service.
 */
export async function nwsPoint(p: Spot): Promise<NwsPoint | null> {
  const s = weatherSpot(p);
  if (!nwsCovers(s)) return null;
  const key = POINT_KEY(s);
  if (points.has(key)) return points.get(key) ?? null;
  const saved = await AsyncStorage.getItem(key).catch(() => null);
  if (saved) {
    try {
      const v = JSON.parse(saved) as { at: number; point: NwsPoint };
      if (Date.now() - v.at < POINT_KEEP_MS && v.point?.forecast) {
        points.set(key, v.point);
        return v.point;
      }
    } catch {
      // an old or broken entry: ask again
    }
  }
  const point = parsePoint(await getJson(pointsUrl(s)));
  if (point) {
    points.set(key, point);
    AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), point })).catch(() => {});
  }
  return point;
}

/** The 7-day forecast (a day and a night each) for a spot. Empty with no service or outside the U.S. */
export async function dayPeriods(p: Spot): Promise<WeatherPeriod[]> {
  const point = await nwsPoint(p);
  return point ? parsePeriods(await getJson(point.forecast)) : [];
}

/** The hour-by-hour forecast for a spot (about a week of hours). */
export async function hourPeriods(p: Spot): Promise<WeatherPeriod[]> {
  const point = await nwsPoint(p);
  return point ? parsePeriods(await getJson(point.hourly)) : [];
}

const inflight = new Map<string, Promise<SpotWeather | null>>();
let last: SpotWeather | null = null;
let lastRead = false;
const listeners = new Set<(w: SpotWeather | null) => void>();

async function lastSaved(): Promise<SpotWeather | null> {
  if (!lastRead) {
    lastRead = true;
    const saved = parseSaved(await AsyncStorage.getItem(LAST_KEY).catch(() => null));
    if (saved && (!last || saved.at > last.at)) last = saved;
  }
  return last;
}

/** Everything for one spot: days, hours and alerts. Shared by every caller asking at once. */
export function spotWeather(p: Spot): Promise<SpotWeather | null> {
  const s = weatherSpot(p);
  const key = `${s.lat},${s.lng}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const point = await nwsPoint(s);
    if (!point) return null;
    const [days, hours, alerts] = await Promise.all([
      getJson(point.forecast).then(parsePeriods),
      getJson(point.hourly).then(parsePeriods),
      getJson(alertsUrl(s)).then(parseAlerts),
    ]);
    if (!days.length && !hours.length) return null;
    const w: SpotWeather = { spot: s, place: point.place, days, hours, alerts, at: Date.now() };
    last = w;
    AsyncStorage.setItem(LAST_KEY, JSON.stringify(w)).catch(() => {});
    for (const l of listeners) l(w);
    return w;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** The time now, for picking the current hour: renewed every minute while `on`. */
export function useMinute(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [on]);
  return now;
}

/**
 * The forecast where the rider is, for the forecast bar on the map: the phone's own spot when
 * location is allowed (never asks), else the middle of the map. Fetched again every 20 minutes,
 * when the rider moves about 6 miles, and when the app comes back to the front. While `on` is
 * false nothing is fetched. Undefined while the first one loads; null when there's none (no
 * service and nothing saved, or outside the United States).
 */
export function useSpotWeather(on: boolean, mapCenter: Spot | null): SpotWeather | null | undefined {
  const [w, setW] = useState<SpotWeather | null | undefined>(undefined);
  const center = useRef(mapCenter);
  useEffect(() => {
    center.current = mapCenter;
  }, [mapCenter]);
  const centerKey = mapCenter ? `${Math.round(mapCenter.lat * 10)},${Math.round(mapCenter.lng * 10)}` : '';

  useEffect(() => {
    if (!on) return;
    let live = true;
    const show = (v: SpotWeather | null) => live && setW(v);
    const refresh = async () => {
      const where = (await positionIfAllowed()) ?? center.current;
      const saved = await lastSaved();
      if (!live) return;
      if (!where) return show(saved ?? null);
      const near = saved && sameArea(saved.spot, weatherSpot(where)) ? saved : null;
      if (near) show(near);
      if (near && Date.now() - near.at < FORECAST_FRESH_MS) return;
      const fresh = await spotWeather(where);
      show(fresh ?? near ?? null);
    };
    refresh();
    const timer = setInterval(refresh, FORECAST_FRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    // Another map fetched a newer one (the same rider, so the same spot or near it).
    const onNew = (v: SpotWeather | null) => v && show(v);
    listeners.add(onNew);
    return () => {
      live = false;
      clearInterval(timer);
      sub.remove();
      listeners.delete(onNew);
    };
  }, [on, centerKey]);

  return on ? w : null;
}
