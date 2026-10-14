import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Linking, Platform } from 'react-native';

import { MAPS_APP_LABEL, mapsAppsFor, mapsUrl, pickedApp, type DirectionsTarget, type MapsApp, type MapsPreference } from '@/core/directions';

/**
 * The one way OnMyLead hands a rider over to Apple Maps or Google Maps (see core/directions.ts).
 * Every Navigate button calls openDirections, so the choice of app and the links are the same
 * everywhere: the meeting point, waypoints, riders, the regroup point, the destination, the route.
 */

/** The maps apps this device can hand directions to, for labels: Android phones have no Apple Maps. */
export const MAPS_APPS_TEXT = mapsAppsFor(Platform.OS).map((a) => MAPS_APP_LABEL[a]).join(' or ');

const KEY = 'directions.app.v1';
let pref: MapsPreference = 'ask';
let loaded: Promise<void> | null = null;
const listeners = new Set<(p: MapsPreference) => void>();

function load() {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((v) => {
      if (v === 'apple' || v === 'google' || v === 'ask') pref = v;
      listeners.forEach((l) => l(pref));
    })
    .catch(() => {});
  return loaded;
}

export function setMapsPreference(next: MapsPreference) {
  pref = next;
  listeners.forEach((l) => l(pref));
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

/** The app Profile shows as picked, kept in step with every screen. */
export function useMapsPreference(): MapsPreference {
  const [p, setP] = useState(pref);
  useEffect(() => {
    listeners.add(setP);
    load();
    return () => void listeners.delete(setP);
  }, []);
  return p;
}

export function openIn(app: MapsApp, t: DirectionsTarget) {
  const url = mapsUrl(app, t);
  if (Platform.OS === 'web') globalThis.open?.(url, '_blank', 'noopener');
  else Linking.openURL(url).catch(() => {});
}

// The web has no native action sheet, so a small chooser mounted at the root asks there.
let webAsk: ((t: DirectionsTarget | null) => void) | null = null;
export function useWebDirectionsPrompt(): [DirectionsTarget | null, () => void] {
  const [t, setT] = useState<DirectionsTarget | null>(null);
  useEffect(() => {
    webAsk = setT;
    return () => {
      webAsk = null;
    };
  }, []);
  return [t, () => setT(null)];
}

/** Turn-by-turn directions: straight into the rider's maps app, or ask which one first. */
export async function openDirections(t: DirectionsTarget) {
  await load();
  const app = pickedApp(pref, Platform.OS);
  if (app) return openIn(app, t);
  if (Platform.OS === 'ios') {
    const apps = mapsAppsFor('ios');
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Directions to ${t.title}`,
        message: t.via?.length ? 'Maps keeps to roads between the route’s stops, so off-road parts may differ.' : undefined,
        options: [...apps.map((a) => MAPS_APP_LABEL[a]), 'Cancel'],
        cancelButtonIndex: apps.length,
        userInterfaceStyle: 'dark',
      },
      (i) => {
        if (i < apps.length) openIn(apps[i], t);
      },
    );
    return;
  }
  if (webAsk) webAsk(t);
  else openIn('google', t);
}
