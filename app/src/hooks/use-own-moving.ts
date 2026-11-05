import { useCallback, useEffect, useRef, useState } from 'react';

import { ownFixGaps, ownMovingAt, ownStoppedAfterMs } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (core/heading ownMovingAt):
 * a stopped fix shows the stopped look at once, and since phones stop sending fixes while standing
 * still, so does a while with no new fix: two and a half of the longest recent gap between the
 * fixes this map has been getting (ownStoppedAfterMs), so a slow fix rate (Battery Saver) never
 * flips it mid-ride.
 * `feed` takes each fix: moving or not, and the fix's own time (ms) when the phone gives one, so a
 * repeated fix is ignored.
 */
export function useOwnMoving(): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const seen = useRef<{ movingAt: number | null; fixAt: number | null }>({ movingAt: null, fixAt: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gaps = useRef({ ms: [] as number[], lastAt: null as number | null });
  useEffect(() => () => clearTimeout(timer.current), []);
  const feed = useCallback((isMoving: boolean, fixAtMs?: number) => {
    const now = Date.now();
    const next = ownMovingAt(seen.current, isMoving, fixAtMs ?? now, now);
    if (next === seen.current) return;
    seen.current = next;
    gaps.current = { ms: ownFixGaps(gaps.current.ms, gaps.current.lastAt, now), lastAt: now };
    clearTimeout(timer.current);
    setMoving(next.movingAt != null);
    if (next.movingAt != null) timer.current = setTimeout(() => setMoving(false), ownStoppedAfterMs(Math.max(1000, ...gaps.current.ms)));
  }, []);
  return [moving, feed];
}
