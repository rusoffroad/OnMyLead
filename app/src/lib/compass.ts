import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * The phone's compass (the way the phone faces, degrees from true north), shared by every map that
 * shows the rider's own dot, so the arrow turns with the rider when they're stopped. One watch for
 * the whole app while any map needs it; only real turns (3 degrees or more) are passed on. The
 * website has no dependable compass, so it gets null and the dot keeps its last GPS direction.
 */
let current: number | null = null;
const listeners = new Set<(deg: number | null) => void>();
let sub: { remove: () => void } | null = null;
let starting = false;
// Asked to start while a look was under way: look again once it ends ('now' when location was
// just allowed, so the look happens at once; 'soon' waits for a retry already set).
let again: false | 'soon' | 'now' = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let retryMs = 5000;

function start() {
  if (Platform.OS === 'web' || sub) return;
  // A look is already under way: look again when it ends, in case it gives up (no maps were
  // left, or location wasn't allowed yet) while a map is waiting now.
  if (starting) {
    again ||= 'soon';
    return;
  }
  starting = true;
  Location.getForegroundPermissionsAsync()
    .then((p) => {
      if (!listeners.size) return null;
      if (p.status !== 'granted') {
        // A map can open before the rider answers the location prompt: look again shortly
        // (not when the answer was a lasting no; the next map that opens asks again).
        if (!p.canAskAgain) return null;
        // Each look waits a little longer, up to 30 s.
        if (!retry) {
          retry = setTimeout(() => {
            retry = null;
            if (listeners.size) start();
          }, retryMs);
          retryMs = Math.min(30_000, retryMs + 5000);
        }
        return null;
      }
      return Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (!(deg >= 0)) return;
        if (current != null && Math.abs(((deg - current + 540) % 360) - 180) < 3) return;
        current = Math.round(deg) % 360;
        listeners.forEach((l) => l(current));
      });
    })
    .then((s) => {
      if (!s) return;
      retryMs = 5000;
      if (listeners.size) sub = s;
      else s.remove();
    })
    .catch(() => {
      // No compass here (or it failed): don't look again for a start that came in meanwhile.
      if (again === 'soon') again = false;
    })
    .finally(() => {
      starting = false;
      const next = again;
      again = false;
      if (next === 'now' && retry) {
        clearTimeout(retry);
        retry = null;
      }
      if (next && !retry && listeners.size && !sub) start();
    });
}

/** Location was just allowed: start the compass now for any map waiting on it. */
export function compassAllowed() {
  if (!listeners.size || sub) return;
  if (retry) clearTimeout(retry);
  retry = null;
  if (starting) again = 'now';
  else start();
}

function stop() {
  sub?.remove();
  sub = null;
  if (retry) clearTimeout(retry);
  retry = null;
  retryMs = 5000;
}

/** The compass heading while the calling component is on screen, or null when there is none. */
export function useCompass(): number | null {
  const [deg, setDeg] = useState<number | null>(current);
  useEffect(() => {
    listeners.add(setDeg);
    start();
    return () => {
      listeners.delete(setDeg);
      if (!listeners.size) stop();
    };
  }, []);
  return deg;
}

/**
 * Whether the compass has given a reading while the calling component is on screen. Changes only
 * once, so a component that needs just this doesn't redraw on every turn.
 */
export function useHasCompass(): boolean {
  const [has, setHas] = useState(current != null);
  useEffect(() => {
    const l = (deg: number | null) => setHas(deg != null);
    listeners.add(l);
    start();
    return () => {
      listeners.delete(l);
      if (!listeners.size) stop();
    };
  }, []);
  return has;
}
