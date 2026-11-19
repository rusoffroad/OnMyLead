import { ACTIVITY_KEY } from '@/core/activities';

// The website keeps the rider's activity in this browser, read before the first screen draws.
// Same key as AsyncStorage uses on the website, so account sync finds it.

export function readActivitySync(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVITY_KEY);
  } catch {
    return null;
  }
}

/** On the website AsyncStorage is this same localStorage key, so settings sync writes it. */
export function writeActivityFile(_id: string) {}

export const readActivityAsync = async () => readActivitySync();
