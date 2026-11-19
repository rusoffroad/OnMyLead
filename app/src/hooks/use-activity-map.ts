import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { ActivityId } from '@/core/activities';
import {
  ACTIVITY_LAYER_BY_ID, ACTIVITY_LAYERS_KEY, activityLayerDefs, activityLayersShown, activityRasters, avalancheGeoJSON, readActivityLayerChoices,
  stationsGeoJSON, type ActivityLayerChoices, type ActivityLayerDef, type ActivityLayerId, type ActivityRaster, type Box,
} from '@/core/activity-layers';
import { useActivity } from '@/lib/activity';
import { avalancheZones, snotelStations, snowReportAt } from '@/lib/activity-map';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/** Everything a map draws for the rider's activity (core/activity-layers.ts). Nothing for Offroad. */
export type ActivityMap = {
  activity: ActivityId;
  /** The activity's switches for Map Features (none for Offroad). */
  defs: ActivityLayerDef[];
  /** On or off for each, as the rider set them (on unless switched off). */
  isOn: (id: ActivityLayerId) => boolean;
  setLayer: (id: ActivityLayerId, on: boolean) => void;
  /** The rider can use them (they are Pro, like the other Map Features). */
  unlocked: boolean;
  /** What is drawn now. */
  shown: ActivityLayerId[];
  rasters: ActivityRaster[];
  avalanche: GeoJSON.FeatureCollection | null;
  stations: GeoJSON.FeatureCollection | null;
  /** Snow is falling where the map is (Falling Snow, the apps only). */
  snowing: boolean;
  twisty: boolean;
  camps: boolean;
  /** Credits for the map's attribution line. */
  attribution: string[];
};

const NONE: ActivityLayerId[] = [];

/** Used by useTrailMap, so every map in the app (not the car's) draws the activity's look. */
export function useActivityMap({ pro, offline, viewBox, zoom, where }: {
  pro: boolean; offline: boolean; viewBox: Box | null; zoom: number; where: { lat: number; lng: number } | null;
}): ActivityMap {
  const { activity } = useActivity();
  const web = Platform.OS === 'web';
  const [choices, setChoices] = useState<ActivityLayerChoices>({});
  const choicesRef = useRef(choices);

  useEffect(() => {
    const apply = (v: string | null) => {
      const next = readActivityLayerChoices(v);
      choicesRef.current = next;
      setChoices(next);
    };
    AsyncStorage.getItem(ACTIVITY_LAYERS_KEY).then(apply).catch(() => {});
    return onSyncedChange(ACTIVITY_LAYERS_KEY, apply);
  }, []);

  const setLayer = useCallback((id: ActivityLayerId, on: boolean) => {
    const next = { ...choicesRef.current, [id]: on };
    choicesRef.current = next;
    setChoices(next);
    setSyncedItem(ACTIVITY_LAYERS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const shown = useMemo(() => (pro ? activityLayersShown(activity, choices, { web, offline }) : NONE), [pro, activity, choices, web, offline]);
  // The snow analysis is stamped every six hours: work it out again when the hour changes.
  const [hour, setHour] = useState(() => Math.floor(Date.now() / 3600_000));
  useEffect(() => {
    const id = setInterval(() => setHour(Math.floor(Date.now() / 3600_000)), 10 * 60_000);
    return () => clearInterval(id);
  }, []);
  const rasters = useMemo(() => activityRasters(shown, new Date(hour * 3600_000)), [shown, hour]);

  const avalancheOn = shown.includes('avalanche');
  const [avalanche, setAvalanche] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    if (!avalancheOn) return;
    let live = true;
    avalancheZones().then((z) => live && setAvalanche(avalancheGeoJSON(z))).catch(() => {});
    return () => {
      live = false;
    };
  }, [avalancheOn]);

  const stationsOn = shown.includes('snowStations') && !!viewBox && zoom >= 6;
  const [stations, setStations] = useState<GeoJSON.FeatureCollection | null>(null);
  const boxKey = viewBox ? `${viewBox.minLat.toFixed(0)},${viewBox.maxLat.toFixed(0)},${viewBox.minLng.toFixed(0)},${viewBox.maxLng.toFixed(0)}` : '';
  useEffect(() => {
    if (!stationsOn || !viewBox) return;
    let live = true;
    snotelStations(viewBox).then((s) => live && setStations(stationsGeoJSON(s))).catch(() => {});
    return () => {
      live = false;
    };
    // The box to whole degrees: a pan within a state doesn't ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationsOn, boxKey]);

  const fallingOn = shown.includes('fallingSnow') && !!where;
  const [snowing, setSnowing] = useState(false);
  const whereKey = where ? `${where.lat.toFixed(1)},${where.lng.toFixed(1)}` : '';
  useEffect(() => {
    if (!fallingOn || !where) return;
    let live = true;
    snowReportAt(where.lat, where.lng).then((r) => live && setSnowing(!!r?.snowing)).catch(() => {});
    return () => {
      live = false;
    };
    // About 10 km steps: weather doesn't change across a pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallingOn, whereKey]);

  const isOn = useCallback((id: ActivityLayerId) => choices[id] !== false, [choices]);
  return {
    activity,
    defs: activityLayerDefs(activity, web),
    isOn,
    setLayer,
    unlocked: pro,
    shown,
    rasters,
    avalanche: avalancheOn ? avalanche : null,
    stations: stationsOn ? stations : null,
    snowing: fallingOn && snowing,
    twisty: shown.includes('twistyRoads'),
    camps: shown.includes('campgrounds'),
    attribution: [...new Set(shown.filter((id) => id !== 'fallingSnow' || snowing).map((id) => ACTIVITY_LAYER_BY_ID[id].attribution))],
  };
}
