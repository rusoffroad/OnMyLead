import { useCallback, useEffect, useRef, useState } from 'react';

import { OWN_MOVE_START, ownMoveStep, ownMoveTimedOut, ownStopWaitMs } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (the rule is core/heading
 * ownMoveStep and ownStopWaitMs). `feed` takes each fix: moving or not, and the fix's own time (ms)
 * when the phone gives one, so a repeated fix is ignored.
 */
export function useOwnMoving(): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const state = useRef(OWN_MOVE_START);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const feed = useCallback((isMoving: boolean, fixAtMs?: number) => {
    const now = Date.now();
    const next = ownMoveStep(state.current, isMoving, fixAtMs ?? now, now);
    if (next === state.current) return;
    state.current = next;
    clearTimeout(timer.current);
    setMoving(next.moving);
    if (next.moving) {
      timer.current = setTimeout(() => {
        state.current = ownMoveTimedOut(state.current);
        setMoving(false);
      }, ownStopWaitMs(next));
    }
  }, []);
  return [moving, feed];
}
