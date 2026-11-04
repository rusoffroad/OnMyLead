import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';

import {
  defaultCalibration,
  EMPTY_MAX,
  INITIAL_WARN,
  overallLevel,
  smoothTilt,
  stepWarning,
  tiltFrom,
  trackMax,
  type Tilt,
  type TiltLevel,
  type TiltMax,
  type WarnState,
} from '@/core/tilt';
import { subscribeMotion, type MotionSample } from '@/lib/motion';
import { loadTiltSettings, type TiltSettings } from '@/lib/tilt';
import { speak } from '@/lib/voice';

/**
 * The live tilt reading, shared by the Map Mode and Ride Mode tiles and the Tilt screen: one
 * sensor feed, one set of warnings (so two screens on at once never double-buzz), one Max.
 */

export type TiltReading = {
  tilt: Tilt | null;
  /** 'ok' until the rider has zeroed: an unzeroed reading is only roughly level, so no colours. */
  level: TiltLevel;
  max: TiltMax;
  /** False until the rider taps Zero; warnings and Crash Alert's rollover check wait for it. */
  zeroed: boolean;
};

let settings: TiltSettings | null = null;
let smoothed: Tilt | null = null;
let shown: TiltReading = { tilt: null, level: 'ok', max: EMPTY_MAX, zeroed: false };
let warn: WarnState = INITIAL_WARN;
let lastEmit = 0;
const readers = new Set<(r: TiltReading) => void>();
const rawListeners = new Set<(s: MotionSample, tilt: Tilt | null, zeroed: boolean) => void>();
let stopMotion: (() => void) | null = null;

/** Screen updates at most 10 a second, so the map behind the tile stays smooth. */
const EMIT_MS = 100;

function onMotion(s: MotionSample) {
  // Before Zero, level is the phone's nearest plain position (flat, upright or on its side), so a
  // phone standing in a mount doesn't read 90° nose up.
  const zeroed = !!settings?.calibration;
  const cal = settings?.calibration ?? defaultCalibration(s.gravity);
  const raw = cal ? tiltFrom(s.gravity, cal) : null;
  if (raw) smoothed = smoothTilt(smoothed, raw, 0.25);
  rawListeners.forEach((l) => l(s, smoothed, zeroed));
  if (!smoothed || !settings) return;
  const max = trackMax(shown.max, smoothed);
  const step = stepWarning(warn, smoothed, settings.limits, s.t);
  warn = step.state;
  if (step.announce && settings.show && settings.warn && zeroed) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (settings.voice) speak(step.announce.text);
  }
  if (s.t - lastEmit < EMIT_MS && max === shown.max) return;
  lastEmit = s.t;
  shown = { tilt: smoothed, level: zeroed ? overallLevel(smoothed, settings.limits) : 'ok', max, zeroed };
  readers.forEach((r) => r(shown));
}

function retain(): () => void {
  if (!stopMotion) stopMotion = subscribeMotion(onMotion);
  return () => {
    if (!readers.size && !rawListeners.size) {
      stopMotion?.();
      stopMotion = null;
      smoothed = null;
    }
  };
}

/** Keeps the shared feed in step with saved settings (limits, voice, Zero). */
export function applyTiltSettings(next: TiltSettings) {
  const zeroChanged = settings?.calibration !== next.calibration;
  settings = next;
  if (zeroChanged) smoothed = null;
}
loadTiltSettings().then(applyTiltSettings);

/** Clears the Max readout. */
export function resetTiltMax() {
  shown = { ...shown, max: EMPTY_MAX };
  readers.forEach((r) => r(shown));
}

/** The live reading; the sensors run while any screen uses it. */
export function useTilt(settingsNow: TiltSettings, on = true): TiltReading {
  const [r, setR] = useState(shown);
  useEffect(() => {
    applyTiltSettings(settingsNow);
  }, [settingsNow]);
  useEffect(() => {
    if (!on) return;
    readers.add(setR);
    const release = retain();
    return () => {
      readers.delete(setR);
      release();
    };
  }, [on]);
  return r;
}

/** Every motion sample plus the current tilt, for Crash Alert (which needs the fast hits). */
export function subscribeTiltSamples(l: (s: MotionSample, tilt: Tilt | null, zeroed: boolean) => void): () => void {
  rawListeners.add(l);
  const release = retain();
  return () => {
    rawListeners.delete(l);
    release();
  };
}
