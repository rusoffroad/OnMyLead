import { DeviceMotion } from 'expo-sensors';

import type { Vec3 } from '@/core/tilt';

/**
 * One shared feed from the phone's motion sensors (expo-sensors DeviceMotion), for the tilt meter
 * and Crash Alert. Works with no signal: it never touches the network.
 *
 * Both platforms report accelerationIncludingGravity with gravity pointing at the ground (iOS from
 * Core Motion, Android after Expo flips the accelerometer), so gravity = including - user
 * acceleration on both. A flat phone, screen up, reads gravity of about (0, 0, -9.8).
 */

export type MotionSample = { t: number; gravity: Vec3; userAccel: Vec3 | null };

/** 20 updates a second: smooth for the gauge, quick enough to catch a hit. */
const INTERVAL_MS = 50;

const listeners = new Set<(s: MotionSample) => void>();
let sub: { remove: () => void } | null = null;
let last: MotionSample | null = null;

const vec = (v: { x: number; y: number; z: number } | null | undefined): Vec3 | null =>
  v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) ? { x: v.x, y: v.y, z: v.z } : null;

function start() {
  if (sub) return;
  DeviceMotion.setUpdateInterval(INTERVAL_MS);
  sub = DeviceMotion.addListener((m) => {
    const incl = vec(m.accelerationIncludingGravity);
    if (!incl) return;
    const user = vec(m.acceleration);
    const gravity = user ? { x: incl.x - user.x, y: incl.y - user.y, z: incl.z - user.z } : incl;
    last = { t: Date.now(), gravity, userAccel: user };
    listeners.forEach((l) => l(last!));
  });
}

function stop() {
  sub?.remove();
  sub = null;
}

/** Listen to motion updates; the sensors run only while someone listens. Returns the unsubscribe. */
export function subscribeMotion(listener: (s: MotionSample) => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop();
  };
}

/** The newest reading, for Zero. */
export function latestMotion(): MotionSample | null {
  return last;
}

/** False on phones with no motion sensors (and on the website). */
export async function motionAvailable(): Promise<boolean> {
  try {
    return await DeviceMotion.isAvailableAsync();
  } catch {
    return false;
  }
}
