/**
 * You > Permissions on iPhone, iPad and Android: reads every permission OnMyLead uses and asks for
 * one again. Rules (statuses, what a tap does) are in core/permissions.ts; the website has
 * lib/permissions.web.ts. Each read never throws: a call the phone or build can't answer reads
 * as 'unknown'.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { DeviceMotion } from 'expo-sensors';
import * as Tracking from 'expo-tracking-transparency';
import { Linking, Platform } from 'react-native';

import {
  alwaysStatus,
  fromAndroidResults,
  fromBluetoothAuthorization,
  fromExpo,
  permissionAction,
  platformStatus,
  preciseStatus,
  type PermissionId,
  type PermissionPlatform,
  type PermissionStatus,
} from '@/core/permissions';
import { askForTrackingNow } from '@/lib/ad-tracking';
import { googleAccuracyOn, requestLocationPermission } from '@/lib/location';
import { askMusicAccess, musicAccess, openMusicAccessSettings } from '@/lib/music';
import { askBluetoothPermission, bluetoothPermission } from '@/lib/nearby';
import { askPushPermission } from '@/lib/push';

export const PERMISSION_PLATFORM: PermissionPlatform = Platform.OS === 'ios' ? 'ios' : 'android';

export type PermissionReport = {
  statuses: Partial<Record<PermissionId, PermissionStatus>>;
  /** Location is switched off for the whole phone (Location Services / Use Location). */
  locationServicesOff: boolean;
};

/** Android can't say whether Bluetooth was turned down for good, so the last answer is kept. */
const KEY_BT_BLOCKED = 'onmylead.permissions.bluetoothBlocked';
/** Faster than anyone can answer a dialog: Android showed none. */
const ANSWERED_AT_ONCE_MS = 400;

const safe = async <T,>(f: () => Promise<T>): Promise<T | null> => {
  try {
    return await f();
  } catch {
    return null;
  }
};

const status = (p: Parameters<typeof fromExpo>[0]) => platformStatus(fromExpo(p), PERMISSION_PLATFORM);

/** Every permission's status right now. */
export async function readPermissions(): Promise<PermissionReport> {
  const ios = Platform.OS === 'ios';
  const [fg, bg, services, google, push, bt, btBlocked, motion, camera, music, tracking] = await Promise.all([
    safe(() => Location.getForegroundPermissionsAsync()),
    ios ? safe(() => Location.getBackgroundPermissionsAsync()) : Promise.resolve(null),
    safe(() => Location.hasServicesEnabledAsync()),
    ios ? Promise.resolve(null) : safe(() => googleAccuracyOn()),
    safe(() => Notifications.getPermissionsAsync()),
    safe(() => bluetoothPermission()),
    ios ? Promise.resolve(null) : safe(() => AsyncStorage.getItem(KEY_BT_BLOCKED)),
    ios ? safe(() => DeviceMotion.getPermissionsAsync()) : Promise.resolve(null),
    safe(() => ImagePicker.getCameraPermissionsAsync()),
    safe(() => musicAccess()),
    ios ? safe(() => Tracking.getTrackingPermissionsAsync()) : Promise.resolve(null),
  ]);

  const location = status(fg);
  const accuracy = ios ? fg?.ios?.accuracy : fg?.android?.accuracy;
  const statuses: PermissionReport['statuses'] = {
    location,
    locationAlways: alwaysStatus(location, status(bg)),
    preciseLocation: preciseStatus(location, accuracy),
    googleAccuracy: location !== 'granted' ? 'needsFirst' : google == null ? 'unknown' : google ? 'granted' : 'denied',
    notifications: status(push),
    bluetooth: ios
      ? fromBluetoothAuthorization(bt)
      : bt === 'granted'
        ? 'granted'
        : bt == null
          ? 'unknown'
          : btBlocked === '1'
            ? 'blocked'
            : 'denied',
    motion: status(motion),
    camera: status(camera),
    music: music == null ? 'unknown' : music === 'granted' ? 'granted' : music === 'ask' ? 'undetermined' : platformStatus('denied', PERMISSION_PLATFORM),
    // iPhone never lets apps read Local Network; the row only opens Settings.
    localNetwork: 'unknown',
    tracking: status(tracking),
  };
  return { statuses, locationServicesOff: services === false };
}

/** The system's own question for one permission. Answers are read back by readPermissions. */
async function ask(id: PermissionId, userId: string | null, now: PermissionStatus): Promise<void> {
  switch (id) {
    case 'location':
      // The app's usual order: While Using, then Precise and (Android) Google Location Accuracy,
      // then Always on iPhone.
      await requestLocationPermission();
      return;
    case 'locationAlways':
      if (now === 'needsFirst') await requestLocationPermission();
      else await Location.requestBackgroundPermissionsAsync();
      return;
    case 'preciseLocation':
      if (now === 'needsFirst') await requestLocationPermission();
      else await Location.requestForegroundPermissionsAsync();
      return;
    case 'googleAccuracy':
      if (now === 'needsFirst') await requestLocationPermission();
      else await Location.enableNetworkProviderAsync();
      return;
    case 'notifications':
      if (userId) await askPushPermission(userId);
      else await Notifications.requestPermissionsAsync();
      return;
    case 'bluetooth': {
      const started = Date.now();
      const res = await askBluetoothPermission();
      if (Array.isArray(res)) {
        const s = fromAndroidResults(res);
        if (s === 'blocked') await AsyncStorage.setItem(KEY_BT_BLOCKED, '1');
        else if (s === 'granted') await AsyncStorage.removeItem(KEY_BT_BLOCKED);
        // Android answered at once without showing anything (turned down for good before this
        // page could know): only Settings can change it now.
        if (s === 'blocked' && Date.now() - started < ANSWERED_AT_ONCE_MS) await Linking.openSettings();
      }
      return;
    }
    case 'motion':
      await DeviceMotion.requestPermissionsAsync();
      return;
    case 'camera':
      await ImagePicker.requestCameraPermissionsAsync();
      return;
    case 'music':
      // iPhone: Apple Music's question (opens Settings itself if it was turned down).
      await askMusicAccess();
      return;
    case 'tracking':
      await askForTrackingNow();
      return;
    case 'localNetwork':
      await Linking.openSettings();
      return;
  }
}

/** Opens where this permission is switched back on. */
async function openSettingsFor(id: PermissionId): Promise<void> {
  if (id === 'music') {
    await openMusicAccessSettings();
    return;
  }
  await Linking.openSettings();
}

/**
 * A tap on a row: asks when the system still can, otherwise opens OnMyLead's page in Settings.
 * Returns what it did, so the page can say "Opened Settings".
 */
export async function fixPermission(id: PermissionId, now: PermissionStatus, userId: string | null): Promise<'asked' | 'settings' | 'none'> {
  const action = permissionAction(id, now, PERMISSION_PLATFORM);
  try {
    if (action === 'ask') {
      await ask(id, userId, now);
      return 'asked';
    }
    if (action === 'settings') {
      await openSettingsFor(id);
      return 'settings';
    }
  } catch {
    // A failed ask leaves the status as it was; the page re-reads it.
  }
  return 'none';
}
