import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';

import {
  newUsageClock, returnUsageBatch, startUsage, stopUsage, takeUsageBatch, tickUsage, USAGE_KINDS, USAGE_TICK_S, usageDevice,
  type UsageClock, type UsageKind,
} from '@/core/usage';
import { isBackendConfigured, supabase } from './supabase';

/*
 * Usage counts for the owner's dashboard (core/usage): app opens and time in front, and Map Mode
 * and Ride Mode sessions and time on screen, for every signed-in rider on every plan. Counts and
 * seconds only; never a location. Nothing here ever shows the rider anything or gets in the way:
 * a server without log_app_usage, no signal or a signed-out app just means nothing is sent.
 */

const device = usageDevice(Platform.OS, Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true);
const clocks: Record<UsageKind, UsageClock> = { app: newUsageClock(), map_mode: newUsageClock(), ride_mode: newUsageClock() };
/** Screens showing each kind right now (Map Mode can sit under another screen in the stack). */
const showing: Record<UsageKind, Set<string>> = { app: new Set(), map_mode: new Set(), ride_mode: new Set() };
let inFront = AppState.currentState === 'active';
let timer: ReturnType<typeof setInterval> | null = null;
let serverLacksIt = false;
let sending = false;
let started = false;

function update(now = Date.now()) {
  for (const k of USAGE_KINDS) {
    const on = inFront && showing[k].size > 0;
    clocks[k] = on ? startUsage(clocks[k], now) : stopUsage(clocks[k], now);
  }
  const running = USAGE_KINDS.some((k) => clocks[k].since != null);
  if (running && !timer) {
    timer = setInterval(() => {
      const t = Date.now();
      for (const k of USAGE_KINDS) clocks[k] = tickUsage(clocks[k], t);
      flush();
    }, USAGE_TICK_S * 1000);
  } else if (!running && timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function flush() {
  if (!isBackendConfigured || serverLacksIt || sending) return;
  sending = true;
  try {
    const { data: auth } = await supabase.auth.getSession();
    for (const k of USAGE_KINDS) {
      const { batch, clock } = takeUsageBatch(clocks[k]);
      if (!batch) continue;
      clocks[k] = clock;
      // Signed out: nobody to file it under.
      if (!auth.session) continue;
      const { error } = await supabase.rpc('log_app_usage', { p_kind: k, p_sessions: batch.sessions, p_seconds: batch.seconds, p_device: device });
      if (!error) continue;
      if (error.code === 'PGRST202' || error.code === '42883' || /does not exist|schema cache/.test(error.message)) {
        serverLacksIt = true; // Older server: stop trying until the next launch.
        return;
      }
      clocks[k] = returnUsageBatch(clocks[k], batch); // No signal: try again on the next tick.
    }
  } catch {
    // Never matters to the rider.
  } finally {
    sending = false;
  }
}

/** Called once from the root layout: the app's own clock runs whenever the app is in front. */
export function startUsageCounts() {
  if (started) return;
  started = true;
  showing.app.add('app');
  update();
  AppState.addEventListener('change', (s) => {
    const front = s === 'active';
    if (front === inFront) return;
    inFront = front;
    update();
    // Going to the background: send what's counted while the app still can.
    if (!front) flush();
  });
}

let nextScreenId = 0;

/** Counts a screen's use while it's on top of the stack and the app is in front. */
export function useScreenUsage(kind: Exclude<UsageKind, 'app'>) {
  useFocusEffect(
    useCallback(() => {
      const id = `${kind}-${nextScreenId++}`;
      showing[kind].add(id);
      update();
      return () => {
        showing[kind].delete(id);
        update();
        flush();
      };
    }, [kind]),
  );
}
