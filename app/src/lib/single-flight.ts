/**
 * One run at a time. A call made while a run is in flight queues exactly one more pass after it
 * and resolves (or fails) with that pass, so a change made mid-sync goes up before the caller's
 * promise settles instead of waiting for the next trigger. Used by the settings, trail, waypoint
 * and rider agreement syncs.
 */
export function singleFlight(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  const start = (): Promise<void> => {
    if (running) {
      queued ??= running
        .catch(() => {})
        .then(() => {
          queued = null;
          return start();
        });
      return queued;
    }
    running = run().finally(() => {
      running = null;
    });
    return running;
  };
  return start;
}
