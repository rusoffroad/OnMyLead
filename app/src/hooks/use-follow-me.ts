import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReducer, useSyncExternalStore } from 'react';

import { FOLLOW_CAM_START, followCamReducer } from '@/core/follow-camera';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Follow Me, remembered with the account and shared by every live map (Ride Mode, Navigate). */
export const FOLLOW_ME_KEY = 'map.followMe.v1';

// One value for the whole app, so the You tab switch and a map's button never disagree.
let value: boolean | null = null;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
const emit = () => listeners.forEach((l) => l());

// Changed on another device (lib/settings-sync).
onSyncedChange(FOLLOW_ME_KEY, (v) => {
  value = v !== '0';
  emit();
});

function subscribe(l: () => void) {
  listeners.add(l);
  loading ??= AsyncStorage.getItem(FOLLOW_ME_KEY)
    .then((v) => {
      if (value == null) value = v !== '0';
    })
    .catch(() => {
      if (value == null) value = true;
    })
    .finally(emit);
  return () => {
    listeners.delete(l);
  };
}
// Off only when the rider turned it off; until the phone's choice loads, on.
const read = () => value ?? true;

function setFollowMe(next: boolean) {
  value = next;
  emit();
  setSyncedItem(FOLLOW_ME_KEY, next ? '1' : '0').catch(() => {});
}

/** The Follow Me switch: on by default, the same everywhere, remembered between visits. */
export function useFollowMePref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, read), setFollowMe];
}

/**
 * Follow Me on a live map: the remembered switch plus this visit's pause (see core/follow-camera).
 * Send 'pan' when the rider moves the map by hand, 'center' for Center on Me.
 */
export function useFollowMe() {
  const [on, setOn] = useFollowMePref();
  const [cam, camEvent] = useReducer(followCamReducer, FOLLOW_CAM_START);
  return { on, setOn, cam, camEvent };
}
