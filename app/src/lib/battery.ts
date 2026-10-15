import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { BATTERY_PLANS, DEFAULT_BATTERY_MODE, parseBatteryMode, type BatteryMode, type BatteryPlan } from '@/core/battery';

/**
 * This phone's Battery Saver choice (core/battery.ts). Kept on the phone, not the account: it is
 * about this phone's battery, and the background location task must read it with no service.
 */

const KEY = 'battery.mode.v1';
let mode: BatteryMode = DEFAULT_BATTERY_MODE;
let loaded: Promise<BatteryMode> | null = null;
const listeners = new Set<(m: BatteryMode) => void>();

/** The saved choice, read once per launch (the location task can run before any screen does). */
export function loadBatteryMode(): Promise<BatteryMode> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((v) => {
      mode = parseBatteryMode(v);
      listeners.forEach((l) => l(mode));
      return mode;
    })
    .catch(() => mode);
  return loaded;
}

/** The plan in force, after the saved choice has been read. */
export async function batteryPlan(): Promise<BatteryPlan> {
  return BATTERY_PLANS[await loadBatteryMode()];
}

export function setBatteryMode(next: BatteryMode) {
  mode = next;
  loaded = Promise.resolve(next);
  listeners.forEach((l) => l(mode));
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

/** The current choice, kept in step with every screen. */
export function useBatteryMode(): BatteryMode {
  const [m, setM] = useState(mode);
  useEffect(() => {
    listeners.add(setM);
    loadBatteryMode().then(setM);
    return () => void listeners.delete(setM);
  }, []);
  return m;
}
