import AsyncStorage from '@react-native-async-storage/async-storage';

import { FIRST_RIDE_DEFAULTS, parseRideDefaults, rememberSpot, type RecentSpot, type RideDefaults } from '@/core/quick-ride';

/** What Create a Ride remembers on this device: the last ride's choices and meeting points (core/quick-ride). */
const KEY = 'ride.quick-defaults.v1';

export async function loadRideDefaults(): Promise<RideDefaults> {
  return parseRideDefaults(await AsyncStorage.getItem(KEY).catch(() => null));
}

/** Called once a ride is created: its choices lead the next one. */
export async function saveRideDefaults(ride: Omit<RideDefaults, 'spots'>, spot: RecentSpot | null): Promise<void> {
  const before = await loadRideDefaults().catch(() => FIRST_RIDE_DEFAULTS);
  const next: RideDefaults = { ...ride, spots: spot ? rememberSpot(before.spots, spot) : before.spots };
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}
