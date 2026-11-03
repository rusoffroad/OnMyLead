// The website keeps the rider's language in this browser, read before the first screen draws.
// Same key as AsyncStorage uses on the website, so account sync finds it.
export const LANGUAGE_KEY = 'onmylead.language';

export function readLanguageSync(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLanguage(json: string) {
  try {
    localStorage.setItem(LANGUAGE_KEY, json);
  } catch {
    // Private window or blocked storage: the choice lasts for this visit.
  }
}
