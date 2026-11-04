import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { MAP_TIME_TICK_S, mapClockRuns, mapSecondsLeft, parseMapModeTime, UNLIMITED_MAP_TIME, type MapModeTime } from '@/core/map-mode-time';
import { sharingOnRide } from './location';
import { useEntitlements } from './entitlements';
import { isBackendConfigured, supabase } from './supabase';

/*
 * Map Mode's Free hours (core/map-mode-time). While Map Mode is on screen, the app is in front and
 * the rider isn't on a group ride, the screen reports a minute at a time to the server, which
 * keeps the month's total. Pro, Pro Trial, Admin and an older server have no limit. With no signal
 * the clock keeps counting on the phone and the server catches up on the next report.
 */

async function ask(fn: 'my_map_mode_time' | 'log_map_mode_time', seconds?: number): Promise<MapModeTime | null> {
  if (!isBackendConfigured) return null;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return null;
  const { data, error } = fn === 'log_map_mode_time'
    ? await supabase.rpc(fn, { p_seconds: seconds ?? 0 })
    : await supabase.rpc(fn);
  if (error) {
    // The server doesn't have Map Mode time yet: nothing is limited.
    if (error.code === 'PGRST202' || error.code === '42883' || /does not exist|schema cache/.test(error.message)) return UNLIMITED_MAP_TIME;
    return null;
  }
  return parseMapModeTime(data);
}

/**
 * The Map Mode clock for the screen that's showing. `left` is seconds left this month (null =
 * unlimited); `usedUp` turns true when a Free rider runs out.
 */
export function useMapModeTime(onScreen: boolean): { left: number | null; usedUp: boolean; onGroupRide: boolean } {
  const { ent } = useEntitlements();
  const limited = ent.switchedOn && ent.accountType === 'free';
  const [time, setTime] = useState<MapModeTime>(UNLIMITED_MAP_TIME);
  const [extra, setExtra] = useState(0);
  const [onGroupRide, setOnGroupRide] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const pending = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!limited || !onScreen) return;
    let live = true;
    sharingOnRide().then((r) => live && setOnGroupRide(r));
    ask('my_map_mode_time').then((t) => {
      if (live && t) {
        setTime(t);
        setExtra(0);
      }
    });
    return () => {
      live = false;
    };
  }, [limited, onScreen]);

  const runs = limited && time.allowanceSeconds != null && mapClockRuns({ onScreen, appActive: active, onGroupRide });
  useEffect(() => {
    if (!runs) return;
    const t = setInterval(() => {
      pending.current += MAP_TIME_TICK_S;
      setExtra((x) => x + MAP_TIME_TICK_S);
      // Joined a ride from another screen meanwhile? The clock stops.
      sharingOnRide().then(setOnGroupRide);
      const send = Math.min(pending.current, 120);
      ask('log_map_mode_time', send).then((answer) => {
        if (!answer) return; // No signal: keep counting here; it goes up next time.
        pending.current = Math.max(0, pending.current - send);
        setTime(answer);
        setExtra(pending.current);
      });
    }, MAP_TIME_TICK_S * 1000);
    return () => clearInterval(t);
  }, [runs]);

  const left = limited ? mapSecondsLeft(time, extra) : null;
  return { left, usedUp: left === 0 && !onGroupRide, onGroupRide };
}
