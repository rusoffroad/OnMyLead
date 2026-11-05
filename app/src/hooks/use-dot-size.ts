import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { DOT_D, parseDotSize, type DotSize } from '@/core/dot-size';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Dot Size (Map Settings > Your Dot): how big your own dot is on every live map, remembered with the account. */
export const DOT_SIZE_KEY = 'map.dotSize.v1';

// One value for the whole app, so Map Settings, the You tab and every live map agree.
let value: DotSize | null = null;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
const emit = () => listeners.forEach((l) => l());

onSyncedChange(DOT_SIZE_KEY, (v) => {
  value = parseDotSize(v);
  emit();
});

function subscribe(l: () => void) {
  listeners.add(l);
  loading ??= AsyncStorage.getItem(DOT_SIZE_KEY)
    .then((v) => {
      if (value == null) value = parseDotSize(v);
    })
    .catch(() => {
      if (value == null) value = 'medium';
    })
    .finally(emit);
  return () => {
    listeners.delete(l);
  };
}
const read = (): DotSize => value ?? 'medium';

function setDotSize(next: DotSize) {
  value = next;
  emit();
  setSyncedItem(DOT_SIZE_KEY, next).catch(() => {});
}

/** The Dot Size choice: Medium unless the rider picked another. */
export function useDotSizePref(): [DotSize, (size: DotSize) => void] {
  return [useSyncExternalStore(subscribe, read, read), setDotSize];
}

/** Your own dot's disc size in points, following Dot Size. */
export function useOwnDotD(): number {
  return DOT_D[useSyncExternalStore(subscribe, read, read)];
}
