import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Zoom Out at the Edge (core/follow-camera: the one zoom out when your dot nears an edge), remembered with the account; on by default. */
export const EDGE_ZOOM_KEY = 'map.edgeZoomOut.v1';

// One value for the whole app, so the You tab switch and every live map agree.
let value: boolean | null = null;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
const emit = () => listeners.forEach((l) => l());

onSyncedChange(EDGE_ZOOM_KEY, (v) => {
  value = v !== '0';
  emit();
});

function subscribe(l: () => void) {
  listeners.add(l);
  loading ??= AsyncStorage.getItem(EDGE_ZOOM_KEY)
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

function setEdgeZoom(next: boolean) {
  value = next;
  emit();
  setSyncedItem(EDGE_ZOOM_KEY, next ? '1' : '0').catch(() => {});
}

/** The Zoom Out at the Edge switch: on unless the rider turned it off. */
export function useEdgeZoomPref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, read), setEdgeZoom];
}

/** The switch's value right now, for map code outside React (the fallback maps' follow step). */
export function edgeZoomOn(): boolean {
  return read();
}
