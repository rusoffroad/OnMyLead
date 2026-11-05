import { useCallback, useEffect, useRef, useState } from 'react';

import { ownMovingAt, ownStillMoving, ownStoppedAfterMs } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (core/heading ownMovingAt):
 * a stopped fix shows the stopped look at once, and since phones stop sending fixes while standing
 * still, so does a while with no new fix (ownStoppedAfterMs, from the map's fix rate
 * `fixEveryMs`). `feed` takes each fix: moving or not, and the fix's own time (ms) when the phone
 * gives one, so a repeated fix is ignored.
 */
export function useOwnMoving(fixEveryMs?: number): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const seen = useRef<{ movingAt: number | null; fixAt: number | null }>({ movingAt: null, fixAt: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitMs = useRef(ownStoppedAfterMs(fixEveryMs));
  useEffect(() => {
    waitMs.current = ownStoppedAfterMs(fixEveryMs);
  }, [fixEveryMs]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const feed = useCallback((isMoving: boolean, fixAtMs = Date.now()) => {
    const now = Date.now();
    const next = ownMovingAt(seen.current, isMoving, fixAtMs, now);
    if (next === seen.current) return;
    seen.current = next;
    const on = ownStillMoving(next.movingAt, now, waitMs.current);
    setMoving(on);
    clearTimeout(timer.current);
    if (on) timer.current = setTimeout(() => setMoving(false), waitMs.current);
  }, []);
  return [moving, feed];
}
