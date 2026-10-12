import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { forecastInRange, forecastUrl, parseForecast, type DayForecast } from '@/core/ride-day';

const key = (rideId: string) => `ride.forecast.v1.${rideId}`;

/**
 * The meet day's forecast for a ride, from Open-Meteo. The last one fetched is kept on the phone,
 * so it still shows at a trailhead with no signal. Undefined while loading, null when there's none.
 */
export function useRideForecast(ride: { id: string; meet_at: string; meet_area_lat: number; meet_area_lng: number } | null) {
  const [forecast, setForecast] = useState<DayForecast | null | undefined>(undefined);
  const id = ride?.id;
  const meetAt = ride?.meet_at;
  const lat = ride?.meet_area_lat;
  const lng = ride?.meet_area_lng;
  const inRange = !!meetAt && forecastInRange(new Date(meetAt), new Date());

  useEffect(() => {
    if (!id || !meetAt || lat == null || lng == null || !inRange) return;
    const meet = new Date(meetAt);
    let live = true;
    (async () => {
      const saved = await AsyncStorage.getItem(key(id)).catch(() => null);
      const cached = saved ? (JSON.parse(saved) as DayForecast) : null;
      if (live && cached) setForecast(cached);
      try {
        const res = await fetch(forecastUrl(lat, lng, meet));
        const f = res.ok ? parseForecast(await res.json(), meet) : null;
        if (!live) return;
        setForecast(f ?? cached);
        if (f) AsyncStorage.setItem(key(id), JSON.stringify(f)).catch(() => {});
      } catch {
        if (live) setForecast(cached);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, meetAt, lat, lng, inRange]);

  return inRange ? forecast : null;
}
