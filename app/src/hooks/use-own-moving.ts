import { useCallback, useEffect, useRef, useState } from 'react';

import { ownFixStale, ownMovingAt, ownStoppedAfterMs } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (core/heading ownMovingAt):
 * a stopped fix shows the stopped look at once, and since phones stop sending fixes while standing
 * still, so does a while with no new fix (ownStoppedAfterMs, from the map's fix rate
 * `fixEveryMs`). `feed` takes each fix: moving or not, and the fix's own time (ms) when the phone
 * gives one, so a repeated fix is ignored and an old one (a map opening after a stop) counts as
 * stopped.
 */
export function useOwnMoving(fixEveryMs?: number): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const seen = useRef<{ movingAt: number | null; fixAt: number | null }>({ movingAt: null, fixAt: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitMs = useRef(ownStoppedAfterMs(fixEveryMs));
  const arm = (fromMs: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setMoving(false);
    }, Math.max(0, fromMs + waitMs.current - Date.now()));
  };
  useEffect(() => {
    waitMs.current = ownStoppedAfterMs(fixEveryMs);
    // A wait already running takes the new length (Battery Saver switched on mid-ride).
    if (timer.current && seen.current.movingAt != null) arm(seen.current.movingAt);
  }, [fixEveryMs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  const feed = useCallback((isMoving: boolean, fixAtMs?: number) => {
    const now = Date.now();
    const at = fixAtMs ?? now;
    const next = ownMovingAt(seen.current, isMoving && !ownFixStale(at, now, waitMs.current), at, now);
    if (next === seen.current) return;
    seen.current = next;
    setMoving(next.movingAt != null);
    if (next.movingAt != null) arm(next.movingAt);
    else {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [moving, feed];
}
