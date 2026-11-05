import { useCallback, useEffect, useRef, useState } from 'react';

import { OWN_MOVE_START, ownMoveStep, ownMoveTimedOut, ownStopWaitMs } from '@/core/heading';

/**
 * Whether your own dot shows you moving, for every map that draws it (the rule is core/heading
 * ownMoveStep and ownStopWaitMs). `everyMs` is the map's own update interval when it sets one
 * (Ride Mode's battery plans); a change starts the fix gaps over. `feed` takes each fix: moving or
 * not, and the fix's own time (ms) when the phone gives one, so a repeated fix is ignored.
 */
export function useOwnMoving(everyMs?: number): [boolean, (moving: boolean, fixAtMs?: number) => void] {
  const [moving, setMoving] = useState(false);
  const state = useRef(OWN_MOVE_START);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const every = useRef(everyMs);
  const arm = useCallback(() => {
    clearTimeout(timer.current);
    const s = state.current;
    if (!s.moving || s.seenAt == null) return;
    timer.current = setTimeout(() => {
      state.current = ownMoveTimedOut(state.current);
      setMoving(false);
    }, Math.max(0, s.seenAt + ownStopWaitMs(s, every.current) - Date.now()));
  }, []);
  useEffect(() => {
    if (every.current === everyMs) return;
    every.current = everyMs;
    // A new interval (a battery plan picked mid-ride): start the fix gaps over, and a wait already
    // running takes the new length.
    state.current = { ...state.current, gaps: [] };
    arm();
  }, [everyMs, arm]);
  useEffect(() => {
    // Mounting again (a remount that keeps this state) picks the running wait back up.
    arm();
    return () => clearTimeout(timer.current);
  }, [arm]);
  const feed = useCallback((isMoving: boolean, fixAtMs?: number) => {
    const next = ownMoveStep(state.current, isMoving, fixAtMs, Date.now());
    if (next === state.current) return;
    state.current = next;
    setMoving(next.moving);
    arm();
  }, [arm]);
  return [moving, feed];
}
