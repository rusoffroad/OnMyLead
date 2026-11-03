import type { Vec3 } from '@/core/tilt';

/** The website has no tilt meter or Crash Alert: a computer has no motion sensors to read. */

export type MotionSample = { t: number; gravity: Vec3; userAccel: Vec3 | null };

export function subscribeMotion(_listener: (s: MotionSample) => void): () => void {
  return () => {};
}

export function latestMotion(): MotionSample | null {
  return null;
}

export async function motionAvailable(): Promise<boolean> {
  return false;
}
