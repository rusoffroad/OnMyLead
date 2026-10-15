/**
 * Background location for Ride Mode and personal sharing.
 *
 * The phone records every fix locally first (so tracks survive dead zones), then tries to
 * upload the latest point. If the upload fails, points stay queued and go up on reconnect;
 * other riders meanwhile see this rider's last-known point and its age, never a live-looking dot.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { MOVING_SPEED_MPS } from '@/core/bubble';
import { guessState, normalizeState } from '@/core/discovery';
import { shareStillOn, shouldSendFix } from '@/core/freshness';
import { distanceM } from '@/core/geo';
import { foregroundPermission as askOnlyIfNeeded } from '@/core/location-permission';
import type { BatteryPlan } from '@/core/battery';
import { batteryPlan } from './battery';
import { supabase } from './supabase';

export const LOCATION_TASK = 'ride-location-updates';
const QUEUE_KEY = 'ride.trackQueue.v1';
const CONTEXT_KEY = 'ride.trackContext.v1';

/** `until` is when the share ends (epoch ms, null for open-ended), checked here so sharing stops on time even with no service. */
type TrackContext = { rideId: string | null; lastMovedAt: number | null; until?: number | null };
// Altitude was added later; older stored points have four values.
type QueuedPoint = [lng: number, lat: number, epochSec: number, speedMps: number | null, altitudeM?: number | null];

async function readContext(): Promise<TrackContext> {
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  return raw ? JSON.parse(raw) : { rideId: null, lastMovedAt: null };
}

async function writeContext(ctx: TrackContext) {
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
}

// The phone reports fixes about once a second; only every 25 m or 15 s goes anywhere (wider on
// Battery Saver, see core/battery), so a parked rider still shows as live to the group (see
// core/freshness). Kept in memory: a cold start just sends.
let lastSent: { at: number; lat: number; lng: number } | null = null;
let movedAt: number | null = null;

export async function handleLocations(locations: Location.LocationObject[]) {
  if (!locations.length) return;
  const latest = locations[locations.length - 1];
  for (const l of locations) {
    if ((l.coords.speed ?? 0) >= MOVING_SPEED_MPS) movedAt = Math.max(movedAt ?? 0, l.timestamp);
  }
  const next = { at: latest.timestamp, lat: latest.coords.latitude, lng: latest.coords.longitude };
  const plan = await batteryPlan();
  if (!shouldSendFix(lastSent, next, distanceM, plan.sendEveryM, plan.heartbeatSec)) return;
  lastSent = next;

  const ctx = await readContext();
  // The share's own end time stops sending on the phone, even when the server can't be reached to say so.
  if (!shareStillOn(ctx.until, Date.now())) {
    await stopSendingLocation();
    return;
  }
  if (movedAt != null && movedAt > (ctx.lastMovedAt ?? 0)) ctx.lastMovedAt = movedAt;
  await writeContext(ctx);

  // Every sent fix goes into the ride track first, so dead zones still show on the after-ride map.
  if (ctx.rideId) {
    const queue: QueuedPoint[] = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]');
    queue.push([next.lng, next.lat, Math.round(next.at / 1000), latest.coords.speed ?? null, latest.coords.altitude ?? null]);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;

    const speed = latest.coords.speed != null && latest.coords.speed >= 0 ? latest.coords.speed : null;
    const heading = latest.coords.heading != null && latest.coords.heading >= 0 ? latest.coords.heading : null;
    // Only the newest fix goes up, stamped with when it was taken, so after a dead zone the
    // group sees where this rider is now and never an old point passed off as new.
    const { error } = await supabase.from('positions_latest').upsert({
      user_id: userId,
      lat: next.lat,
      lng: next.lng,
      speed_mps: speed,
      heading_deg: heading,
      accuracy_m: latest.coords.accuracy ?? null,
      last_moved_at: ctx.lastMovedAt ? new Date(ctx.lastMovedAt).toISOString() : null,
      recorded_at: new Date(next.at).toISOString(),
    });
    // Back in service: send the track points saved while offline.
    if (!error) await flushTrack(userId);
  } catch {
    // No service: the point is queued above and goes up with the next fix that gets through.
  }
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

/**
 * Ask for location. On iPhone and iPad this asks for Always as a second step, so sharing keeps
 * going with the phone locked. Android doesn't need that: sharing runs in a foreground service
 * the rider started, which Android lets use While Using the App permission with the screen off,
 * shown by the Sharing Your Location notification. So the app never asks Android riders for
 * "Allow all the time" or sends them to Settings for it (and the app doesn't request
 * ACCESS_BACKGROUND_LOCATION at all, see app.json).
 */
export async function requestLocationPermission(): Promise<'always' | 'while_using' | 'denied'> {
  const fg = await foregroundPermission();
  if (fg.status !== 'granted') return 'denied';
  if (Platform.OS !== 'ios') return 'while_using';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'always' : 'while_using';
}

/**
 * While-using location permission, asking only when it isn't granted yet. On Android, asking always
 * opens the system's (invisible) permission screen even when access was given, which pauses the app;
 * Ride Mode resumes sharing every time the app comes back, so asking every time looped forever.
 */
function foregroundPermission() {
  return askOnlyIfNeeded({
    get: () => Location.getForegroundPermissionsAsync(),
    request: () => Location.requestForegroundPermissionsAsync(),
  });
}

/**
 * Android 13 and later hide the sharing notification unless the app may post notifications.
 * Sharing works either way; asking keeps the rider able to see and stop it from the shade.
 */
async function askToShowSharingNotice() {
  if (Platform.OS !== 'android') return;
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status !== 'granted' && p.canAskAgain !== false) await Notifications.requestPermissionsAsync();
  } catch {
    // Not fatal: sharing still runs.
  }
}

/**
 * Start sending location. Call only after the rider has chosen to share. Safe to call again for a
 * share that is already running (Ride Mode does on every open, so sharing resumes after the app
 * was closed or the phone restarted).
 * @param until when the share ends, epoch ms, or null for open-ended.
 */
export async function startSendingLocation(rideId: string | null, until: number | null = null) {
  const prev = await readContext();
  const resuming = prev.rideId === rideId;
  await writeContext({ rideId, lastMovedAt: resuming ? prev.lastMovedAt ?? Date.now() : Date.now(), until });
  if (!resuming) lastSent = null;
  if (Platform.OS === 'web') return startWebWatch();
  const permission = await requestLocationPermission();
  if (permission === 'denied') throw new Error('Location permission is needed to share your location.');
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    // The task stays registered after the app is updated, force-stopped or the phone restarts,
    // but Android's sharing service is gone then. Restart it once per app launch so a resumed
    // share really sends; later calls in the same launch leave the running service alone.
    if (startedThisLaunch || Platform.OS !== 'android') return;
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  }
  await askToShowSharingNotice();
  await startTask(await batteryPlan());
  startedThisLaunch = true;
}

const accuracyFor = (plan: BatteryPlan) => (plan.accuracy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced);

function startTask(plan: BatteryPlan) {
  return Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: accuracyFor(plan),
    // Every fix is reported and handleLocations sends one each 25 m or 15 s (Battery Saver widens
    // both), so a stopped rider keeps checking in. iOS has no time-based option, only distance, and
    // a distance filter would silence a parked rider, so it stays 0 there on every mode.
    timeInterval: plan.fixEveryMs,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    // Android requires a visible notification while sharing, which matches our privacy rule.
    foregroundService: {
      notificationTitle: 'Sharing Your Location',
      notificationBody: 'Tap to see who can see you or stop sharing.',
      notificationColor: '#E5262E',
      killServiceOnDestroy: false,
    },
  });
}

/**
 * Battery Saver changed: a share that is running picks up the new rate now rather than at the next
 * share. Called from the settings screen, so Android's foreground service restarts from the foreground.
 */
export async function applyBatteryPlan() {
  lastSent = null;
  if (Platform.OS === 'web') {
    if (webSub) await startWebWatch();
    return;
  }
  if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) return;
  await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  await startTask(await batteryPlan());
  startedThisLaunch = true;
}

/** Whether this app launch has started (or restarted) the location task itself. */
let startedThisLaunch = false;

export async function stopSendingLocation() {
  if (Platform.OS === 'web') return stopWebWatch();
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  startedThisLaunch = false;
  const { data } = await supabase.auth.getSession();
  if (data.session) await flushTrack(data.session.user.id);
  await writeContext({ rideId: null, lastMovedAt: null, until: null });
  lastSent = null;
  movedAt = null;
}

let webSub: Location.LocationSubscription | null = null;
async function startWebWatch() {
  const permission = await requestLocationPermission();
  if (permission === 'denied') throw new Error('Location permission is needed to share your location.');
  const plan = await batteryPlan();
  webSub?.remove();
  webSub = await Location.watchPositionAsync(
    { accuracy: accuracyFor(plan), timeInterval: plan.fixEveryMs, distanceInterval: 0 },
    (l) => void handleLocations([l]),
  );
}
function stopWebWatch() {
  webSub?.remove();
  webSub = null;
}

/** One fix, asking for while-using permission first (never background) if it was not granted yet. */
export async function currentPosition(accuracy = Location.Accuracy.High) {
  const fg = await foregroundPermission();
  if (fg.status !== 'granted') throw new Error('Allow location access in Settings to use your current location.');
  const l = await Location.getCurrentPositionAsync({ accuracy });
  return { lat: l.coords.latitude, lng: l.coords.longitude };
}

/** Two-letter US state for a point: the phone's reverse geocoder when it has one, else a box guess. */
export async function stateAt(p: { lat: number; lng: number }): Promise<string | null> {
  if (Platform.OS !== 'web') {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
      if (place && place.isoCountryCode && place.isoCountryCode !== 'US') return null;
      const code = normalizeState(place?.region);
      if (code) return code;
    } catch {
      // offline or no geocoder: fall through to the guess
    }
  }
  return guessState(p);
}
