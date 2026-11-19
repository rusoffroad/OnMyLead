import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

import { radarLayer, radarSlot, RADAR_REFRESH_MS, type RadarLayer } from '@/core/weather';
import { useFlag } from '@/lib/app-settings';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Weather Radar on the map (Pro). Off until the rider turns it on. Synced to their other devices. */
export const WEATHER_RADAR_KEY = 'map.weatherRadar.v1';
/** The forecast button on Ride Mode and Map Mode (free). Off until the rider turns it on. */
export const WEATHER_FORECAST_KEY = 'map.weatherForecast.v1';

export type MapWeather = {
  /** The rider's Weather Radar switch (what they picked, Pro or not). */
  radarOn: boolean;
  setRadar: (on: boolean) => void;
  /** The radar switch is offered (the owner hasn't switched it off on Admin > Features). */
  radarOffered: boolean;
  /** The rider's Forecast Where You Are switch, and whether it's offered. */
  forecastOn: boolean;
  setForecast: (on: boolean) => void;
  forecastOffered: boolean;
  /** The radar every map draws now: null when off, not Pro, switched off on the server, or no service. */
  radar: RadarLayer | null;
};

/** One saved on-off switch, shared by every map and synced (lib/settings-sync). */
function useSwitch(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .catch(() => null)
      .then((v) => live && setOn(v === '1'));
    const off = onSyncedChange(key, (v) => setOn(v === '1'));
    return () => {
      live = false;
      off();
    };
  }, [key]);
  const set = (v: boolean) => {
    setOn(v);
    setSyncedItem(key, v ? '1' : '0').catch(() => {});
  };
  return [on, set];
}

/**
 * The weather on the map (core/weather): the rider's two switches, and the radar squares to draw,
 * renewed every 5 minutes while the map is open.
 */
export function useMapWeather({ pro, offline }: { pro: boolean; offline: boolean }): MapWeather {
  const [radarOn, setRadar] = useSwitch(WEATHER_RADAR_KEY);
  const [forecastOn, setForecast] = useSwitch(WEATHER_FORECAST_KEY);
  const radarOffered = useFlag('weather_radar');
  const forecastOffered = useFlag('weather_forecast');
  const drawing = radarOn && pro && radarOffered && !offline;
  const [slot, setSlot] = useState(() => radarSlot(Date.now()));
  useEffect(() => {
    if (!drawing) return;
    // Now (the slot may be old after the radar was off), then just after each 5-minute mark.
    const tick = () => setSlot(radarSlot(Date.now()));
    const now = setTimeout(tick, 0);
    let every: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      tick();
      every = setInterval(tick, RADAR_REFRESH_MS);
    }, RADAR_REFRESH_MS - (Date.now() % RADAR_REFRESH_MS) + 1000);
    return () => {
      clearTimeout(now);
      clearTimeout(first);
      if (every) clearInterval(every);
    };
  }, [drawing]);
  const radar = useMemo(() => radarLayer({ on: drawing, pro: true, flag: true, offline: false, now: slot * RADAR_REFRESH_MS }), [drawing, slot]);
  return { radarOn, setRadar, radarOffered, forecastOn: forecastOn && forecastOffered, setForecast, forecastOffered, radar };
}
