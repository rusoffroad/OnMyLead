import type { Vec3 } from '@/core/tilt';

// Store-screenshot build only: the website has no motion sensors, so this stands in for a phone in
// a dash mount leaning 17° left and 12° nose up (zeroed standing upright, see shoot.mjs).
export type MotionSample = { t: number; gravity: Vec3; userAccel: Vec3 | null };

const RAD = Math.PI / 180;
const roll = -17 * RAD;
const pitch = 12 * RAD;
// Zeroed upright: down = -y, right = +x, forward = out the back (-z).
const gravity: Vec3 = { x: Math.sin(roll) * Math.cos(pitch), y: -Math.cos(roll) * Math.cos(pitch), z: Math.sin(pitch) };
const sample = (): MotionSample => ({ t: Date.now(), gravity, userAccel: { x: 0, y: 0, z: 0 } });

export function subscribeMotion(listener: (s: MotionSample) => void): () => void {
  listener(sample());
  const id = setInterval(() => listener(sample()), 100);
  return () => clearInterval(id);
}

export function latestMotion(): MotionSample | null {
  return sample();
}

export async function motionAvailable(): Promise<boolean> {
  return true;
}
