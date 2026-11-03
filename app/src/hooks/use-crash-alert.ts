import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { crashStep, INITIAL_CRASH, quietAfterAlarm, type CrashCause, type CrashSettings, type CrashState } from '@/core/crash-detect';
import { subscribeTiltSamples } from '@/hooks/use-tilt';

/** A GPS speed older than this counts as unknown (phones go quiet when parked). */
const SPEED_STALE_MS = 3_000;

export type CrashAlarm = { cause: CrashCause; startedAt: number };

/**
 * Crash Alert while Ride Mode is open: watches the shared motion feed and this phone's GPS speed,
 * and raises an alarm when core/crash-detect sees a crash. The screen shows the countdown; `dismiss`
 * is the rider's I'm OK (or the alert having gone out).
 */
export function useCrashAlert(settings: CrashSettings, active: boolean): { alarm: CrashAlarm | null; dismiss: () => void } {
  const [alarm, setAlarm] = useState<CrashAlarm | null>(null);
  const state = useRef<CrashState>(INITIAL_CRASH);
  const speed = useRef<{ mps: number | null; at: number }>({ mps: null, at: 0 });
  const on = active && settings.enabled && Platform.OS !== 'web';
  const sensitivity = settings.sensitivity;

  // Own GPS speed, about once a second, kept off React state (no re-renders).
  useEffect(() => {
    if (!on) return;
    let sub: Location.LocationSubscription | null = null;
    let gone = false;
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (p.status !== 'granted' || gone) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (l) => {
          const v = l.coords.speed;
          speed.current = { mps: v != null && v >= 0 ? v : null, at: Date.now() };
        });
        if (gone) sub.remove();
      })
      .catch(() => {});
    return () => {
      gone = true;
      sub?.remove();
    };
  }, [on]);

  useEffect(() => {
    if (!on) return;
    return subscribeTiltSamples((s, tilt) => {
      const fresh = s.t - speed.current.at <= SPEED_STALE_MS;
      const step = crashStep(
        state.current,
        { t: s.t, userAccel: s.userAccel, roll: tilt?.roll ?? null, pitch: tilt?.pitch ?? null, speedMps: fresh ? speed.current.mps : null },
        sensitivity,
      );
      state.current = step.state;
      if (step.alarm) setAlarm((a) => a ?? { cause: step.alarm!, startedAt: Date.now() });
    });
  }, [on, sensitivity]);

  return {
    alarm,
    dismiss: () => {
      state.current = quietAfterAlarm(state.current, Date.now());
      setAlarm(null);
    },
  };
}
