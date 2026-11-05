import { AppState } from 'react-native';

/**
 * Resolves once the app is in the foreground: at once when it already is, otherwise on the next
 * change to active, or after `maxMs` so nothing waits forever. iOS drops a request made while the
 * app is still coming to the front (a notification tap launching it), so a retry waits for this.
 */
export function whenActive(maxMs = 4000): Promise<void> {
  if (AppState.currentState === 'active' || AppState.currentState === 'unknown') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = AppState.addEventListener('change', (s) => s === 'active' && done());
    const timer = setTimeout(done, maxMs);
  });
}
