import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Zoom In at Intersections (core/intersections), remembered with the account; on by default. */
export const INTERSECTION_ZOOM_KEY = 'map.intersectionZoom.v1';

// One value for the whole app, so the You tab switch and every live map agree.
let value: boolean | null = null;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
const emit = () => listeners.forEach((l) => l());

onSyncedChange(INTERSECTION_ZOOM_KEY, (v) => {
  value = v !== '0';
  emit();
});

function subscribe(l: () => void) {
  listeners.add(l);
  loading ??= AsyncStorage.getItem(INTERSECTION_ZOOM_KEY)
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
const read = () => value ?? true;

function setIntersectionZoom(next: boolean) {
  value = next;
  emit();
  setSyncedItem(INTERSECTION_ZOOM_KEY, next ? '1' : '0').catch(() => {});
}

/** The Zoom In at Intersections switch: on unless the rider turned it off. */
export function useIntersectionZoomPref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, read), setIntersectionZoom];
}
