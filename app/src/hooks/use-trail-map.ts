import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';
import type { MapPressEvent, Region } from 'react-native-maps';

import { boxInside, nearestRiderTrail, paddedBox, RIDER_TRAILS_MIN_Z, type PublicTrail } from '@/core/nav-trails';
import { drawableOsm, nearestOsmTrail, OSM_VIEW_MIN_Z, trailLabels, type OsmTrail, type TrailLabel } from '@/core/osm-trails';
import { mapZoom, metersPerPoint, TRAIL_SOURCE_IDS, TRAILS_MIN_Z, type BaseMap, type ClosedLine, type TrailInfo } from '@/core/trails';
import { useMapSignal } from '@/lib/map-signal';
import { publicTrailsIn, type Box } from '@/lib/nav-trails';
import { supabase } from '@/lib/supabase';
import { identifyTrail, loadOsmView, loadSeasonalClosures } from '@/lib/trail-tiles';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

const KEY = 'map.layers.v1';
/** Show trails other riders mapped and shared (Navigation Mode). On unless the rider hid them. */
export const RIDER_TRAILS_KEY = 'map.riderTrails.v1';

export type TrailMap = {
  base: BaseMap;
  trails: boolean;
  /** True when trails are on but the map is too far out to draw them. */
  zoomInHint: boolean;
  /** OpenStreetMap tracks to draw (TrailTiles), once the map is in to OSM_VIEW_MIN_Z (about 15 miles across). */
  osmLines: OsmTrail[];
  /** Name tags for the named OpenStreetMap tracks on screen (agency names are drawn into their tiles). */
  labels: TrailLabel[];
  /** Forest Service routes closed for the season today, drawn over the trail layer in the closed style. */
  closedLines: ClosedLine[];
  /** True when trails are on and agency lines show, but OpenStreetMap tracks need a closer zoom. */
  closerForTracks: boolean;
  /** No signal: the map draws only squares saved on the phone (see lib/offline-maps). */
  offline: boolean;
  setBase: (b: BaseMap) => void;
  setTrails: (on: boolean) => void;
  /** Trails riders mapped and shared, drawn mint and dotted (see core/nav-trails). */
  riderTrailsOn: boolean;
  setRiderTrails: (on: boolean) => void;
  riderTrails: PublicTrail[];
  /** The rider trail the rider tapped: its card says it's user submitted and offers ratings. */
  picked: PublicTrail | null;
  pick: (t: PublicTrail | null) => void;
  /** Load the rider trails on screen again (after sharing or rating one). */
  reloadRiderTrails: () => void;
  /**
   * Feed a map's region changes in (mapProps does this; maps with their own handler call it).
   * A web map passes its real zoom, since a wide browser window shows far more than a phone.
   */
  onRegion: (r: Region, zoom?: number) => void;
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

/** True when both lists hold the same lines in the same order (the squares came from memory). */
const sameLines = <T>(a: T[], b: T[]) => a.length === b.length && a.every((t, i) => t === b[i]);
const byKey = <T extends { key: string }>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

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
  const [closed, setClosed] = useState<ClosedLine[]>([]);
  const [zoom, setZoom] = useState(12);
  const [info, setInfo] = useState<TrailInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const region = useRef<Region | null>(null);
  const zoomNow = useRef<number | null>(null);
  const width = useRef(390);
  const lookup = useRef(0);
  const osmLoad = useRef(0);
  const closedLoad = useRef(0);
  const { offline } = useMapSignal();
  // Read by the loaders below, which outlive a render.
  const trailsRef = useRef(trails);
  const offlineRef = useRef(offline);
  const osmRef = useRef<OsmTrail[]>([]);
  const [riderOn, setRiderOn] = useState(true);
  const riderOnRef = useRef(true);
  const [riderTrails, setRiderTrailsList] = useState<PublicTrail[]>([]);
  const riderRef = useRef<PublicTrail[]>([]);
  const riderBox = useRef<Box | null>(null);
  const riderLoad = useRef(0);
  const [picked, setPicked] = useState<PublicTrail | null>(null);

  useEffect(() => {
    const applyLayers = (v: string | null) => {
      if (!v) return;
      try {
        // `trails` from the first version defaulted to off, so only the newer `trailsOn` choice counts.
        const saved = JSON.parse(v) as { base?: BaseMap; trailsOn?: boolean };
        if (saved.base === 'topo' || saved.base === 'satellite') setBaseState(saved.base);
        if (typeof saved.trailsOn === 'boolean') setTrailsState(saved.trailsOn);
      } catch {
        // Not a saved choice.
      }
    };
    const applyRiders = (v: string | null) => {
      riderOnRef.current = v !== '0';
      setRiderOn(v !== '0');
    };
    AsyncStorage.getItem(KEY).then(applyLayers).catch(() => {});
    AsyncStorage.getItem(RIDER_TRAILS_KEY)
      .then((v) => v === '0' && applyRiders(v))
      .catch(() => {});
    // Picked on another device (lib/settings-sync).
    const offLayers = onSyncedChange(KEY, applyLayers);
    const offRiders = onSyncedChange(RIDER_TRAILS_KEY, applyRiders);
    return () => {
      offLayers();
      offRiders();
    };
  }, []);

  /** Rider trails for the region on screen; skips the call while the map stays inside the last box. */
  const refreshRiders = useCallback((force = false) => {
    const r = region.current;
    if (!r || !riderOnRef.current || offlineRef.current) return;
    const z = zoomNow.current ?? mapZoom(r, width.current);
    if (z < RIDER_TRAILS_MIN_Z) return;
    const view = { minLat: r.latitude - r.latitudeDelta / 2, maxLat: r.latitude + r.latitudeDelta / 2, minLng: r.longitude - r.longitudeDelta / 2, maxLng: r.longitude + r.longitudeDelta / 2 };
    if (!force && riderBox.current && boxInside(view, riderBox.current)) return;
    const box = paddedBox(r);
    const id = ++riderLoad.current;
    supabase.auth
      .getSession()
      .then(({ data }) => (data.session ? publicTrailsIn(box) : []))
      .then((list) => {
        if (id !== riderLoad.current) return;
        riderBox.current = box;
        riderRef.current = list;
        setRiderTrailsList(list);
      })
      .catch(() => {});
  }, []);

  const setRiderTrails = (on: boolean) => {
    riderOnRef.current = on;
    setRiderOn(on);
    if (!on) setPicked(null);
    else refreshRiders(true);
    setSyncedItem(RIDER_TRAILS_KEY, on ? '1' : '0').catch(() => {});
  };

  const save = (next: { base: BaseMap; trailsOn: boolean }) => setSyncedItem(KEY, JSON.stringify(next)).catch(() => {});
  const setBase = (b: BaseMap) => {
    setBaseState(b);
    save({ base: b, trailsOn: trails });
  };

  const refreshOsm = useCallback(() => {
    const r = region.current;
    const id = ++osmLoad.current;
    const put = (lines: OsmTrail[]) => {
      // Panning within the same squares changes nothing on the map; skipping it keeps lines still.
      if (sameLines(osmRef.current, lines)) return;
      osmRef.current = lines;
      setOsm(lines);
    };
    const closedId = ++closedLoad.current;
    if (!trailsRef.current || !r) {
      put([]);
      setClosed([]);
      return;
    }
    const z = zoomNow.current ?? mapZoom(r, width.current);
    loadOsmView(r, z, offlineRef.current)
      .then((lines) => {
        if (id === osmLoad.current) put(lines);
      })
      .catch(() => {});
    loadSeasonalClosures(r, z, offlineRef.current)
      .then((lines) => {
        // In a steady order, and unchanged when nothing changed, so closed lines don't flash either.
        if (closedId === closedLoad.current) setClosed((prev) => (sameLines(prev, lines.sort(byKey)) ? prev : lines));
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
    (r: Region, z?: number) => {
      region.current = r;
      zoomNow.current = z ?? null;
      setZoom(z ?? mapZoom(r, width.current));
      refreshOsm();
      refreshRiders();
    },
    [refreshOsm, refreshRiders],
  );

  const identifyAt = useCallback(
    (lat: number, lng: number) => {
      // A rider trail under the tap comes first: its card is the one with ratings.
      if (riderOnRef.current && region.current && riderRef.current.length) {
        const radius = Math.min(400, Math.max(15, metersPerPoint(region.current, width.current) * 22));
        const hit = nearestRiderTrail({ lat, lng }, riderRef.current, radius);
        if (hit) {
          ++lookup.current;
          setLooking(false);
          setInfo(null);
          setPicked(hit);
          return;
        }
      }
      setPicked(null);
      if (!trails || !region.current || (zoomNow.current ?? mapZoom(region.current, width.current)) < TRAILS_MIN_Z) {
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

  // Leaflet draws lines cheaply and a browser window shows more of the map, so the website draws more.
  const drawn = useMemo(() => drawableOsm(osm, Platform.OS === 'web' ? 1500 : undefined), [osm]);
  // Each phone tag is a small native view, so the phone keeps fewer than the website.
  // A tag is about 120 by 24 points; degrees per point at this zoom keep tags from overlapping.
  const labels = useMemo(() => {
    const perPt = 360 / (256 * 2 ** Math.max(1, zoom));
    const lat = osm[0]?.parts[0]?.[0]?.lat ?? 0;
    return trailLabels(osm, Platform.OS === 'web' ? 60 : 24, { lng: perPt * 120, lat: perPt * 24 * Math.cos((lat * Math.PI) / 180) });
  }, [osm, zoom]);

  return {
    base,
    trails,
    zoomInHint: trails && zoom < TRAILS_MIN_Z,
    osmLines: trails ? drawn : [],
    labels: trails ? labels : [],
    closedLines: trails ? closed : [],
    closerForTracks: trails && zoom >= TRAILS_MIN_Z && zoom < OSM_VIEW_MIN_Z,
    offline,
    setBase,
    setTrails,
    riderTrailsOn: riderOn,
    setRiderTrails,
    riderTrails: riderOn ? riderTrails : [],
    picked: riderOn ? picked : null,
    pick: setPicked,
    reloadRiderTrails: () => refreshRiders(true),
    onRegion,
    info,
    looking,
    clearInfo: () => setInfo(null),
    identifyAt,
    mapProps: {
      // Topo replaces Apple's map content; Android has to be told there is no base map under it.
      mapType: base === 'satellite' ? 'hybrid' : Platform.OS === 'android' ? 'none' : 'standard',
      onPress,
      onRegionChangeComplete: (r: Region) => onRegion(r),
      onLayout: (e: LayoutChangeEvent) => {
        width.current = e.nativeEvent.layout.width;
      },
    },
  };
}
