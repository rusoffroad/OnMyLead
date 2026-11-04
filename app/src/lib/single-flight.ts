/**
 * One run at a time. A call made while a run is in flight returns that run and queues exactly one
 * more after it, so a change made mid-sync goes up in the next pass instead of waiting for the
 * next trigger. Used by the settings, trail, waypoint and rider agreement syncs.
 */
export function singleFlight(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const start = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = run().finally(() => {
      running = null;
      if (again) {
        again = false;
        // Nobody awaits the queued pass, so its failure is swallowed (the first pass reports its own).
        start().catch(() => {});
      }
    });
    return running;
  };
  return start;
}
