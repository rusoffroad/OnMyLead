import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';
import type { MapPressEvent, Region } from 'react-native-maps';

import { drawableOsm, nearestOsmTrail, OSM_MIN_Z, type OsmTrail } from '@/core/osm-trails';
import { metersPerPoint, TRAIL_SOURCE_IDS, TRAILS_MIN_Z, type BaseMap, type TrailInfo } from '@/core/trails';
import { useMapSignal } from '@/lib/map-signal';
import { identifyTrail, loadOsmView } from '@/lib/trail-tiles';

const KEY = 'map.layers.v1';

export type TrailMap = {
  base: BaseMap;
  trails: boolean;
  /** True when trails are on but the map is too far out to draw them. */
  zoomInHint: boolean;
  /** OpenStreetMap tracks to draw (TrailTiles), once the map is in to zoom 13. */
  osmLines: OsmTrail[];
  /** True when trails are on and agency lines show, but OpenStreetMap tracks need a closer zoom. */
  closerForTracks: boolean;
  /** No signal: the map draws only squares saved on the phone (see lib/offline-maps). */
  offline: boolean;
  setBase: (b: BaseMap) => void;
  setTrails: (on: boolean) => void;
  /** Feed a map's region changes in (mapProps does this; maps with their own handler call it). */
  onRegion: (r: Region) => void;
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
  // On unless the rider turned it off: trails are the reason most riders open the map.
  const [trails, setTrailsState] = useState(true);
  const [osm, setOsm] = useState<OsmTrail[]>([]);
  const [zoom, setZoom] = useState(12);
  const [info, setInfo] = useState<TrailInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const region = useRef<Region | null>(null);
  const width = useRef(390);
  const lookup = useRef(0);
  const osmLoad = useRef(0);
  const { offline } = useMapSignal();
  // Read by the loaders below, which outlive a render.
  const trailsRef = useRef(trails);
  const offlineRef = useRef(offline);
  const osmRef = useRef<OsmTrail[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!v) return;
        // `trails` from the first version defaulted to off, so only the newer `trailsOn` choice counts.
        const saved = JSON.parse(v) as { base?: BaseMap; trailsOn?: boolean };
        if (saved.base === 'topo' || saved.base === 'satellite') setBaseState(saved.base);
        if (typeof saved.trailsOn === 'boolean') setTrailsState(saved.trailsOn);
      })
      .catch(() => {});
  }, []);

  const save = (next: { base: BaseMap; trailsOn: boolean }) => AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  const setBase = (b: BaseMap) => {
    setBaseState(b);
    save({ base: b, trailsOn: trails });
  };

  const refreshOsm = useCallback(() => {
    const r = region.current;
    const id = ++osmLoad.current;
    const put = (lines: OsmTrail[]) => {
      osmRef.current = lines;
      setOsm(lines);
    };
    if (!trailsRef.current || !r) {
      put([]);
      return;
    }
    loadOsmView(r, zoomOf(r), offlineRef.current)
      .then((lines) => {
        if (id === osmLoad.current) put(lines);
      })
      .catch(() => {});
  }, []);

  const setTrails = (on: boolean) => {
    setTrailsState(on);
    trailsRef.current = on;
    if (!on) setInfo(null);
    refreshOsm();
    save({ base, trailsOn: on });
  };

  // Load once the saved choice is read, and again when the signal comes back or drops.
  useEffect(() => {
    trailsRef.current = trails;
    offlineRef.current = offline;
    refreshOsm();
  }, [trails, offline, refreshOsm]);

  const onRegion = useCallback(
    (r: Region) => {
      region.current = r;
      setZoom(zoomOf(r));
      refreshOsm();
    },
    [refreshOsm],
  );

  const identifyAt = useCallback(
    (lat: number, lng: number) => {
      if (!trails || !region.current || zoomOf(region.current) < TRAILS_MIN_Z) {
        setInfo(null);
        return;
      }
      // About a fingertip (22 points) around the tap, whatever the zoom.
      const radius = Math.min(400, Math.max(15, metersPerPoint(region.current, width.current) * 22));
      const id = ++lookup.current;
      // OpenStreetMap tracks are already on the phone; the agencies' answer wins because it says who may ride.
      const local = nearestOsmTrail({ lat, lng }, osmRef.current, radius);
      setLooking(true);
      identifyTrail({ lat, lng }, TRAIL_SOURCE_IDS, radius)
        .then((found) => {
          if (id === lookup.current) setInfo(found ?? local);
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

  const drawn = useMemo(() => drawableOsm(osm), [osm]);

  return {
    base,
    trails,
    zoomInHint: trails && zoom < TRAILS_MIN_Z,
    osmLines: trails ? drawn : [],
    closerForTracks: trails && zoom >= TRAILS_MIN_Z && zoom < OSM_MIN_Z - 0.25,
    offline,
    setBase,
    setTrails,
    onRegion,
    info,
    looking,
    clearInfo: () => setInfo(null),
    identifyAt,
    mapProps: {
      // Topo replaces Apple's map content; Android has to be told there is no base map under it.
      mapType: base === 'satellite' ? 'hybrid' : Platform.OS === 'android' ? 'none' : 'standard',
      onPress,
      onRegionChangeComplete: onRegion,
      onLayout: (e: LayoutChangeEvent) => {
        width.current = e.nativeEvent.layout.width;
      },
    },
  };
}
