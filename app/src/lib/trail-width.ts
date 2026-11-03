/**
 * Trail width limits riders add to public trails, and the rider's Garage widths for the
 * "Your RZR Is Too Wide" line. Calls trail_width_near() and report_trail_width() in migration
 * 20261103200000_trail_widths.sql. Shared by the apps and the website.
 */
import { useCallback, useEffect, useState } from 'react';

import type { TrailInfo } from '@/core/trails';
import { fitName, NO_RIDER_WIDTHS, parseRiderWidths, type FitVehicle, type RiderWidths } from '@/core/trail-width';
import { myVehicles } from './api';
import { supabase } from './supabase';

type Line = Pick<TrailInfo, 'source' | 'lineKey' | 'title' | 'at'>;

/** The tapped line's name, for matching OpenStreetMap tracks (an "Unnamed Track" has none). */
const lineName = (l: Line) => (l.source === 'osm' && l.title === 'Unnamed Track' ? null : l.title);

function args(l: Line) {
  return { p_source: l.source, p_line_key: l.lineKey, p_name: lineName(l), p_lat: l.at!.lat, p_lng: l.at!.lng };
}

export async function riderWidths(l: Line): Promise<RiderWidths> {
  if (!l.at) return NO_RIDER_WIDTHS;
  const { data, error } = await supabase.rpc('trail_width_near', args(l));
  if (error) throw new Error(error.message);
  return parseRiderWidths(data);
}

/** Add, change or (null) clear this rider's width for the line. */
export async function reportWidth(l: Line, widthIn: number | null): Promise<RiderWidths> {
  if (!l.at) throw new Error('Tap the trail again, then add its width.');
  const { data, error } = await supabase.rpc('report_trail_width', { ...args(l), p_width_in: widthIn });
  if (error) throw new Error(error.message.includes('sign in') ? 'Sign in to add a width.' : error.message);
  return parseRiderWidths(data);
}

/**
 * Riders' widths for a tapped public trail. `ready` is false while asking; with no signal or signed
 * out it settles on no entries, and `canAdd` says whether this rider may add one.
 */
export function useRiderWidths(info: TrailInfo | null) {
  const [widths, setWidths] = useState<RiderWidths>(NO_RIDER_WIDTHS);
  const [ready, setReady] = useState(false);
  const [canAdd, setCanAdd] = useState(false);
  const key = info ? `${info.source}|${info.lineKey ?? ''}|${info.title}|${info.at?.lat ?? ''}|${info.at?.lng ?? ''}` : '';

  useEffect(() => {
    let live = true;
    if (!info?.at) return;
    riderWidths(info)
      .then((w) => {
        if (!live) return;
        setWidths(w);
        setCanAdd(true);
      })
      .catch(() => {
        if (!live) return;
        setWidths(NO_RIDER_WIDTHS);
        setCanAdd(false);
      })
      .finally(() => live && setReady(true));
    return () => {
      live = false;
      setReady(false);
    };
    // The key holds everything the lookup depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useCallback(
    async (widthIn: number | null) => {
      if (!info) return;
      setWidths(await reportWidth(info, widthIn));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return { widths, ready, canAdd, save };
}

/** Garage machines with a width, kept for the session (refreshed when the Garage saves one). */
let garage: Promise<FitVehicle[]> | null = null;

export function forgetGarageWidths() {
  garage = null;
}

function loadGarage(): Promise<FitVehicle[]> {
  garage ??= myVehicles()
    .then((vs) => vs.map((v) => ({ id: v.id, name: fitName(v), widthIn: v.width_in ?? null })))
    .catch(() => {
      garage = null;
      return [];
    });
  return garage;
}

/** The rider's Garage machines and their widths. Empty when signed out or none has a width. */
export function useGarageWidths(): FitVehicle[] {
  const [list, setList] = useState<FitVehicle[]>([]);
  useEffect(() => {
    let live = true;
    loadGarage().then((vs) => live && setList(vs));
    return () => {
      live = false;
    };
  }, []);
  return list;
}
