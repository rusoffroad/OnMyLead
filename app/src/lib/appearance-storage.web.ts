// The website keeps the rider's appearance in this browser, read before the first screen draws.
// Same key as AsyncStorage uses on the website, so account sync finds it.
export const APPEARANCE_KEY = 'onmylead.appearance';
const KEY = APPEARANCE_KEY;

export function readAppearanceSync(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeAppearance(json: string) {
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // Private window or blocked storage: the choice lasts for this visit.
  }
}
