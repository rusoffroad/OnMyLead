import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

// The rider's appearance lives in a small file read synchronously at launch, before the first
// screen draws, so the app opens straight into the chosen theme with no flash of the default.
// The same JSON is mirrored to AsyncStorage under APPEARANCE_KEY, which is where account sync reads
// settings (on the website AsyncStorage is this browser's storage, the same key).
const file = () => new File(Paths.document, 'appearance.json');
export const APPEARANCE_KEY = 'onmylead.appearance';

export function readAppearanceSync(): string | null {
  try {
    const f = file();
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

export function writeAppearance(json: string) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(json);
  } catch {
    // A full disk keeps today's look for this session; the next change tries again.
  }
  AsyncStorage.setItem(APPEARANCE_KEY, json).catch(() => {});
}
