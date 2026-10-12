import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Whether the maps can reach the internet right now. The maps ask a tiny page the phone's own
 * system already uses for its "am I online" check, every 30 seconds while a map is open. Two
 * misses in a row means no signal: the maps then stop asking for new squares and draw only what
 * is saved on the phone, and the satellite map switches to the downloaded aerial photos.
 */
const PROBE = Platform.OS === 'ios' ? 'https://captive.apple.com/hotspot-detect.html' : 'https://connectivitycheck.gstatic.com/generate_204';
const EVERY_MS = 30_000;

async function reachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(PROBE, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useMapSignal(enabled = true): { offline: boolean } {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let misses = 0;
    let alive = true;
    const check = async () => {
      if (AppState.currentState !== 'active') return;
      const ok = await reachable();
      if (!alive) return;
      misses = ok ? 0 : misses + 1;
      setOffline(misses >= 2);
      // Confirm a first miss quickly instead of waiting a full round.
      if (!ok && misses === 1) setTimeout(() => alive && check(), 5000);
    };
    check();
    const timer = setInterval(check, EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled]);

  return { offline };
}
