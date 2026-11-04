import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

// The rider's language lives in a small file read synchronously at launch, before the first
// screen draws, so the app opens straight in the chosen language with no flash of English.
// The same JSON is mirrored to AsyncStorage under LANGUAGE_KEY, which is where account sync reads
// settings (on the website AsyncStorage is this browser's storage, the same key).
const file = () => new File(Paths.document, 'language.json');
export const LANGUAGE_KEY = 'onmylead.language';

export function readLanguageSync(): string | null {
  try {
    const f = file();
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

export function writeLanguage(json: string) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(json);
  } catch {
    // A full disk keeps today's language for this session; the next change tries again.
  }
  AsyncStorage.setItem(LANGUAGE_KEY, json).catch(() => {});
}
