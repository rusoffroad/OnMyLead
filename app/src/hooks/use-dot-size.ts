import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { DOT_D, parseDotSize, type DotSize } from '@/core/dot-size';
import { DEFAULT_DOT_STYLE, parseDotStyle, type DotStyle } from '@/core/own-dot-art';
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

/** Dot Style (Map Settings > Your Dot): how your own dot looks, remembered with the account; Hi-Viz Dome unless picked. */
export const DOT_STYLE_KEY = 'map.dotStyle.v1';

let style: DotStyle | null = null;
const styleListeners = new Set<() => void>();
let styleLoading: Promise<void> | null = null;
const emitStyle = () => styleListeners.forEach((l) => l());

onSyncedChange(DOT_STYLE_KEY, (v) => {
  style = parseDotStyle(v);
  emitStyle();
});

function subscribeStyle(l: () => void) {
  styleListeners.add(l);
  styleLoading ??= AsyncStorage.getItem(DOT_STYLE_KEY)
    .then((v) => {
      if (style == null) style = parseDotStyle(v);
    })
    .catch(() => {
      if (style == null) style = DEFAULT_DOT_STYLE;
    })
    .finally(emitStyle);
  return () => {
    styleListeners.delete(l);
  };
}
const readStyle = (): DotStyle => style ?? DEFAULT_DOT_STYLE;

function setDotStyle(next: DotStyle) {
  style = next;
  emitStyle();
  setSyncedItem(DOT_STYLE_KEY, next).catch(() => {});
}

/** The Dot Style choice. */
export function useDotStylePref(): [DotStyle, (style: DotStyle) => void] {
  return [useSyncExternalStore(subscribeStyle, readStyle, readStyle), setDotStyle];
}
