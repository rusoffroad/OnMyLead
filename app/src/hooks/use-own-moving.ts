import { useCallback, useEffect, useRef, useState } from 'react';

import { OWN_MOVE_START, ownMoveStep, ownStopWaitMs } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (the rule is core/heading
 * ownMoveStep and ownStopWaitMs). `everyMs` is the map's own update interval when it sets one
 * (Ride Mode's battery plans on Android's flat map). `feed` takes each fix: moving or not, and the
 * fix's own time (ms) when the phone gives one, so a repeated fix is ignored.
 */
export function useOwnMoving(everyMs?: number): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const state = useRef(OWN_MOVE_START);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAt = useRef(0);
  const every = useRef(everyMs);
  const arm = useCallback(() => {
    clearTimeout(timer.current);
    if (!state.current.moving) return;
    timer.current = setTimeout(() => {
      state.current = { ...state.current, moving: false };
      setMoving(false);
    }, Math.max(0, lastAt.current + ownStopWaitMs(every.current) - Date.now()));
  }, []);
  useEffect(() => {
    if (every.current === everyMs) return;
    // A new interval (a battery plan picked mid-ride): a wait already running takes the new length.
    every.current = everyMs;
    arm();
  }, [everyMs, arm]);
  useEffect(() => {
    // Mounting again (a remount that keeps this state) picks the running wait back up.
    arm();
    return () => clearTimeout(timer.current);
  }, [arm]);
  const feed = useCallback((isMoving: boolean, fixAtMs?: number) => {
    const next = ownMoveStep(state.current, isMoving, fixAtMs);
    if (next === state.current) return;
    state.current = next;
    lastAt.current = Date.now();
    setMoving(next.moving);
    arm();
  }, [arm]);
  return [moving, feed];
}
