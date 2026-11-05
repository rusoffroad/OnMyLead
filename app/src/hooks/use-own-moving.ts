import { useCallback, useEffect, useRef, useState } from 'react';

import { OWN_STOPPED_AFTER_MS, ownMovingAt, ownStillMoving } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (core/heading ownMovingAt):
 * phones stop sending fixes while standing still, so with no new moving fix for a while the dot
 * takes its stopped look. `feed` takes each fix: moving or not, and the fix's own time (ms) when
 * the phone gives one, so a repeated fix is ignored.
 */
export function useOwnMoving(): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const seen = useRef<{ movingAt: number | null; fixAt: number | null }>({ movingAt: null, fixAt: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const feed = useCallback((isMoving: boolean, fixAtMs = Date.now()) => {
    const now = Date.now();
    const next = ownMovingAt(seen.current, isMoving, fixAtMs, now);
    if (next === seen.current) return;
    seen.current = next;
    const on = ownStillMoving(next.movingAt, now);
    setMoving(on);
    clearTimeout(timer.current);
    if (on && next.movingAt != null) {
      timer.current = setTimeout(() => setMoving(false), next.movingAt + OWN_STOPPED_AFTER_MS - now);
    }
  }, []);
  return [moving, feed];
}
