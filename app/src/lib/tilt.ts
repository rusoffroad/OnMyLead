import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { DEFAULT_CRASH_SETTINGS, parseCrashSettings, type CrashSettings } from '@/core/crash-detect';
import {
  DEFAULT_TILT_LIMITS,
  parseCalibration,
  parseLimits,
  TILT_CALIBRATION_KEY,
  TILT_LIMITS_KEY,
  TILT_VOICE_KEY,
  calibrate,
  type TiltCalibration,
  type TiltLimits,
  type Vec3,
} from '@/core/tilt';

/**
 * Tilt meter and Crash Alert settings. Warning angles, voice and Crash Alert follow the rider's
 * account (Sync across devices reads these keys); the Zero stays on this device, because each
 * phone sits in its own mount at its own angle.
 */

export const CRASH_KEY = 'crash.alert';
/** Show the Tilt tile in Map Mode and Ride Mode (on unless the rider hides it). */
export const TILT_SHOW_KEY = 'tilt.show';
/** Buzz (and speak, with voice on) past the warning angles. Riders on motorcycles turn this off. */
export const TILT_WARN_KEY = 'tilt.warn';

export type TiltSettings = {
  limits: TiltLimits;
  voice: boolean;
  show: boolean;
  warn: boolean;
  calibration: TiltCalibration | null;
  crash: CrashSettings;
};

let settings: TiltSettings = { limits: DEFAULT_TILT_LIMITS, voice: false, show: true, warn: true, calibration: null, crash: DEFAULT_CRASH_SETTINGS };
let loaded: Promise<TiltSettings> | null = null;
const listeners = new Set<(s: TiltSettings) => void>();

function emit() {
  listeners.forEach((l) => l(settings));
}

export function loadTiltSettings(): Promise<TiltSettings> {
  loaded ??= AsyncStorage.multiGet([TILT_LIMITS_KEY, TILT_VOICE_KEY, TILT_SHOW_KEY, TILT_WARN_KEY, TILT_CALIBRATION_KEY, CRASH_KEY])
    .then((rows) => {
      const v = Object.fromEntries(rows);
      settings = {
        limits: parseLimits(v[TILT_LIMITS_KEY] ?? null),
        voice: v[TILT_VOICE_KEY] === 'true',
        show: v[TILT_SHOW_KEY] !== 'false',
        warn: v[TILT_WARN_KEY] !== 'false',
        calibration: parseCalibration(v[TILT_CALIBRATION_KEY] ?? null),
        crash: parseCrashSettings(v[CRASH_KEY] ?? null),
      };
      emit();
      return settings;
    })
    .catch(() => settings);
  return loaded;
}

function save(patch: Partial<TiltSettings>, key: string, value: string | null) {
  settings = { ...settings, ...patch };
  loaded = Promise.resolve(settings);
  emit();
  (value == null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value)).catch(() => {});
}

export function setTiltLimits(limits: TiltLimits) {
  save({ limits }, TILT_LIMITS_KEY, JSON.stringify(limits));
}

export function setTiltVoice(voice: boolean) {
  save({ voice }, TILT_VOICE_KEY, JSON.stringify(voice));
}

export function setTiltShown(show: boolean) {
  save({ show }, TILT_SHOW_KEY, JSON.stringify(show));
}

export function setTiltWarnings(warn: boolean) {
  save({ warn }, TILT_WARN_KEY, JSON.stringify(warn));
}

export function setCrashSettings(crash: CrashSettings) {
  save({ crash }, CRASH_KEY, JSON.stringify(crash));
}

/** Zero: this gravity reading becomes level. False when the reading can't be used. */
export function zeroTilt(gravity: Vec3): boolean {
  const calibration = calibrate(gravity);
  if (!calibration) return false;
  save({ calibration }, TILT_CALIBRATION_KEY, JSON.stringify({ gravity }));
  return true;
}

/** Back to the phone's own level (lying flat). */
export function clearZero() {
  save({ calibration: null }, TILT_CALIBRATION_KEY, null);
}

export function useTiltSettings(): TiltSettings {
  const [s, setS] = useState(settings);
  useEffect(() => {
    listeners.add(setS);
    loadTiltSettings().then(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}
