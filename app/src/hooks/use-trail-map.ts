import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';
import type { MapPressEvent, Region } from 'react-native-maps';

import { metersPerPoint, TRAIL_SOURCE_IDS, TRAILS_MIN_Z, type BaseMap, type TrailInfo } from '@/core/trails';
import { useMapSignal } from '@/lib/map-signal';
import { identifyTrail } from '@/lib/trail-tiles';

const KEY = 'map.layers.v1';

export type TrailMap = {
  base: BaseMap;
  trails: boolean;
  /** True when trails are on but the map is too far out to draw them. */
  zoomInHint: boolean;
  /** No signal: the map draws only squares saved on the phone (see lib/offline-maps). */
  offline: boolean;
  setBase: (b: BaseMap) => void;
  setTrails: (on: boolean) => void;
  info: TrailInfo | null;
  looking: boolean;
  clearInfo: () => void;
  /** Look up the trail under a point (for maps where a plain tap already does something else). */
  identifyAt: (lat: number, lng: number) => void;
  /** Spread onto the MapView. */
  mapProps: {
    mapType: 'hybrid' | 'standard' | 'none';
    onPress: (e: MapPressEvent) => void;
    onRegionChangeComplete: (r: Region) => void;
    onLayout: (e: LayoutChangeEvent) => void;
  };
};

const zoomOf = (r: Region) => Math.log2(360 / Math.max(1e-6, r.longitudeDelta));

/**
 * Map layer choices (satellite or topo, public trails on or off), remembered on the phone and
 * shared by every map in the app, plus tap-a-trail lookups. Screens that already handle map
 * taps call mapProps.onPress from their own handler.
 */
export function useTrailMap(): TrailMap {
  const [base, setBaseState] = useState<BaseMap>('satellite');
  const [trails, setTrailsState] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [info, setInfo] = useState<TrailInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const region = useRef<Region | null>(null);
  const width = useRef(390);
  const lookup = useRef(0);
  const { offline } = useMapSignal();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!v) return;
        const saved = JSON.parse(v) as { base?: BaseMap; trails?: boolean };
        if (saved.base === 'topo' || saved.base === 'satellite') setBaseState(saved.base);
        if (typeof saved.trails === 'boolean') setTrailsState(saved.trails);
      })
      .catch(() => {});
  }, []);

  const save = (next: { base: BaseMap; trails: boolean }) => AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  const setBase = (b: BaseMap) => {
    setBaseState(b);
    save({ base: b, trails });
  };
  const setTrails = (on: boolean) => {
    setTrailsState(on);
    if (!on) setInfo(null);
    save({ base, trails: on });
  };

  const identifyAt = useCallback(
    (lat: number, lng: number) => {
      if (!trails || !region.current || zoomOf(region.current) < TRAILS_MIN_Z) {
        setInfo(null);
        return;
      }
      // About a fingertip (22 points) around the tap, whatever the zoom.
      const radius = Math.min(400, Math.max(15, metersPerPoint(region.current, width.current) * 22));
      const id = ++lookup.current;
      setLooking(true);
      identifyTrail({ lat, lng }, TRAIL_SOURCE_IDS, radius)
        .then((found) => {
          if (id === lookup.current) setInfo(found);
        })
        .finally(() => {
          if (id === lookup.current) setLooking(false);
        });
    },
    [trails],
  );

  const onPress = useCallback(
    (e: MapPressEvent) => {
      // Taps on a rider's pin or a marker are theirs, not a trail lookup.
      if (e.nativeEvent.action === 'marker-press') return;
      identifyAt(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
    },
    [identifyAt],
  );

  return {
    base,
    trails,
    zoomInHint: trails && zoom < TRAILS_MIN_Z,
    offline,
    setBase,
    setTrails,
    info,
    looking,
    clearInfo: () => setInfo(null),
    identifyAt,
    mapProps: {
      // Topo replaces Apple's map content; Android has to be told there is no base map under it.
      mapType: base === 'satellite' ? 'hybrid' : Platform.OS === 'android' ? 'none' : 'standard',
      onPress,
      onRegionChangeComplete: (r: Region) => {
        region.current = r;
        setZoom(zoomOf(r));
      },
      onLayout: (e: LayoutChangeEvent) => {
        width.current = e.nativeEvent.layout.width;
      },
    },
  };
}
