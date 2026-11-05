/**
 * Background location for Ride Mode and personal sharing.
 *
 * The phone records every fix locally first (so tracks survive dead zones), then tries to
 * upload the latest point. If the upload fails, points stay queued and go up on reconnect;
 * other riders meanwhile see this rider's last-known point and its age, never a live-looking dot.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { compassAllowed } from './compass';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Linking, Platform } from 'react-native';

import { MOVING_SPEED_MPS } from '@/core/bubble';
import { guessState, normalizeState } from '@/core/discovery';
import { shareStillOn, shouldSendFix } from '@/core/freshness';
import { distanceM } from '@/core/geo';
import { shouldFlushTrack } from '@/core/live-costs';
import { foregroundPermission as askOnlyIfNeeded } from '@/core/location-permission';
import { isApproximatePermission, shouldAskForGoogleAccuracy, shouldAskForPrecise } from '@/core/precise-location';
import type { BatteryPlan } from '@/core/battery';
import { batteryPlan } from './battery';
import { supabase } from './supabase';
import { nearbyOwnFix } from './nearby';
import { recordTrackFixes } from './track-line';

export const LOCATION_TASK = 'ride-location-updates';
/**
 * Track points not yet uploaded, kept per ride. Version 1 was one list for whatever ride was
 * active when it was flushed, so points left over from an earlier ride (no service when it
 * ended) were added to the next ride's track and its summary counted the jump between them.
 */
const QUEUE_KEY = 'ride.trackQueue.v2';
const OLD_QUEUE_KEY = 'ride.trackQueue.v1';
const CONTEXT_KEY = 'ride.trackContext.v1';

/** `until` is when the share ends (epoch ms, null for open-ended), checked here so sharing stops on time even with no service. */
type TrackContext = { rideId: string | null; lastMovedAt: number | null; until?: number | null };
// Altitude was added later; older stored points have four values.
// Accuracy was added in 2.0 so the summary can skip rough fixes; older points have five values or fewer.
type QueuedPoint = [lng: number, lat: number, epochSec: number, speedMps: number | null, altitudeM?: number | null, accuracyM?: number | null];
type TrackQueue = Record<string, QueuedPoint[]>;

async function readQueue(): Promise<TrackQueue> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

const writeQueue = (q: TrackQueue) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));

/** A fix rougher than this is never added to the ride track (it still updates the rider's dot). */
const MAX_TRACK_FIX_ACCURACY_M = 100;

async function readContext(): Promise<TrackContext> {
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  return raw ? JSON.parse(raw) : { rideId: null, lastMovedAt: null };
}

/** True while this phone is sharing its location on a group ride (Map Mode's Free clock doesn't run then). */
export async function sharingOnRide(): Promise<boolean> {
  return (await sharingRideId()) != null;
}

/** The group ride this phone is sharing its location on right now, or null (Map Mode adds waypoints to it). */
export async function sharingRideId(): Promise<string | null> {
  try {
    const ctx = await readContext();
    if (!ctx.rideId) return null;
    if (ctx.until != null && ctx.until < Date.now()) return null;
    if (Platform.OS === 'web') return ctx.rideId;
    return (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) ? ctx.rideId : null;
  } catch {
    return null;
  }
}

async function writeContext(ctx: TrackContext) {
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
}

// The phone reports fixes about once a second; only every 25 m or 15 s goes anywhere (wider on
// Battery Saver, see core/battery), so a parked rider still shows as live to the group (see
// core/freshness). Kept in memory: a cold start just sends.
let lastSent: { at: number; lat: number; lng: number } | null = null;
/** When queued track points last went up (this process); null sends the first batch at once. */
let lastTrackFlushAt: number | null = null;
let movedAt: number | null = null;

export async function handleLocations(locations: Location.LocationObject[]) {
  if (!locations.length) return;
  const latest = locations[locations.length - 1];
  // Track Line (Map Mode's breadcrumb) gets every fix while a ride shares location, if it's on.
  void recordTrackFixes(locations.map((l) => ({ lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? null, timestamp: l.timestamp })));
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
  const accuracy = latest.coords.accuracy ?? null;
  if (ctx.rideId && (accuracy == null || accuracy <= MAX_TRACK_FIX_ACCURACY_M)) {
    const queue = await readQueue();
    (queue[ctx.rideId] ??= []).push([
      next.lng, next.lat, Math.round(next.at / 1000), latest.coords.speed ?? null, latest.coords.altitude ?? null,
      accuracy != null ? Math.round(accuracy) : null,
    ]);
    await writeQueue(queue);
  }

  // Nearby riders hear it over Bluetooth too, with or without service (lib/nearby.ts; only while
  // Ride Mode has Bluetooth Sharing running and this rider is sharing with the ride).
  nearbyOwnFix({
    lat: next.lat, lng: next.lng, accuracyM: latest.coords.accuracy ?? null,
    speedMps: latest.coords.speed ?? null, headingDeg: latest.coords.heading ?? null, at: next.at,
  });

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
    // The track goes up in batches (each upload carries the whole track, so per-fix uploads
    // multiplied server traffic); stopping the share sends whatever is left.
    if (!error) {
      const pending = Object.values(await readQueue()).reduce((n, pts) => n + (pts?.length ?? 0), 0);
      if (shouldFlushTrack(lastTrackFlushAt, Date.now(), pending)) await flushTrack(userId);
    }
  } catch {
    // No service: the point is queued above and goes up with the next fix that gets through.
  }
}

/** Append queued points to each ride's own track. Safe to call repeatedly. */
export async function flushTrack(userId: string) {
  lastTrackFlushAt = Date.now();
  // The old single list can't say which ride its points belong to, so it is dropped rather than
  // risk adding them to the wrong ride.
  await AsyncStorage.removeItem(OLD_QUEUE_KEY).catch(() => {});
  const queue = await readQueue();
  for (const [rideId, pending] of Object.entries(queue)) {
    if (!pending?.length) {
      delete queue[rideId];
      continue;
    }
    const { data: existing, error: readError } = await supabase
      .from('ride_tracks')
      .select('points')
      .eq('ride_id', rideId)
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) continue;
    const points = [...((existing?.points as QueuedPoint[] | undefined) ?? []), ...pending];
    const { error } = await supabase
      .from('ride_tracks')
      .upsert({ ride_id: rideId, user_id: userId, points, updated_at: new Date().toISOString() });
    if (error) continue;
    // Points queued while this upload ran stay for the next flush.
    const now = await readQueue();
    const rest = (now[rideId] ?? []).slice(pending.length);
    if (rest.length) now[rideId] = rest;
    else delete now[rideId];
    await writeQueue(now);
  }
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
  await askForPreciseOnce(fg);
  await askForGoogleAccuracyOnce();
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
    request: () =>
      Location.requestForegroundPermissionsAsync().then((p) => {
        // A map that opened before this answer starts its compass now instead of at its next look.
        if (p.status === 'granted') compassAllowed();
        return p;
      }),
  });
}

let askedForPreciseThisLaunch = false;

/**
 * Approximate Location puts this rider a mile or more from where they are. On Android, asking
 * again shows "Change to precise location"; done once per launch so declining it doesn't loop.
 */
async function askForPreciseOnce(fg: Location.LocationPermissionResponse) {
  if (!shouldAskForPrecise(fg, Platform.OS, askedForPreciseThisLaunch)) return;
  askedForPreciseThisLaunch = true;
  await Location.requestForegroundPermissionsAsync().catch(() => null);
}

let askedForGoogleAccuracyThisLaunch = false;

/**
 * Android with Google Location Accuracy off has no network provider, and its fixes can be miles
 * off (Google Maps shows the same wrong spot). Shows Android's own "turn on" dialog, once per launch.
 */
async function askForGoogleAccuracyOnce() {
  if (!shouldAskForGoogleAccuracy(await googleAccuracyOn(), Platform.OS, askedForGoogleAccuracyThisLaunch)) return;
  askedForGoogleAccuracyThisLaunch = true;
  await Location.enableNetworkProviderAsync().catch(() => {});
}

/** Android's Google Location Accuracy (the network provider): false when off, null off Android or unknown. */
export async function googleAccuracyOn(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const s = await Location.getProviderStatusAsync();
    if (!s.locationServicesEnabled) return null; // Location itself is off: Ride Mode says so already.
    return s.networkAvailable ?? null;
  } catch {
    return null;
  }
}

/** The rider tapped the Google Location Accuracy banner: Android's dialog, else Location settings. */
export async function askForGoogleAccuracy(): Promise<void> {
  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
  }
}

/** Whether this phone gives the app only an approximate location (Android Approximate, iOS Precise off). */
export async function hasApproximateLocation(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return isApproximatePermission(await Location.getForegroundPermissionsAsync());
  } catch {
    return false;
  }
}

/**
 * The rider tapped Turn On Precise Location. Android asks in the app while it still can; otherwise
 * (and always on iPhone and iPad, where Precise is a switch in Settings) Settings opens.
 * Resolves true when the app opened Settings.
 */
export async function askForPreciseLocation(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const now = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (now?.canAskAgain) {
      await Location.requestForegroundPermissionsAsync().catch(() => null);
      return false;
    }
  }
  await Linking.openSettings().catch(() => {});
  return true;
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

/**
 * Stop sending location if this phone is sending it for `rideId` (the rider left that ride).
 * Sharing for another ride, or Out Riding, keeps going.
 */
export async function stopSendingLocationFor(rideId: string) {
  const ctx = await readContext().catch(() => null);
  if (ctx?.rideId === rideId) await stopSendingLocation();
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

/**
 * A rough fix only if the rider already allowed location: never asks. The home screen uses it to
 * sort public rides by distance without a permission prompt on launch. Null when not allowed or
 * no fix comes.
 */
export async function positionIfAllowed(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    if (Platform.OS !== 'web') {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null);
      if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    }
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: l.coords.latitude, lng: l.coords.longitude };
  } catch {
    return null;
  }
}
