import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

import { ACTIVITY_KEY } from '@/core/activities';

// The rider's activity lives in a small file read synchronously at launch, like the appearance, so
// the app opens in the activity's colours with no flash of Offroad red. The same value is mirrored
// to AsyncStorage under ACTIVITY_KEY, which is where account sync reads settings.
const file = () => new File(Paths.document, 'activity.txt');

export function readActivitySync(): string | null {
  try {
    const f = file();
    return f.exists ? f.textSync().trim() : null;
  } catch {
    return null;
  }
}

/** Saves on this device only (lib/activity.ts sends it to the account through settings sync). */
export function writeActivityFile(id: string) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(id);
  } catch {
    // A full disk keeps this activity for the session; the next pick tries again.
  }
}

export const readActivityAsync = () => AsyncStorage.getItem(ACTIVITY_KEY).catch(() => null);
