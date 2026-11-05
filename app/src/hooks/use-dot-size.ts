import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { DOT_D, parseDotSize, type DotSize } from '@/core/dot-size';
import { effectiveDot } from '@/core/pro';
import { DEFAULT_DOT_STYLE, parseDotStyle, type DotStyle } from '@/core/own-dot-art';
import { useEntitlements } from '@/lib/entitlements';
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

// Read the saved choices at launch, so the first map draws the rider's own dot, not the default.
const load = () =>
  (loading ??= AsyncStorage.getItem(DOT_SIZE_KEY)
    .then((v) => {
      if (value == null) value = parseDotSize(v);
    })
    .catch(() => {
      if (value == null) value = 'medium';
    })
    .finally(emit));
load();

function subscribe(l: () => void) {
  listeners.add(l);
  load();
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

/** The Dot Size choice: Medium unless the rider picked another (and has Pro: customizing the dot is Pro). */
export function useDotSizePref(): [DotSize, (size: DotSize) => void] {
  const { ent } = useEntitlements();
  const saved = useSyncExternalStore(subscribe, read, read);
  return [effectiveDot(ent, DEFAULT_DOT_STYLE, saved).size, setDotSize];
}

/** Your own dot's disc size in points, following Dot Size. */
export function useOwnDotD(): number {
  return DOT_D[useDotSizePref()[0]];
}

/** Dot Style (Map Settings > Your Dot): how your own dot looks, remembered with the account; Safety Orange unless picked. */
export const DOT_STYLE_KEY = 'map.dotStyle.v1';

let style: DotStyle | null = null;
const styleListeners = new Set<() => void>();
let styleLoading: Promise<void> | null = null;
const emitStyle = () => styleListeners.forEach((l) => l());

onSyncedChange(DOT_STYLE_KEY, (v) => {
  style = parseDotStyle(v);
  emitStyle();
});

const loadStyle = () =>
  (styleLoading ??= AsyncStorage.getItem(DOT_STYLE_KEY)
    .then((v) => {
      if (style == null) style = parseDotStyle(v);
    })
    .catch(() => {
      if (style == null) style = DEFAULT_DOT_STYLE;
    })
    .finally(emitStyle));
loadStyle();

function subscribeStyle(l: () => void) {
  styleListeners.add(l);
  loadStyle();
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

/** The Dot Style choice; the default on Free (customizing the dot is Pro), the saved pick kept for later. */
export function useDotStylePref(): [DotStyle, (style: DotStyle) => void] {
  const { ent } = useEntitlements();
  const saved = useSyncExternalStore(subscribeStyle, readStyle, readStyle);
  return [effectiveDot(ent, saved, 'medium').style, setDotStyle];
}
