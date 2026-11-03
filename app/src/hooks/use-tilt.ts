import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';

import {
  EMPTY_MAX,
  FLAT_CALIBRATION,
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

/**
 * The live tilt reading, shared by the Map Mode and Ride Mode tiles and the Tilt screen: one
 * sensor feed, one set of warnings (so two screens on at once never double-buzz), one Max.
 */

export type TiltReading = { tilt: Tilt | null; level: TiltLevel; max: TiltMax };

let settings: TiltSettings | null = null;
let smoothed: Tilt | null = null;
let shown: TiltReading = { tilt: null, level: 'ok', max: EMPTY_MAX };
let warn: WarnState = INITIAL_WARN;
let lastEmit = 0;
const readers = new Set<(r: TiltReading) => void>();
const rawListeners = new Set<(s: MotionSample, tilt: Tilt | null) => void>();
let stopMotion: (() => void) | null = null;

/** Screen updates at most 10 a second, so the map behind the tile stays smooth. */
const EMIT_MS = 100;

function onMotion(s: MotionSample) {
  const cal = settings?.calibration ?? FLAT_CALIBRATION;
  const raw = tiltFrom(s.gravity, cal);
  if (raw) smoothed = smoothTilt(smoothed, raw, 0.25);
  rawListeners.forEach((l) => l(s, smoothed));
  if (!smoothed || !settings) return;
  const max = trackMax(shown.max, smoothed);
  const step = stepWarning(warn, smoothed, settings.limits, s.t);
  warn = step.state;
  if (step.announce && settings.warn) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (settings.voice) Speech.speak(step.announce.text);
  }
  if (s.t - lastEmit < EMIT_MS && max === shown.max) return;
  lastEmit = s.t;
  shown = { tilt: smoothed, level: overallLevel(smoothed, settings.limits), max };
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
export function subscribeTiltSamples(l: (s: MotionSample, tilt: Tilt | null) => void): () => void {
  rawListeners.add(l);
  const release = retain();
  return () => {
    rawListeners.delete(l);
    release();
  };
}
