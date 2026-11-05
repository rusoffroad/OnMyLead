import { useCallback, useEffect, useRef, useState } from 'react';

import { OWN_STOPPED_AFTER_MS, ownMovingAt } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (core/heading ownMovingAt):
 * a stopped fix shows the stopped look at once, and since phones stop sending fixes while standing
 * still, so does a while with no new fix. `feed` takes each fix: moving or not, and the fix's own
 * time (ms) when the phone gives one, so a repeated fix is ignored.
 */
export function useOwnMoving(): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const seen = useRef<{ movingAt: number | null; fixAt: number | null }>({ movingAt: null, fixAt: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arm = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setMoving(false);
    }, OWN_STOPPED_AFTER_MS);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const feed = useCallback((isMoving: boolean, fixAtMs = Date.now()) => {
    const next = ownMovingAt(seen.current, isMoving, fixAtMs, Date.now());
    if (next === seen.current) {
      // A repeat of the last fix; still make sure a moving dot will time out.
      if (next.movingAt != null && !timer.current) arm();
      return;
    }
    seen.current = next;
    const on = next.movingAt != null;
    setMoving(on);
    if (on) arm();
    else {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);
  return [moving, feed];
}
