/**
 * One run at a time. A call made while a run is in flight queues exactly one more pass after it
 * and resolves (or fails) with that pass, so a change made mid-sync goes up before the caller's
 * promise settles instead of waiting for the next trigger. Used by the settings, trail, waypoint
 * and rider agreement syncs.
 */
export function singleFlight(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let queued: { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } | null = null;
  const start = (): Promise<void> => {
    if (running) {
      if (!queued) {
        let resolve: () => void = () => {};
        let reject: (e: unknown) => void = () => {};
        const promise = new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        queued = { promise, resolve, reject };
      }
      return queued.promise;
    }
    running = run().finally(() => {
      running = null;
      // Started right here, before any other caller can get a word in, so one change is one pass.
      const next = queued;
      queued = null;
      if (next) {
        try {
          start().then(next.resolve, next.reject);
        } catch (e) {
          next.reject(e);
        }
      }
    });
    return running;
  };
  return start;
}
