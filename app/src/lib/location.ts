/**
 * Background location for Ride Mode and personal sharing.
 *
 * The phone records every fix locally first (so tracks survive dead zones), then tries to
 * upload the latest point. If the upload fails, points stay queued and go up on reconnect;
 * other riders meanwhile see this rider's last-known point and its age.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { MOVING_SPEED_MPS } from '@/core/bubble';
import { supabase } from './supabase';

export const LOCATION_TASK = 'ride-location-updates';
const QUEUE_KEY = 'ride.trackQueue.v1';
const CONTEXT_KEY = 'ride.trackContext.v1';

type TrackContext = { rideId: string | null; lastMovedAt: number | null };
type QueuedPoint = [lng: number, lat: number, epochSec: number, speedMps: number | null];

async function readContext(): Promise<TrackContext> {
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  return raw ? JSON.parse(raw) : { rideId: null, lastMovedAt: null };
}

async function writeContext(ctx: TrackContext) {
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
}

export async function handleLocations(locations: Location.LocationObject[]) {
  if (!locations.length) return;
  const ctx = await readContext();
  const latest = locations[locations.length - 1];
  for (const l of locations) {
    if ((l.coords.speed ?? 0) >= MOVING_SPEED_MPS) ctx.lastMovedAt = l.timestamp;
  }
  await writeContext(ctx);

  if (ctx.rideId) {
    const queue: QueuedPoint[] = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]');
    for (const l of locations) {
      queue.push([l.coords.longitude, l.coords.latitude, Math.round(l.timestamp / 1000), l.coords.speed ?? null]);
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  const speed = latest.coords.speed != null && latest.coords.speed >= 0 ? latest.coords.speed : null;
  const heading = latest.coords.heading != null && latest.coords.heading >= 0 ? latest.coords.heading : null;
  const { error } = await supabase.from('positions_latest').upsert({
    user_id: userId,
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
    speed_mps: speed,
    heading_deg: heading,
    accuracy_m: latest.coords.accuracy ?? null,
    last_moved_at: ctx.lastMovedAt ? new Date(ctx.lastMovedAt).toISOString() : null,
    recorded_at: new Date(latest.timestamp).toISOString(),
  });
  if (!error) await flushTrack(userId);
}

/** Append queued points to this rider's ride track. Safe to call repeatedly. */
export async function flushTrack(userId: string) {
  const ctx = await readContext();
  const queue: QueuedPoint[] = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]');
  if (!ctx.rideId || !queue.length) return;
  const { data: existing } = await supabase
    .from('ride_tracks')
    .select('points')
    .eq('ride_id', ctx.rideId)
    .eq('user_id', userId)
    .maybeSingle();
  const points = [...((existing?.points as QueuedPoint[] | undefined) ?? []), ...queue];
  const { error } = await supabase
    .from('ride_tracks')
    .upsert({ ride_id: ctx.rideId, user_id: userId, points, updated_at: new Date().toISOString() });
  if (!error) await AsyncStorage.setItem(QUEUE_KEY, '[]');
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    await handleLocations(data.locations);
  });
}

export async function requestLocationPermission(): Promise<'always' | 'while_using' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  if (Platform.OS === 'web') return 'while_using';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'always' : 'while_using';
}

/** Start sending location. Call only after the rider has chosen to share. */
export async function startSendingLocation(rideId: string | null) {
  await writeContext({ rideId, lastMovedAt: Date.now() });
  if (Platform.OS === 'web') return startWebWatch();
  const permission = await requestLocationPermission();
  if (permission === 'denied') throw new Error('Location permission is needed to share your location.');
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    // Every ~10 s or ~25 m while moving keeps Ride Bubble fresh without draining the battery.
    timeInterval: 10_000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    // Android requires a visible notification while sharing, which matches our privacy rule.
    foregroundService: {
      notificationTitle: 'Sharing your location',
      notificationBody: 'Tap to see who can see you or stop sharing.',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopSendingLocation() {
  if (Platform.OS === 'web') return stopWebWatch();
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) await flushTrack(data.session.user.id);
  await writeContext({ rideId: null, lastMovedAt: null });
}

let webSub: Location.LocationSubscription | null = null;
async function startWebWatch() {
  const permission = await requestLocationPermission();
  if (permission === 'denied') throw new Error('Location permission is needed to share your location.');
  webSub?.remove();
  webSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 },
    (l) => void handleLocations([l]),
  );
}
function stopWebWatch() {
  webSub?.remove();
  webSub = null;
}

export async function currentPosition() {
  const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: l.coords.latitude, lng: l.coords.longitude };
}
