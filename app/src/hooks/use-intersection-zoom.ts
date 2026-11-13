import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Zoom In at Intersections (core/intersections), remembered with the account. Off by
 * default since 3.1 (riders turn it on in the You tab); a rider who never touched it had it on in
 * 3.0 and now has it off, and a rider who turned it on keeps it on. */
export const INTERSECTION_ZOOM_KEY = 'map.intersectionZoom.v1';

// One value for the whole app, so the You tab switch and every live map agree.
let value: boolean | null = null;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
const emit = () => listeners.forEach((l) => l());

onSyncedChange(INTERSECTION_ZOOM_KEY, (v) => {
  value = v === '1';
  emit();
});

function subscribe(l: () => void) {
  listeners.add(l);
  loading ??= AsyncStorage.getItem(INTERSECTION_ZOOM_KEY)
    .then((v) => {
      if (value == null) value = v === '1';
    })
    .catch(() => {
      if (value == null) value = false;
    })
    .finally(emit);
  return () => {
    listeners.delete(l);
  };
}
const read = () => value ?? false;

function setIntersectionZoom(next: boolean) {
  value = next;
  emit();
  setSyncedItem(INTERSECTION_ZOOM_KEY, next ? '1' : '0').catch(() => {});
}

/** The Zoom In at Intersections switch: off unless the rider turned it on. */
export function useIntersectionZoomPref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, read), setIntersectionZoom];
}
